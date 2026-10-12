import asyncio
import json
import os
import random
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response, StreamingResponse, JSONResponse
from pydantic import BaseModel, Field, model_validator
from typing import Literal
from . import chemistry, blockchain, chains
from .agent import advise
from .records import Store, digest, candidate_hash, canonical_json

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
store = Store()
tasks = {}
queue = asyncio.Queue()
ZERO = "0x" + "0" * 64


def now():
    return datetime.now(timezone.utc).isoformat()


class RunConfig(BaseModel):
    smiles: str = Field(default="CCO", min_length=1, max_length=500)
    objective: Literal["qed", "logp", "multi"] = "qed"
    iterations: int = Field(default=30, ge=1, le=100)
    candidates: int = Field(default=30, ge=20, le=50)
    target_logp: float = Field(default=2.0, ge=-3, le=6)
    seed: int = Field(default=42, ge=0, le=2**32-1)
    weights: dict[str, float] = Field(default_factory=lambda: {"qed": .4, "logp": .2, "mw": .15, "tpsa": .15, "constraints": .1})

    @model_validator(mode="after")
    def weights_valid(self):
        if set(self.weights) != {"qed", "logp", "mw", "tpsa", "constraints"} or any(not (0 <= x <= 1) for x in self.weights.values()) or sum(self.weights.values()) == 0:
            raise ValueError("Weights must contain qed, logp, mw, tpsa, constraints, each 0–1 with positive total.")
        return self


def require_run(id):
    run = store.run(id)
    if run is None:
        raise HTTPException(404, "Run not found")
    return run


def record_experiment(run, iteration, best, stats, parent, advice):
    config = run["config"]
    record = {"schema": "proof-of-discovery/v1", "id": f"{run['id']}:{iteration}", "run_id": run["id"], "iteration": iteration,
              "smiles": best["smiles"], "properties": best["properties"], "scores": best["scores"], "fitness": best["fitness"],
              "objective": config, "simulator": chemistry.VERSION, "timestamp": now(), "mutation": best.get("mutation", {"method": "seed"}),
              "candidate_hash": candidate_hash(best["smiles"]), "parent_hash": parent, "stats": stats, "agent": advice}
    exp = {"record": record, "hash": digest(record), "proof": {"status": "local-only" if run["chain_mode"] == "local-only" else "pending", "contract_address": run.get("contract_address"), "chain_id": None if run["chain_mode"] == "local-only" else chains.info(run["chain_mode"])["chain_id"]}}
    store.save_experiment(exp)
    if exp["proof"]["status"] == "pending":
        queue.put_nowait(record["id"])
    return exp


async def optimize(id, initial):
    run = store.run(id)
    config = run["config"]
    rng = random.Random(config["seed"])
    elites, seen = [initial], {initial["smiles"]}
    parent = ZERO
    try:
        advice = await advise(initial, config, 0)
        exp = record_experiment(run, 0, initial, {"attempted": 0, "valid": 0, "invalid": 0, "duplicates": 0, "average": initial["fitness"]}, parent, advice)
        parent = exp["hash"]
        for iteration in range(1, config["iterations"] + 1):
            if store.run(id)["status"] == "stopped":
                return
            if iteration % 5 == 0:
                advice = await advise(elites[0], config, iteration)
            elites, stats = await asyncio.to_thread(chemistry.generation, elites, config, rng, advice["strategy"], seen)
            exp = record_experiment(run, iteration, elites[0], stats, parent, advice)
            parent = exp["hash"]
            run.update({"iteration": iteration, "best_fitness": elites[0]["fitness"], "evaluated": run["evaluated"] + stats["valid"], "attempted": run["attempted"] + stats["attempted"], "updated_at": now()})
            # Preserve a Stop request received while the chemistry thread was running.
            run["status"] = store.run(id)["status"]
            store.save_run(run)
            await asyncio.sleep(float(os.getenv("ITERATION_DELAY", ".18")))
        run["status"] = "completed" if run["status"] != "stopped" else "stopped"
        store.save_run(run)
    except Exception as e:
        run.update(status="failed", error=f"Optimization failed: {type(e).__name__}")
        store.save_run(run)
    finally:
        tasks.pop(id, None)


async def commitment_worker():
    while True:
        id = await queue.get()
        exp = store.experiment(id)
        try:
            if exp["proof"].get("status") == "verified":
                continue
            if not exp["proof"].get("transaction_hash"):
                submission = await blockchain.bridge("submit", exp)
                exp["proof"].update(submission)
                store.save_experiment(exp)
            receipt = await blockchain.bridge("receipt", exp)
            exp["proof"].update(receipt)
            exp["proof"]["status"] = "verified" if receipt["status"] == "success" else "failed"
            if receipt["status"] != "success":
                exp["proof"]["error"] = "Transaction reverted."
            else:
                exp["proof"].pop("error", None)
            store.save_experiment(exp)
        except Exception as e:
            exp["proof"].update(status="failed", error=str(e))
            store.save_experiment(exp)
        finally:
            queue.task_done()


@asynccontextmanager
async def lifespan(app):
    global queue
    queue = asyncio.Queue()
    for run in store.runs():
        if run["status"] == "running":
            run["status"] = "interrupted"
            store.save_run(run)
        for exp in store.experiments(run["id"]):
            if exp["proof"]["status"] == "pending":
                queue.put_nowait(exp["record"]["id"])
    worker = asyncio.create_task(commitment_worker())
    yield
    worker.cancel()
    for task in list(tasks.values()):
        task.cancel()
    await asyncio.gather(worker, *list(tasks.values()), return_exceptions=True)


app = FastAPI(title="Proof of Discovery", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"status": "ok", "simulator": chemistry.VERSION, "chain_mode": chains.selected() if blockchain.configured() else "local-only", "network": chains.info(), "agent": "llm" if os.getenv("LLM_API_KEY") else "heuristic"}


@app.get("/api/runs")
def list_runs():
    return store.runs()


@app.post("/api/runs", status_code=201)
async def create_run(config: RunConfig):
    if len(tasks) >= 3:
        raise HTTPException(429, "Three runs are already active.")
    try:
        initial = await asyncio.to_thread(chemistry.evaluate, config.smiles, config.model_dump())
    except ValueError as e:
        raise HTTPException(422, str(e))
    id = str(uuid.uuid4())
    run = {"id": id, "config": config.model_dump(), "initial": initial, "status": "running", "created_at": now(), "iteration": 0,
           "best_fitness": initial["fitness"], "evaluated": 0, "attempted": 0, "chain_mode": chains.selected() if blockchain.configured() else "local-only", "contract_address": os.getenv("CONTRACT_ADDRESS") if blockchain.configured() else None}
    store.save_run(run)
    tasks[id] = asyncio.create_task(optimize(id, initial))
    return run


@app.get("/api/runs/{id}")
def get_run(id: str):
    return require_run(id)


@app.post("/api/runs/{id}/stop")
def stop(id: str):
    run = require_run(id)
    if run["status"] == "running":
        run.update(status="stopped", updated_at=now())
        store.save_run(run)
    return run


@app.post("/api/runs/{id}/retry")
def retry(id: str):
    require_run(id)
    for exp in store.experiments(id):
        if exp["proof"]["status"] == "failed":
            if exp["proof"].get("block_number"):
                exp["proof"].pop("transaction_hash", None)
                exp["proof"].pop("block_number", None)
            exp["proof"]["status"] = "pending"
            store.save_experiment(exp)
            queue.put_nowait(exp["record"]["id"])
    return {"status": "queued"}


@app.get("/api/runs/{id}/experiments")
def experiments(id: str):
    require_run(id)
    return store.experiments(id)


@app.get("/api/runs/{id}/export")
def export_run(id: str):
    data = {"run": require_run(id), "experiments": [{**e, "canonical_json": canonical_json(e["record"])} for e in store.experiments(id)]}
    return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="discovery-{id}.json"'})


@app.get("/api/runs/{id}/stream")
async def stream(id: str):
    require_run(id)
    async def events():
        previous = None
        while True:
            run = store.run(id)
            exps = store.experiments(id)
            payload = json.dumps({"run": run, "experiments": exps})
            if payload != previous:
                yield f"data: {payload}\n\n"
                previous = payload
            else:
                yield ": heartbeat\n\n"
            if run["status"] != "running" and not any(e["proof"]["status"] == "pending" for e in exps):
                yield "event: finished\ndata: {}\n\n"
                break
            await asyncio.sleep(.4)
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/verify/{id}")
async def verify(id: str):
    exp = store.experiment(id)
    if not exp:
        raise HTTPException(404, "Experiment not found")
    exps = store.experiments(exp["record"]["run_id"])
    parent, chain_valid = ZERO, len(exps[:exp["record"]["iteration"] + 1]) == exp["record"]["iteration"] + 1
    for index, ancestor in enumerate(exps[:exp["record"]["iteration"] + 1]):
        r = ancestor["record"]
        chain_valid &= r["run_id"] == exp["record"]["run_id"] and r["id"] == f"{r['run_id']}:{index}" and r["iteration"] == index and r["parent_hash"] == parent and digest(r) == ancestor["hash"] and candidate_hash(r["smiles"]) == r["candidate_hash"]
        parent = ancestor["hash"]
    hash_matches = digest(exp["record"]) == exp["hash"]
    result = {"hash_matches": hash_matches, "chain_valid": bool(chain_valid), "recomputed_hash": digest(exp["record"]), "canonical_json": canonical_json(exp["record"]), "status": exp["proof"]["status"], "onchain_matches": None}
    if exp["proof"]["status"] == "verified":
        try:
            checked = await blockchain.bridge("verify", exp)
            result["onchain_matches"] = checked["matches"]
            if not checked["matches"]:
                result["status"] = "failed"
        except Exception as e:
            result.update(status="unavailable", error=str(e))
    if not hash_matches or not chain_valid:
        result["status"] = "failed"
    return result


@app.post("/api/molecule/evaluate")
async def evaluate_molecule(config: RunConfig):
    """Score the seed exactly as POST /api/runs would, without starting a run.
    An unusable molecule is an expected answer here, so it returns 200 with valid=false."""
    try:
        return {"valid": True, "candidate": await asyncio.to_thread(chemistry.evaluate, config.smiles, config.model_dump())}
    except ValueError as e:
        return {"valid": False, "error": str(e)}


@app.get("/api/molecule/svg")
def molecule_svg(smiles: str = Query(max_length=500)):
    try:
        return Response(chemistry.svg(smiles), media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/molecule/scene")
async def molecule_scene(smiles: str = Query(max_length=500)):
    try:
        return await asyncio.to_thread(chemistry.scene_data, smiles)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(422, str(e))
