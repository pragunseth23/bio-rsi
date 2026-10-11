"""Execute the real compiled Solidity bytecode against a local in-memory EVM."""
import json
import subprocess
from pathlib import Path
import pytest

web3 = pytest.importorskip("web3")
pytest.importorskip("eth_tester")
ROOT = Path(__file__).resolve().parents[2]


def test_contract_commits_enforces_lineage_and_owner():
    subprocess.run(["node", "scripts/chain.mjs", "compile"], cwd=ROOT, check=True, capture_output=True)
    artifact = json.loads((ROOT / "contracts/artifacts/ProofOfDiscovery.json").read_text())
    w3 = web3.Web3(web3.Web3.EthereumTesterProvider())
    owner, stranger = w3.eth.accounts[:2]
    factory = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["evm"]["bytecode"]["object"])
    receipt = w3.eth.wait_for_transaction_receipt(factory.constructor().transact({"from": owner}))
    contract = w3.eth.contract(address=receipt.contractAddress, abi=artifact["abi"])
    run, candidate, first, second = [bytes([n]) * 32 for n in [1, 2, 3, 4]]
    zero = bytes(32)
    receipt = w3.eth.wait_for_transaction_receipt(contract.functions.commit(run, 0, candidate, -12345678, zero, first).transact({"from": owner}))
    assert receipt.status == 1
    event = contract.events.ExperimentCommitted().process_receipt(receipt)[0]["args"]
    assert event["recordHash"] == first and event["parentHash"] == zero
    assert contract.functions.experiments(first).call() == [run, 0, candidate, -12345678, zero]
    assert contract.functions.exists(first).call()
    for args, account in [([run, 1, candidate, 1, first, second], stranger), ([run, 2, candidate, 1, first, second], owner), ([run, 1, candidate, 1, zero, second], owner), ([run, 1, candidate, 1, first, first], owner)]:
        with pytest.raises(Exception, match="execution reverted"):
            contract.functions.commit(*args).transact({"from": account})
    contract.functions.commit(run, 1, candidate, 90000000, first, second).transact({"from": owner})
    assert contract.functions.heads(run).call() == second
    assert contract.functions.counts(run).call() == 2
