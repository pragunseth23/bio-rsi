// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Commits record integrity and order; does not attest chemistry execution.
contract ProofOfDiscovery {
    address public immutable owner;
    struct Experiment { bytes32 runId; uint256 iteration; bytes32 candidateHash; int256 fitness; bytes32 parentHash; }
    mapping(bytes32 => Experiment) public experiments;
    mapping(bytes32 => bool) public exists;
    mapping(bytes32 => bytes32) public heads;
    mapping(bytes32 => uint256) public counts;
    event ExperimentCommitted(bytes32 indexed runId, uint256 indexed iteration, bytes32 indexed recordHash, bytes32 candidateHash, int256 fitness, bytes32 parentHash);
    constructor() { owner = msg.sender; }
    function commit(bytes32 runId, uint256 iteration, bytes32 candidateHash, int256 fitness, bytes32 parentHash, bytes32 recordHash) external {
        require(msg.sender == owner, "Only owner");
        require(!exists[recordHash] && recordHash != bytes32(0), "Duplicate or zero record");
        require(iteration == counts[runId], "Out of order");
        require(parentHash == heads[runId], "Parent mismatch");
        experiments[recordHash] = Experiment(runId, iteration, candidateHash, fitness, parentHash);
        exists[recordHash] = true;
        heads[runId] = recordHash;
        counts[runId]++;
        emit ExperimentCommitted(runId, iteration, recordHash, candidateHash, fitness, parentHash);
    }
}
