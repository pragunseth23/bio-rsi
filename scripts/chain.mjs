import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  http,
  stringToHex,
  keccak256,
  isAddress,
  encodeFunctionData,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet, opBNBTestnet, baseSepolia } from "viem/chains";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
const networks = {
  "bsc-testnet": bscTestnet,
  "opbnb-testnet": opBNBTestnet,
  "base-sepolia": baseSepolia,
};
const mode = process.env.CHAIN_NETWORK || "bsc-testnet";
const chain = networks[mode];
const rpc =
  process.env.CHAIN_RPC_URL ||
  (mode === "base-sepolia" ? process.env.BASE_SEPOLIA_RPC_URL : undefined) ||
  (mode === "bsc-testnet"
    ? "https://bsc-testnet-dataseed.bnbchain.org"
    : undefined);
function compile() {
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: {
          "ProofOfDiscovery.sol": {
            content: fs.readFileSync(
              path.join(root, "contracts/ProofOfDiscovery.sol"),
              "utf8",
            ),
          },
        },
        settings: {
          evmVersion: "paris",
          optimizer: { enabled: true, runs: 200 },
          outputSelection: {
            "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] },
          },
        },
      }),
    ),
  );
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error("Solidity compilation failed");
  return output.contracts["ProofOfDiscovery.sol"].ProofOfDiscovery;
}
const artifact = compile();
let client;
function wallet() {
  if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.WALLET_PRIVATE_KEY || ""))
    throw new Error("Set a valid testnet WALLET_PRIVATE_KEY in .env");
  return createWalletClient({
    account: privateKeyToAccount(process.env.WALLET_PRIVATE_KEY),
    chain,
    transport: http(rpc, { timeout: 15000, retryCount: 1 }),
  });
}
function fail(message) {
  throw new Error(message);
}
function context(data) {
  const address = data.contract_address || process.env.CONTRACT_ADDRESS;
  if (!isAddress(address)) fail("Set a valid CONTRACT_ADDRESS");
  if (data.chain_id && data.chain_id !== chain.id)
    fail("Record network differs from configured RPC network");
  return address;
}
async function checkContract(address) {
  // Immutable owner is patched into compiled runtime before exact bytecode comparison.
  const owner = await client.readContract({
    address,
    abi: artifact.abi,
    functionName: "owner",
  });
  let expected = artifact.evm.deployedBytecode.object;
  for (const refs of Object.values(
    artifact.evm.deployedBytecode.immutableReferences || {},
  )) {
    for (const { start, length } of refs)
      expected =
        expected.slice(0, start * 2) +
        owner
          .slice(2)
          .toLowerCase()
          .padStart(length * 2, "0") +
        expected.slice((start + length) * 2);
  }
  const code = await client.getCode({ address });
  if (code?.toLowerCase() !== `0x${expected}`.toLowerCase())
    fail(
      "Contract bytecode differs from this ProofOfDiscovery build; deploy the current contract",
    );
  return owner;
}
function argsFor(data) {
  const json = data.canonical_json;
  if (
    !json ||
    "0x" + createHash("sha256").update(json).digest("hex") !== data.hash
  )
    fail("Canonical record hash mismatch");
  const r = JSON.parse(json);
  if (
    "0x" + createHash("sha256").update(r.smiles).digest("hex") !==
    r.candidate_hash
  )
    fail("Candidate hash mismatch");
  if (!/^-?\d+\.\d{8}$/.test(r.fitness))
    fail("Fitness must use canonical eight-decimal encoding");
  return [
    keccak256(stringToHex(r.run_id)),
    BigInt(r.iteration),
    r.candidate_hash,
    BigInt(r.fitness.replace(".", "")),
    r.parent_hash,
    data.hash,
  ];
}
const meta = () => ({
  chain_id: chain.id,
  network: mode,
  confirmations_required: Number(process.env.CHAIN_CONFIRMATIONS || 3),
});
function matchesTuple(tuple, args) {
  return tuple.every((value, i) =>
    typeof value === "string"
      ? value.toLowerCase() === args[i].toLowerCase()
      : value === args[i],
  );
}
async function evidence(data, address, args) {
  const exists = await client.readContract({
    address,
    abi: artifact.abi,
    functionName: "exists",
    args: [data.hash],
  });
  if (!exists) return { matches: false, exists: false, ...meta() };
  const latest = await client.getBlockNumber();
  const tuple = await client.readContract({
    address,
    abi: artifact.abi,
    functionName: "experiments",
    args: [data.hash],
    blockNumber: latest,
  });
  let txHash = data.transaction_hash;
  if (!txHash) {
    // Only used to recover old submissions with no persisted transaction intent.
    const logs = await client.getContractEvents({
      address,
      abi: artifact.abi,
      eventName: "ExperimentCommitted",
      args: { recordHash: data.hash },
      fromBlock: BigInt(process.env.CONTRACT_DEPLOYMENT_BLOCK || 0),
      toBlock: latest,
      strict: true,
    });
    if (logs.length !== 1)
      fail(
        "Cannot recover a unique commitment event; set CONTRACT_DEPLOYMENT_BLOCK or restore the transaction hash",
      );
    txHash = logs[0].transactionHash;
  }
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const confirmations = Number(latest - receipt.blockNumber + 1n);
  const events = receipt.logs
    .filter((log) => log.address.toLowerCase() === address.toLowerCase())
    .flatMap((log) => {
      try {
        const decoded = decodeEventLog({
          abi: artifact.abi,
          data: log.data,
          topics: log.topics,
          strict: true,
        });
        return decoded.eventName === "ExperimentCommitted"
          ? [decoded.args]
          : [];
      } catch {
        return [];
      }
    });
  const eventMatches = events.some((e) =>
    matchesTuple(
      [
        e.runId,
        e.iteration,
        e.candidateHash,
        e.fitness,
        e.parentHash,
        e.recordHash,
      ],
      args,
    ),
  );
  const matches =
    receipt.status === "success" &&
    block.hash === receipt.blockHash &&
    eventMatches &&
    matchesTuple(tuple, args.slice(0, 5)) &&
    confirmations >= meta().confirmations_required;
  return {
    matches,
    exists: true,
    transaction_hash: txHash,
    block_number: Number(receipt.blockNumber),
    block_hash: receipt.blockHash,
    confirmations,
    event_matches: eventMatches,
    storage_matches: matchesTuple(tuple, args.slice(0, 5)),
    ...meta(),
  };
}
async function sign(clientWallet, request) {
  const prepared = await clientWallet.prepareTransactionRequest({
    ...request,
    type: "legacy",
  });
  const serialized_transaction = await clientWallet.signTransaction(prepared);
  return {
    serialized_transaction,
    transaction_hash: keccak256(serialized_transaction),
    nonce: prepared.nonce,
    signer: clientWallet.account.address,
    ...meta(),
  };
}
async function main() {
  if (action === "compile") {
    fs.mkdirSync(path.join(root, "contracts/artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "contracts/artifacts/ProofOfDiscovery.json"),
      JSON.stringify(artifact, null, 2),
    );
    return { compiled: true, compiler: solc.version(), evm_version: "paris" };
  }
  if (!chain || !rpc)
    fail(
      "Set CHAIN_NETWORK to bsc-testnet, opbnb-testnet or base-sepolia and configure CHAIN_RPC_URL",
    );
  const confirmations = Number(process.env.CHAIN_CONFIRMATIONS || 3);
  if (
    !Number.isSafeInteger(confirmations) ||
    confirmations < 1 ||
    confirmations > 100
  )
    fail("CHAIN_CONFIRMATIONS must be 1–100");
  client = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 15000, retryCount: 1 }),
  });
  if ((await client.getChainId()) !== chain.id)
    fail(
      `RPC chain ID must be ${chain.id} (${mode}); mainnet is not supported`,
    );
  if (action === "deploy") {
    const w = wallet();
    const intentPath = path.join(
      process.env.DEPLOYMENT_DIRECTORY ||
        path.join(root, "contracts/artifacts"),
      `deployment-${chain.id}-${w.account.address}.json`,
    );
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    let intent;
    if (fs.existsSync(intentPath))
      intent = JSON.parse(fs.readFileSync(intentPath, "utf8"));
    else {
      intent = await sign(w, { data: `0x${artifact.evm.bytecode.object}` });
      fs.writeFileSync(intentPath, JSON.stringify(intent, null, 2), {
        mode: 0o600,
      });
    }
    await broadcast(intent);
    const receipt = await client.waitForTransactionReceipt({
      hash: intent.transaction_hash,
      confirmations,
      timeout: 90000,
    });
    if (receipt.status !== "success" || !receipt.contractAddress)
      fail(
        "Deployment reverted; inspect saved deployment intent before redeploying",
      );
    await checkContract(receipt.contractAddress);
    const manifest = {
      ...meta(),
      contract_address: receipt.contractAddress,
      transaction_hash: intent.transaction_hash,
      deployment_block: Number(receipt.blockNumber),
      owner: w.account.address,
      compiler: solc.version(),
      explorer: `${chain.blockExplorers.default.url}/address/${receipt.contractAddress}`,
    };
    fs.writeFileSync(
      intentPath.replace(".json", "-manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    return manifest;
  }
  if (action === "status") {
    const address = context({});
    const owner = await checkContract(address);
    const w = wallet();
    if (owner.toLowerCase() !== w.account.address.toLowerCase())
      fail("Configured wallet is not the contract owner");
    const balance = await client.getBalance({ address: owner });
    if (balance === 0n) fail("Fund the contract owner with testnet gas");
    return {
      ...meta(),
      contract_address: address,
      owner,
      balance_wei: balance.toString(),
      ready: true,
    };
  }
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const data = JSON.parse(input);
  const address = context(data);
  const owner = await checkContract(address);
  const args = argsFor(data);
  if (action === "verify") return evidence(data, address, args);
  if (action === "prepare") {
    const existing = await evidence(data, address, args);
    if (existing.exists) {
      if (!existing.matches)
        fail(
          "Existing commitment does not match or lacks required confirmations",
        );
      return { ...existing, status: "verified" };
    }
    const w = wallet();
    if (owner.toLowerCase() !== w.account.address.toLowerCase())
      fail("Configured wallet is not the contract owner");
    await client.simulateContract({
      account: w.account,
      address,
      abi: artifact.abi,
      functionName: "commit",
      args,
    });
    return {
      ...(await sign(w, {
        to: address,
        data: encodeFunctionData({
          abi: artifact.abi,
          functionName: "commit",
          args,
        }),
      })),
      status: "pending",
    };
  }
  if (action === "broadcast") {
    await broadcast(data);
    return { transaction_hash: data.transaction_hash };
  }
  if (action === "receipt") {
    const receipt = await client.waitForTransactionReceipt({
      hash: data.transaction_hash,
      confirmations,
      timeout: 90000,
    });
    if (receipt.status === "reverted")
      return {
        status: "reverted",
        block_number: Number(receipt.blockNumber),
        block_hash: receipt.blockHash,
      };
    const checked = await evidence(data, address, args);
    return { ...checked, status: checked.matches ? "verified" : "failed" };
  }
  fail("Unknown blockchain action");
}
async function broadcast(data) {
  if (
    !data.serialized_transaction ||
    keccak256(data.serialized_transaction) !== data.transaction_hash
  )
    fail("Signed transaction intent mismatch");
  try {
    await client.getTransaction({ hash: data.transaction_hash });
    return;
  } catch (e) {
    if (e.name !== "TransactionNotFoundError") throw e;
  }
  const hash = await client.sendRawTransaction({
    serializedTransaction: data.serialized_transaction,
  });
  if (hash !== data.transaction_hash)
    fail("RPC returned an unexpected transaction hash");
}
try {
  console.log(JSON.stringify(await main()));
} catch (e) {
  // Never print viem errors: request bodies can include credentials or signed data.
  const safe =
    e.constructor === Error
      ? e.message
      : e.name === "WaitForTransactionReceiptTimeoutError"
        ? "Confirmation timed out; retry will reconcile the same signed transaction"
        : e.name?.includes("NotFound")
          ? "Transaction is not yet available from this RPC"
          : "RPC or contract operation failed; check network, contract ownership, funding and transaction status";
  console.log(JSON.stringify({ error: safe }));
  process.exitCode = 1;
}
