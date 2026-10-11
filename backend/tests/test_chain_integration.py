"""Optional real viem → JSON-RPC → Solidity integration, no public testnet funds.
Start: npm exec --yes --package ganache -- ganache --server.port 8545 --chain.chainId 97 --wallet.deterministic --logging.quiet
Run: CHAIN_TEST_RPC=http://127.0.0.1:8545 .venv/bin/python -m pytest backend/tests/test_chain_integration.py -q
"""
import asyncio
import copy
import json
import os
import subprocess
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend import main, blockchain
from backend.records import Store

web3 = pytest.importorskip("web3")
RPC = os.getenv("CHAIN_TEST_RPC")
pytestmark = pytest.mark.skipif(not RPC, reason="Set CHAIN_TEST_RPC to the local Ganache endpoint")
ROOT = Path(__file__).resolve().parents[2]


def test_real_signed_outbox_recovery_and_independent_verification(tmp_path, monkeypatch):
    # Well-known fixture key: exclusively funded by a local development node.
    key = "0x" + "11" * 32
    w3 = web3.Web3(web3.Web3.HTTPProvider(RPC))
    owner = w3.eth.account.from_key(key).address
    w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction({"from": w3.eth.accounts[0], "to": owner, "value": w3.to_wei(5, "ether")}))
    initial_nonce = w3.eth.get_transaction_count(owner)
    for name, value in {"CHAIN_NETWORK": "bsc-testnet", "CHAIN_RPC_URL": RPC, "WALLET_PRIVATE_KEY": key, "CHAIN_CONFIRMATIONS": "1", "DEPLOYMENT_DIRECTORY": str(tmp_path), "ITERATION_DELAY": "0"}.items():
        monkeypatch.setenv(name, value)
    deploy = subprocess.run(["node", "scripts/chain.mjs", "deploy"], cwd=ROOT, capture_output=True, text=True)
    manifest = json.loads(deploy.stdout)
    assert deploy.returncode == 0, manifest
    monkeypatch.setenv("CONTRACT_ADDRESS", manifest["contract_address"])
    monkeypatch.setattr(main, "store", Store(tmp_path / "test.sqlite"))
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    original = blockchain.bridge
    failed = False
    async def interrupted(action, exp=None):
        nonlocal failed
        result = await original(action, exp)
        if action == "broadcast" and not failed:
            failed = True
            # Simulate losing the RPC response after the actual transaction landed.
            raise RuntimeError("Injected lost broadcast response")
        return result
    monkeypatch.setattr(blockchain, "bridge", interrupted)
    with TestClient(main.app) as client:
        health = client.get('/api/health').json()
        assert health['chain']['ready'] and health['chain']['chain_id'] == 97
        response = client.post('/api/runs', json={"iterations": 2})
        assert response.status_code == 201, response.json()
        run = response.json()
        url = f"/api/runs/{run['id']}"
        for _ in range(400):
            exps = client.get(url + '/experiments').json()
            if len(exps) == 3 and all(e['proof']['status'] == 'failed' for e in exps): break
            time.sleep(.05)
        assert len(exps) == 3
        first = exps[0]
        assert main.store.intent(first['record']['id'])
        assert all(not e['proof'].get('transaction_hash') for e in exps[1:])
        original_hash = first['proof']['transaction_hash']
    # Restart recovers pending persisted intent. Failed work stays explicit/manual.
    with TestClient(main.app) as client:
        assert client.post(url + '/retry').status_code == 200
        for _ in range(800):
            exps = client.get(url + '/experiments').json()
            if len(exps) == 3 and all(e['proof']['status'] == 'verified' for e in exps): break
            time.sleep(.05)
        assert all(e['proof']['status'] == 'verified' for e in exps), exps
        assert exps[0]['proof']['transaction_hash'] == original_hash
        assert w3.eth.get_transaction_count(owner) == initial_nonce + 4  # deployment + exactly 3 commits
        for e in exps:
            result = client.post('/api/verify/' + e['record']['id']).json()
            assert result['onchain_matches'] and result['onchain']['event_matches'] and result['onchain']['storage_matches']
        exported = client.get(url + '/export').json()
        assert 'serialized_transaction' not in json.dumps(exported)
        export_path = tmp_path / 'export.json'
        export_path.write_text(json.dumps(exported))
        readonly_env = {k: v for k, v in os.environ.items() if k != "WALLET_PRIVATE_KEY"}
        verified = subprocess.run([str(ROOT / '.venv/bin/python'), 'scripts/verify_onchain.py', str(export_path), '--contract', manifest['contract_address']], cwd=ROOT, env=readonly_env, capture_output=True, text=True)
        assert verified.returncode == 0, verified.stderr
        changed = copy.deepcopy(exported)
        changed['experiments'][1]['record']['fitness'] += .1
        export_path.write_text(json.dumps(changed))
        rejected = subprocess.run([str(ROOT / '.venv/bin/python'), 'scripts/verify_onchain.py', str(export_path), '--contract', manifest['contract_address']], cwd=ROOT, capture_output=True, text=True)
        assert rejected.returncode != 0 and 'Integrity failure' in rejected.stderr
        e = exps[-1]
        # A different record's successful receipt must never verify this record.
        bad = copy.deepcopy(e)
        bad['proof']['transaction_hash'] = original_hash
        assert not asyncio.run(original('verify', bad))['matches']
        monkeypatch.setenv('CHAIN_CONFIRMATIONS', '3')
        assert not asyncio.run(original('verify', e))['matches']
        w3.provider.make_request('evm_mine', [])
        w3.provider.make_request('evm_mine', [])
        assert asyncio.run(original('verify', e))['matches']
        # Signed negative fitness uses the exact canonical encoding.
        monkeypatch.setenv('CHAIN_CONFIRMATIONS', '1')
        negative = client.post('/api/runs', json={'iterations': 1, 'objective': 'logp'}).json()
        for _ in range(500):
            neg = client.get(f"/api/runs/{negative['id']}/experiments").json()
            if len(neg) == 2 and all(x['proof']['status'] == 'verified' for x in neg): break
            time.sleep(.05)
        assert len(neg) == 2 and all(x['proof']['status'] == 'verified' for x in neg)
        assert neg[0]['record']['fitness'] < 0
    # A crash between persisting a prepared intent and broadcasting resumes automatically.
    import uuid
    from backend.records import digest
    restored = copy.deepcopy(exps[0])
    rid = str(uuid.uuid4())
    restored['record'].update(run_id=rid, id=f'{rid}:0')
    restored['hash'] = digest(restored['record'])
    restored['proof'] = {'status': 'pending', 'chain_id': 97, 'contract_address': manifest['contract_address']}
    main.store.save_run({**run, 'id': rid, 'status': 'completed'})
    main.store.save_experiment(restored)
    prepared = asyncio.run(original('prepare', restored))
    raw = prepared.pop('serialized_transaction')
    restored['proof'].update(prepared)
    main.store.save_intent(restored, {'serialized_transaction': raw})
    with TestClient(main.app) as client:
        for _ in range(400):
            resumed = main.store.experiment(f'{rid}:0')
            if resumed['proof']['status'] == 'verified': break
            time.sleep(.05)
        assert resumed['proof']['status'] == 'verified', resumed
        assert resumed['proof']['transaction_hash'] == prepared['transaction_hash']
    monkeypatch.setenv('WALLET_PRIVATE_KEY', '0x' + '22' * 32)
    with pytest.raises(RuntimeError, match='not the contract owner'):
        asyncio.run(original('status'))
    monkeypatch.setenv('WALLET_PRIVATE_KEY', key)
    # Wrong RPC network is rejected before signing.
    monkeypatch.setenv('CHAIN_NETWORK', 'opbnb-testnet')
    with pytest.raises(RuntimeError, match='chain ID must be 5611'):
        asyncio.run(original('status'))
