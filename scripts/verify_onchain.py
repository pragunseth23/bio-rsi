"""Verify an export without the running app or its database. No wallet key needed."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from verify_export import check, canonical

ROOT = Path(__file__).resolve().parents[1]


def verify(path, trusted_contract):
    data = json.loads(Path(path).read_text())
    count = check(data)
    if not count:
        raise ValueError("Export contains no records")
    for e in data["experiments"]:
        if e["proof"].get("contract_address", "").lower() != trusted_contract.lower():
            raise ValueError("Export registry differs from the independently supplied trusted contract")
        if not e["proof"].get("chain_id") or not e["proof"].get("contract_address"):
            raise ValueError("Export has no onchain anchor")
        payload = {**e["proof"], "record": e["record"], "hash": e["hash"], "canonical_json": json.dumps(canonical(e["record"]), sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)}
        result = subprocess.run(["node", "--env-file-if-exists=.env", "scripts/chain.mjs", "verify"], cwd=ROOT, input=json.dumps(payload), capture_output=True, text=True, timeout=120)
        checked = json.loads(result.stdout)
        if result.returncode or not checked.get("matches"):
            raise ValueError(f"Generation {e['record']['iteration']} failed onchain verification: {checked.get('error', 'storage, event or confirmations mismatch')}")
    print(f"Verified {count} canonical records, ancestor links, contract tuples and receipt events on chain {data['experiments'][0]['proof']['chain_id']}.")


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("export")
        parser.add_argument("--contract", required=True, help="Registry address from the deployment manifest or independently trusted source")
        args = parser.parse_args()
        verify(args.export, args.contract)
    except (ValueError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
