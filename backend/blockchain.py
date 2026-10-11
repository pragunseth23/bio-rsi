import asyncio
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def configured():
    return all(os.getenv(k) for k in ["BASE_SEPOLIA_RPC_URL", "WALLET_PRIVATE_KEY", "CONTRACT_ADDRESS"])


async def bridge(action, exp):
    process = await asyncio.create_subprocess_exec("node", str(ROOT / "scripts/chain.mjs"), action, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, cwd=ROOT)
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(json.dumps({"record": exp["record"], "hash": exp["hash"], **exp["proof"]}).encode()), timeout=140)
        result = json.loads(stdout)
        if result.get("error") or process.returncode:
            raise RuntimeError(result.get("error", "Blockchain operation failed"))
        return result
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise RuntimeError("RPC confirmation timed out; retry to reconcile transaction.")
