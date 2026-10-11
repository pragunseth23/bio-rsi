const NETWORKS: Record<number, { name: string; explorer: string }> = {
  97: { name: "BSC Testnet", explorer: "https://testnet.bscscan.com" },
  5611: { name: "opBNB Testnet", explorer: "https://testnet.opbnbscan.com" },
  84532: { name: "Base Sepolia", explorer: "https://sepolia.basescan.org" },
};
export const networkName = (id?: number | null) =>
  id ? NETWORKS[id]?.name || `Chain ${id}` : "Local SHA-256 chain";
const MODES: Record<string, string> = {
  "bsc-testnet": "BSC Testnet",
  "opbnb-testnet": "opBNB Testnet",
  "base-sepolia": "Base Sepolia",
};
export const modeName = (mode?: string) =>
  MODES[mode || ""] || "Local hash chain";
export const explorerLink = (
  id: number | null | undefined,
  kind: "tx" | "address",
  hash: string,
) =>
  id && NETWORKS[id] && /^0x[0-9a-fA-F]+$/.test(hash)
    ? `${NETWORKS[id].explorer}/${kind}/${hash}`
    : undefined;
