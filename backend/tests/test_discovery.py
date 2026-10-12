import copy
import random
import time
import pytest
from fastapi.testclient import TestClient
from backend import chemistry, main
from backend.records import Store, digest
from scripts.verify_export import check


def test_seeded_search_improves_and_evaluates_500():
    config = main.RunConfig().model_dump()
    initial = chemistry.evaluate("CCO", config)
    for seed in [7, 42, 101]:
        rng = random.Random(seed)
        elites = [initial]
        seen = {initial["smiles"]}
        evaluated = 0
        best = initial["fitness"]
        for _ in range(30):
            elites, stats = chemistry.generation(elites, config, rng, "explore", seen)
            assert elites[0]["fitness"] >= best
            best = elites[0]["fitness"]
            evaluated += stats["valid"]
        assert evaluated >= 500
        assert best > initial["fitness"] + .1


def test_objective_scores_and_invalid_molecules():
    config = main.RunConfig(objective="logp", target_logp=2).model_dump()
    molecule = chemistry.evaluate("CCO", config)
    assert molecule["fitness"] == round(-abs(molecule["properties"]["logp"] - 2), 8)
    config["objective"] = "multi"
    assert 0 <= chemistry.evaluate("CCO", config)["fitness"] <= 1
    for smiles in ["not-a-molecule", "", "CC.O", "[Na+]", "C"*100]:
        with pytest.raises(ValueError):
            chemistry.evaluate(smiles, config)


def test_api_persistence_verification_and_tamper(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "experiments.sqlite"))
    monkeypatch.setattr(main.blockchain, "configured", lambda: False)
    monkeypatch.setenv("ITERATION_DELAY", "0")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    with TestClient(main.app) as client:
        assert client.post("/api/runs", json={"smiles": "nope"}).status_code == 422
        assert client.post("/api/runs", json={"weights": {"qed": 1}}).status_code == 422
        assert client.get("/api/molecule/svg", params={"smiles": "CCO"}).headers["content-type"].startswith("image/svg+xml")
        assert client.get("/api/molecule/svg", params={"smiles": "nope"}).status_code == 422
        run = client.post("/api/runs", json={"iterations": 3}).json()
        for _ in range(100):
            saved = client.get(f"/api/runs/{run['id']}").json()
            if saved["status"] != "running":
                break
            time.sleep(.04)
        assert saved["status"] == "completed"
        experiments = client.get(f"/api/runs/{run['id']}/experiments").json()
        assert len(experiments) == 4
        assert all(e["proof"]["status"] == "local-only" for e in experiments)
        result = client.post(f"/api/verify/{experiments[-1]['record']['id']}").json()
        assert result["hash_matches"] and result["chain_valid"]
        assert result["onchain_matches"] is None
        exported = client.get(f"/api/runs/{run['id']}/export").json()
        assert check(exported) == 4
        restored = Store(tmp_path / "experiments.sqlite")
        assert len(restored.experiments(run["id"])) == 4
        changed = copy.deepcopy(experiments[1])
        changed["record"]["fitness"] += .1
        assert digest(changed["record"]) != changed["hash"]
        main.store.save_experiment(changed)
        assert client.post(f"/api/verify/{experiments[-1]['record']['id']}").json()["chain_valid"] is False
        exported["experiments"][0]["record"]["smiles"] = "CCC"
        with pytest.raises(ValueError):
            check(exported)


def test_stop_and_missing_run(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "stop.sqlite"))
    monkeypatch.setattr(main.blockchain, "configured", lambda: False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    with TestClient(main.app) as client:
        assert client.get("/api/runs/missing").status_code == 404
        run = client.post("/api/runs", json={"iterations": 100}).json()
        client.post(f"/api/runs/{run['id']}/stop")
        time.sleep(.3)
        assert client.get(f"/api/runs/{run['id']}").json()["status"] == "stopped"
        assert len(client.get(f"/api/runs/{run['id']}/experiments").json()) < 101


def test_unavailable_llm_falls_back(monkeypatch):
    import asyncio
    from backend.agent import advise
    monkeypatch.setenv("LLM_API_KEY", "test-only-key")
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:1/v1")
    config = main.RunConfig().model_dump()
    result = asyncio.run(advise(chemistry.evaluate("CCO", config), config, 5))
    assert result["source"] == "heuristic (LLM unavailable)"
    assert result["strategy"] in ["polar", "explore"]


def test_unavailable_blockchain_does_not_break_optimization(tmp_path, monkeypatch):
    async def failing_bridge(action, exp):
        raise RuntimeError("Test RPC unavailable")
    monkeypatch.setattr(main, "store", Store(tmp_path / "rpc.sqlite"))
    monkeypatch.setattr(main.blockchain, "configured", lambda: True)
    monkeypatch.setattr(main.blockchain, "bridge", failing_bridge)
    monkeypatch.setenv("ITERATION_DELAY", "0")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    with TestClient(main.app) as client:
        run = client.post("/api/runs", json={"iterations": 2}).json()
        for _ in range(100):
            state = client.get(f"/api/runs/{run['id']}").json()
            exps = client.get(f"/api/runs/{run['id']}/experiments").json()
            if state["status"] == "completed" and len(exps) == 3 and all(e["proof"]["status"] == "failed" for e in exps):
                break
            time.sleep(.03)
        assert state["status"] == "completed"
        assert all(e["proof"]["status"] == "failed" for e in exps)
        assert not any(e["proof"].get("transaction_hash") for e in exps)
        assert client.post(f"/api/verify/{exps[-1]['record']['id']}").json()["chain_valid"]


def test_seed_evaluation_matches_run_initial(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "evaluate.sqlite"))
    monkeypatch.setattr(main.blockchain, "configured", lambda: False)
    monkeypatch.setenv("ITERATION_DELAY", "0")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    with TestClient(main.app) as client:
        config = {"smiles": "Oc1ccccc1", "objective": "logp", "target_logp": 1.5, "iterations": 1}
        preview = client.post("/api/molecule/evaluate", json=config)
        assert preview.status_code == 200 and preview.json()["valid"] is True
        run = client.post("/api/runs", json=config).json()
        assert preview.json()["candidate"] == run["initial"]
        invalid = client.post("/api/molecule/evaluate", json={"smiles": "C1CC"}).json()
        assert invalid["valid"] is False and isinstance(invalid["error"], str)
        assert client.post("/api/molecule/evaluate", json={"smiles": "CC.O"}).json()["valid"] is False
        assert client.post("/api/molecule/evaluate", json={"smiles": "CCO", "iterations": 0}).status_code == 422


def test_illustrative_geometry_is_real_and_deterministic():
    geometry = chemistry.scene_data("CCO")
    assert [a["element"] for a in geometry["atoms"]] == ["C", "C", "O"]
    assert len(geometry["bonds"]) == 2
    assert all(len(a["position"]) == 3 for a in geometry["atoms"])
    assert geometry == chemistry.scene_data("CCO")
    with pytest.raises(ValueError):
        chemistry.scene_data("not-a-molecule")


def test_chain_selection_defaults_to_bnb_testnet(tmp_path, monkeypatch):
    from backend import chains
    for key in ["CHAIN", "RPC_URL", "BASE_SEPOLIA_RPC_URL", "WALLET_PRIVATE_KEY", "CONTRACT_ADDRESS"]:
        monkeypatch.delenv(key, raising=False)
    assert chains.selected() == "bsc-testnet"
    assert chains.info()["chain_id"] == 97 and chains.rpc_url().startswith("https://")
    monkeypatch.setenv("CHAIN", "opbnb-testnet")
    assert chains.info()["chain_id"] == 5611
    monkeypatch.setenv("CHAIN", "base-sepolia")
    monkeypatch.setenv("BASE_SEPOLIA_RPC_URL", "http://legacy")
    assert chains.rpc_url() == "http://legacy"
    monkeypatch.setenv("CHAIN", "nope")
    with pytest.raises(ValueError):
        chains.selected()
    # A configured BNB run records chain 97 on every proof and reports it in /api/health.
    monkeypatch.setenv("CHAIN", "bsc-testnet")
    monkeypatch.setattr(main, "store", Store(tmp_path / "bnb.sqlite"))
    monkeypatch.setattr(main.blockchain, "configured", lambda: True)
    async def failing_bridge(action, exp):
        raise RuntimeError("no RPC in tests")
    monkeypatch.setattr(main.blockchain, "bridge", failing_bridge)
    monkeypatch.setenv("ITERATION_DELAY", "0")
    with TestClient(main.app) as client:
        health = client.get("/api/health").json()
        assert health["chain_mode"] == "bsc-testnet" and health["network"]["chain_id"] == 97
        run = client.post("/api/runs", json={"iterations": 1}).json()
        assert run["chain_mode"] == "bsc-testnet"
        for _ in range(100):
            exps = client.get(f"/api/runs/{run['id']}/experiments").json()
            if len(exps) == 2:
                break
            time.sleep(.03)
        assert all(e["proof"]["chain_id"] == 97 for e in exps)
