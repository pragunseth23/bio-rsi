"""Supported commitment networks. CHAIN selects one; BNB Smart Chain Testnet is the default (YZi Labs track)."""
import os

NETWORKS = {
    "bsc-testnet": {"name": "BNB Smart Chain Testnet", "chain_id": 97, "explorer": "https://testnet.bscscan.com", "rpc": "https://data-seed-prebsc-1-s1.bnbchain.org:8545"},
    "opbnb-testnet": {"name": "opBNB Testnet", "chain_id": 5611, "explorer": "https://testnet.opbnbscan.com", "rpc": "https://opbnb-testnet-rpc.bnbchain.org"},
    "base-sepolia": {"name": "Base Sepolia", "chain_id": 84532, "explorer": "https://sepolia.basescan.org", "rpc": "https://sepolia.base.org"},
}
DEFAULT = "bsc-testnet"


def selected():
    key = os.getenv("CHAIN", DEFAULT).strip().lower() or DEFAULT
    if key not in NETWORKS:
        raise ValueError(f"Unsupported CHAIN '{key}'. Use one of: {', '.join(NETWORKS)}")
    return key


def rpc_url():
    # BASE_SEPOLIA_RPC_URL is kept for configurations written before CHAIN existed.
    legacy = os.getenv("BASE_SEPOLIA_RPC_URL") if selected() == "base-sepolia" else None
    return os.getenv("RPC_URL") or legacy or NETWORKS[selected()]["rpc"]


def info(key=None):
    key = key or selected()
    n = NETWORKS[key]
    return {"key": key, "name": n["name"], "chain_id": n["chain_id"], "explorer": n["explorer"]}
