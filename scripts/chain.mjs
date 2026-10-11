import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  http,
  stringToHex,
  keccak256,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
const source = fs.readFileSync(
  path.join(root, "contracts/ProofOfDiscovery.sol"),
  "utf8",
);
function compile() {
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "ProofOfDiscovery.sol": { content: source } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
        },
      }),
    ),
  );
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length)
    throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  return output.contracts["ProofOfDiscovery.sol"].ProofOfDiscovery;
}
const artifact = compile();
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
});
function wallet() {
  return createWalletClient({
    account: privateKeyToAccount(process.env.WALLET_PRIVATE_KEY),
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  });
}
async function main() {
  if (action === "compile") {
    fs.mkdirSync(path.join(root, "contracts/artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "contracts/artifacts/ProofOfDiscovery.json"),
      JSON.stringify(artifact, null, 2),
    );
    return { compiled: true };
  }
  if ((await publicClient.getChainId()) !== baseSepolia.id)
    throw new Error("RPC must be Base Sepolia (84532)");
  if (action === "deploy") {
    const hash = await wallet().deployContract({
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 180000,
    });
    if (receipt.status !== "success") throw new Error("Deployment reverted");
    return {
      contract_address: receipt.contractAddress,
      transaction_hash: hash,
      explorer: `https://sepolia.basescan.org/tx/${hash}`,
    };
  }
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const data = JSON.parse(input);
  const address = data.contract_address || process.env.CONTRACT_ADDRESS;
  if (!isAddress(address)) throw new Error("Invalid contract address");
  if (action === "submit") {
    const r = data.record;
    const args = [
      keccak256(stringToHex(r.run_id)),
      BigInt(r.iteration),
      r.candidate_hash,
      BigInt(Math.round(r.fitness * 1e8)),
      r.parent_hash,
      data.hash,
    ];
    const client = wallet();
    await publicClient.simulateContract({
      account: client.account,
      address,
      abi: artifact.abi,
      functionName: "commit",
      args,
    });
    return {
      transaction_hash: await client.writeContract({
        address,
        abi: artifact.abi,
        functionName: "commit",
        args,
      }),
    };
  }
  if (action === "receipt") {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: data.transaction_hash,
      timeout: 120000,
      confirmations: 1,
    });
    return {
      status: receipt.status,
      block_number: Number(receipt.blockNumber),
    };
  }
  if (action === "verify") {
    const exists = await publicClient.readContract({
      address,
      abi: artifact.abi,
      functionName: "exists",
      args: [data.hash],
    });
    if (!exists) return { matches: false };
    const [runId, iteration, candidate, fitness, parent] =
      await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: "experiments",
        args: [data.hash],
      });
    const r = data.record;
    const matches =
      runId === keccak256(stringToHex(r.run_id)) &&
      iteration === BigInt(r.iteration) &&
      candidate === r.candidate_hash &&
      fitness === BigInt(Math.round(r.fitness * 1e8)) &&
      parent === r.parent_hash;
    return { matches, chain_id: baseSepolia.id };
  }
  throw new Error("Unknown action");
}
try {
  console.log(JSON.stringify(await main()));
} catch {
  console.log(
    JSON.stringify({
      error:
        "Blockchain operation failed. Check RPC, contract ownership, account funding and transaction status.",
    }),
  );
  process.exitCode = 1;
}
