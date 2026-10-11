"""Independent verifier: Python standard library only. Run against exported JSON."""
import hashlib
import json
import sys


def canonical(v):
    if isinstance(v, float):
        return format(v, ".8f")
    if isinstance(v, dict):
        return {k: canonical(x) for k, x in v.items()}
    if isinstance(v, list):
        return [canonical(x) for x in v]
    return v


def check(data):
    parent = "0x" + "0" * 64
    for i, e in enumerate(data["experiments"]):
        r = e["record"]
        encoded = json.dumps(canonical(r), sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
        expected = "0x" + hashlib.sha256(encoded.encode()).hexdigest()
        candidate = "0x" + hashlib.sha256(r["smiles"].encode()).hexdigest()
        if expected != e["hash"] or r["parent_hash"] != parent or r["iteration"] != i or candidate != r["candidate_hash"] or r["run_id"] != data["run"]["id"]:
            raise ValueError(f"Integrity failure at generation {i}")
        parent = expected
    return len(data["experiments"])


if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        count = check(json.load(f))
    print(f"Verified {count} local record hashes and parent links. Onchain state must be checked separately.")
