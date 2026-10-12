/** Mirrors backend/chains.py. Records carry their own chain_id, so links stay correct if CHAIN changes later. */
export const NETWORKS: Record<string, { key: string; name: string; short: string; chainId: number; explorer: string }> = {
  "bsc-testnet": { key: "bsc-testnet", name: "BNB Smart Chain Testnet", short: "BSC Testnet", chainId: 97, explorer: "https://testnet.bscscan.com" },
  "opbnb-testnet": { key: "opbnb-testnet", name: "opBNB Testnet", short: "opBNB Testnet", chainId: 5611, explorer: "https://testnet.opbnbscan.com" },
  "base-sepolia": { key: "base-sepolia", name: "Base Sepolia", short: "Base Sepolia", chainId: 84532, explorer: "https://sepolia.basescan.org" },
};

export const byKey = (key?: string) => (key ? NETWORKS[key] : undefined);

export const byChainId = (id?: number | null) => Object.values(NETWORKS).find((n) => n.chainId === id);

export const txUrl = (chainId: number | null | undefined, hash: string) => {
  const n = byChainId(chainId);
  return n ? `${n.explorer}/tx/${hash}` : undefined;
};
