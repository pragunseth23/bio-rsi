import hashlib
import json
import os
import sqlite3
from pathlib import Path


def canonical_json(value):
    """Canonical v1: sorted ASCII JSON, floats as fixed 8-decimal strings."""
    def normalize(v):
        if isinstance(v, float):
            return format(v, ".8f")
        if isinstance(v, dict):
            return {k: normalize(x) for k, x in v.items()}
        if isinstance(v, list):
            return [normalize(x) for x in v]
        return v
    return json.dumps(normalize(value), sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def digest(record):
    return "0x" + hashlib.sha256(canonical_json(record).encode()).hexdigest()


def candidate_hash(smiles):
    return "0x" + hashlib.sha256(smiles.encode()).hexdigest()


class Store:
    def __init__(self, path=None):
        self.path = str(path or os.getenv("DATABASE_PATH", "backend/data/discovery.sqlite"))
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, iteration INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(run_id, iteration)); CREATE TABLE IF NOT EXISTS transaction_intents(id TEXT PRIMARY KEY, data TEXT NOT NULL);")

    def connect(self):
        return sqlite3.connect(self.path, timeout=20)

    def save_run(self, run):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO runs VALUES (?,?)", (run["id"], json.dumps(run)))

    def run(self, id):
        with self.connect() as db:
            row = db.execute("SELECT data FROM runs WHERE id=?", (id,)).fetchone()
        return json.loads(row[0]) if row else None

    def runs(self):
        with self.connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT data FROM runs ORDER BY rowid DESC")]

    def save_experiment(self, exp):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO experiments VALUES (?,?,?,?)", (exp["record"]["id"], exp["record"]["run_id"], exp["record"]["iteration"], json.dumps(exp)))

    def experiment(self, id):
        with self.connect() as db:
            row = db.execute("SELECT data FROM experiments WHERE id=?", (id,)).fetchone()
        return json.loads(row[0]) if row else None

    def experiments(self, run_id):
        with self.connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT data FROM experiments WHERE run_id=? ORDER BY iteration", (run_id,))]

    def save_intent(self, exp, intent):
        """Atomically persist signed bytes + hash before any network broadcast."""
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO transaction_intents VALUES (?,?)", (exp["record"]["id"], json.dumps(intent)))
            db.execute("UPDATE experiments SET data=? WHERE id=?", (json.dumps(exp), exp["record"]["id"]))

    def intent(self, id):
        with self.connect() as db:
            row = db.execute("SELECT data FROM transaction_intents WHERE id=?", (id,)).fetchone()
        return json.loads(row[0]) if row else None

    def clear_intent(self, id):
        with self.connect() as db:
            db.execute("DELETE FROM transaction_intents WHERE id=?", (id,))

    def unresolved_intents(self):
        with self.connect() as db:
            rows = db.execute("SELECT e.data FROM transaction_intents t JOIN experiments e ON t.id=e.id").fetchall()
        experiments = [json.loads(r[0]) for r in rows]
        return [e for e in experiments if e["proof"]["status"] != "verified"]
