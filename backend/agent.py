import os
import json
import httpx


async def advise(best, config, iteration):
    p = best["properties"]
    strategy = "polar" if p["logp"] > config["target_logp"] + 1 else "explore"
    fallback = {"strategy": strategy, "source": "heuristic", "explanation": f"Iteration {iteration}: QED {p['qed']:.3f}, logP {p['logp']:.2f}. " + ("Favor polar fragments to reduce lipophilicity." if strategy == "polar" else "Explore fragments and atom substitutions; retain the five strongest candidates.")}
    key = os.getenv("LLM_API_KEY")
    if not key:
        return fallback
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": os.getenv("LLM_MODEL", "gpt-4.1-mini"), "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": 'Supervise an RDKit heuristic molecular search. Return JSON with strategy ("polar" or "explore") and explanation (one brief sentence). Do not claim efficacy, safety or experimental validation.'}, {"role": "user", "content": json.dumps({"best": best, "objective": config, "iteration": iteration})}]})
            response.raise_for_status()
            result = json.loads(response.json()["choices"][0]["message"]["content"])
            if result["strategy"] not in ["polar", "explore"] or not isinstance(result["explanation"], str):
                raise ValueError("Invalid strategy")
            return {"strategy": result["strategy"], "explanation": result["explanation"][:500], "source": "llm"}
    except Exception:
        return {**fallback, "source": "heuristic (LLM unavailable)"}
