import asyncio
import json
import os
from pathlib import Path
from .records import canonical_json

ROOT = Path(__file__).resolve().parents[1]
NETWORKS = {"bsc-testnet": 97, "opbnb-testnet": 5611, "base-sepolia": 84532}


def network():
    mode = os.getenv("CHAIN_NETWORK", "bsc-testnet")
    if mode not in NETWORKS:
        raise RuntimeError("Unsupported CHAIN_NETWORK; only testnets are allowed")
    return {"network": mode, "chain_id": NETWORKS[mode]}


def configured():
    return bool(os.getenv("WALLET_PRIVATE_KEY") and os.getenv("CONTRACT_ADDRESS"))


async def bridge(action, exp=None):
    payload = {} if exp is None else {"record": exp["record"], "canonical_json": canonical_json(exp["record"]), "hash": exp["hash"], **exp["proof"]}
    process = await asyncio.create_subprocess_exec("node", str(ROOT / "scripts/chain.mjs"), action, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, cwd=ROOT)
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(json.dumps(payload).encode()), timeout=120)
        result = json.loads(stdout)
        if result.get("error") or process.returncode:
            raise RuntimeError(result.get("error", "Blockchain operation failed"))
        return result
    except (asyncio.TimeoutError, asyncio.CancelledError) as error:
        if process.returncode is None:
            process.kill()
            await process.wait()
        if isinstance(error, asyncio.CancelledError):
            raise
        raise RuntimeError("RPC timed out; retry will reconcile the persisted transaction.")
