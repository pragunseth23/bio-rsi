"""Real RDKit evaluations. Scores are heuristics, never efficacy predictions."""
import random
import selfies as sf
from rdkit import Chem, rdBase
from rdkit.Chem import Descriptors, QED, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

VERSION = f"rdkit-{rdBase.rdkitVersion}/optimizer-1"
ALPHABET = ["[C]", "[N]", "[O]", "[F]", "[=C]", "[=O]", "[Branch1]", "[Ring1]", "[S]", "[Cl]"]
FRAGMENTS = ["C", "CC", "O", "N", "C(=O)N", "c1ccccc1", "C1CCCCC1", "c1ccncc1", "OC", "F"]


def evaluate(smiles, config):
    with rdBase.BlockLogs():
        mol = Chem.MolFromSmiles(smiles)
    if mol is None or mol.GetNumAtoms() == 0 or len(Chem.GetMolFrags(mol)) != 1:
        raise ValueError("Enter a valid, single-fragment SMILES molecule.")
    if any(a.GetAtomicNum() not in {6, 7, 8, 9, 15, 16, 17, 35, 53} for a in mol.GetAtoms()):
        raise ValueError("Supported elements: C, N, O, F, P, S, Cl, Br, I.")
    p = {"qed": round(QED.qed(mol), 8), "mw": round(Descriptors.MolWt(mol), 8),
         "logp": round(Descriptors.MolLogP(mol), 8), "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 8),
         "hbd": rdMolDescriptors.CalcNumHBD(mol), "hba": rdMolDescriptors.CalcNumHBA(mol),
         "rotatable": rdMolDescriptors.CalcNumRotatableBonds(mol), "heavy_atoms": mol.GetNumHeavyAtoms()}
    if not (10 <= p["mw"] <= 650 and -4 <= p["logp"] <= 7 and p["heavy_atoms"] <= 50):
        raise ValueError("Molecule exceeds search bounds (MW 10–650, logP −4–7, ≤50 heavy atoms).")
    scores = {"qed": p["qed"], "logp": max(0, 1 - abs(p["logp"] - config["target_logp"]) / 5),
              "mw": max(0, 1 - abs(p["mw"] - 300) / 350), "tpsa": max(0, 1 - abs(p["tpsa"] - 75) / 125),
              "constraints": sum([p["mw"] <= 500, p["hbd"] <= 5, p["hba"] <= 10, p["rotatable"] <= 10]) / 4}
    objective = config["objective"]
    fitness = p["qed"] if objective == "qed" else -abs(p["logp"] - config["target_logp"]) if objective == "logp" else sum(scores[k] * config["weights"][k] for k in scores) / sum(config["weights"].values())
    return {"smiles": Chem.MolToSmiles(mol, canonical=True), "properties": p,
            "scores": {k: round(v, 8) for k, v in scores.items()}, "fitness": round(fitness, 8)}


def mutate(smiles, rng, strategy):
    mol = Chem.MolFromSmiles(smiles)
    method = rng.choice(["fragment", "fragment", "selfies", "substitute", "prune"])
    try:
        with rdBase.BlockLogs():
            if method == "selfies":
                tokens = list(sf.split_selfies(sf.encoder(smiles)))
                pos = rng.randrange(len(tokens) + 1)
                token = rng.choice(ALPHABET if strategy != "polar" else ["[N]", "[O]", "[C]", "[=O]"])
                if rng.random() < .5 and pos < len(tokens):
                    tokens[pos] = token
                else:
                    tokens.insert(pos, token)
                return sf.decoder("".join(tokens)), method
            rw = Chem.RWMol(mol)
            if method == "fragment":
                eligible = [a.GetIdx() for a in mol.GetAtoms() if a.GetTotalNumHs() > 0]
                if not eligible:
                    return None, method
                fragment = Chem.MolFromSmiles(rng.choice(FRAGMENTS if strategy != "polar" else ["O", "N", "C(=O)N", "OC"]))
                anchor = rng.choice(eligible)
                offset = mol.GetNumAtoms()
                rw = Chem.RWMol(Chem.CombineMols(mol, fragment))
                rw.AddBond(anchor, offset, Chem.BondType.SINGLE)
            elif method == "substitute":
                atom = rw.GetAtomWithIdx(rng.randrange(mol.GetNumAtoms()))
                if not atom.GetIsAromatic():
                    atom.SetAtomicNum(rng.choice([6, 7, 8]))
            else:
                leaves = [a.GetIdx() for a in mol.GetAtoms() if a.GetDegree() == 1 and not a.GetIsAromatic()]
                if len(leaves) == 0 or mol.GetNumAtoms() <= 2:
                    return None, method
                rw.RemoveAtom(rng.choice(leaves))
            Chem.SanitizeMol(rw)
            return Chem.MolToSmiles(rw), method
    except Exception:
        return None, method


def generation(elites, config, rng, strategy, seen):
    candidates, attempted, invalid, duplicates = [], 0, 0, 0
    # Bounded attempts ensure sparse/invalid searches always terminate.
    while len(candidates) < config["candidates"] and attempted < config["candidates"] * 12:
        parent = rng.choice(elites)
        smiles, method = mutate(parent["smiles"], rng, strategy)
        attempted += 1
        if not smiles:
            invalid += 1
            continue
        try:
            candidate = evaluate(smiles, config)
        except ValueError:
            invalid += 1
            continue
        if candidate["smiles"] in seen:
            duplicates += 1
            continue
        seen.add(candidate["smiles"])
        candidate["mutation"] = {"method": method, "parent_smiles": parent["smiles"], "strategy": strategy}
        candidates.append(candidate)
    ranked = sorted(elites + candidates, key=lambda c: (-c["fitness"], c["smiles"]))[:5]
    return ranked, {"attempted": attempted, "valid": len(candidates), "invalid": invalid, "duplicates": duplicates,
                    "average": round(sum(c["fitness"] for c in candidates) / len(candidates), 8) if candidates else ranked[0]["fitness"]}


def svg(smiles):
    with rdBase.BlockLogs():
        mol = Chem.MolFromSmiles(smiles)
    if mol is None or mol.GetNumAtoms() == 0 or mol.GetNumAtoms() > 100:
        raise ValueError("Invalid molecule or more than 100 atoms.")
    drawer = rdMolDraw2D.MolDraw2DSVG(460, 250)
    opts = drawer.drawOptions()
    opts.clearBackground = False
    opts.setAtomPalette({6: (0.77, .86, .87), 7: (.4, .65, 1), 8: (1, .45, .42), 9: (.48, .88, .57), 16: (1, .8, .3), 17: (.48, .88, .57)})
    drawer.DrawMolecule(mol)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def scene_data(smiles):
    """Deterministic illustrative conformer; not a validated molecular structure."""
    from rdkit.Chem import AllChem
    mol = Chem.MolFromSmiles(smiles)
    if mol is None or mol.GetNumAtoms() == 0 or mol.GetNumAtoms() > 50:
        raise ValueError("Enter a valid molecule with at most 50 heavy atoms.")
    hydrated = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    embedded = AllChem.EmbedMolecule(hydrated, params) == 0
    if embedded:
        try:
            AllChem.MMFFOptimizeMolecule(hydrated, maxIters=100)
        except Exception:
            pass
        display = Chem.RemoveHs(hydrated)
    else:
        AllChem.Compute2DCoords(mol)
        display = mol
    conformer = display.GetConformer()
    return {"smiles": Chem.MolToSmiles(mol), "geometry": "illustrative-conformer" if embedded else "2d-layout",
            "atoms": [{"element": a.GetSymbol(), "position": [round(float(v), 5) for v in conformer.GetAtomPosition(a.GetIdx())]} for a in display.GetAtoms()],
            "bonds": [{"start": b.GetBeginAtomIdx(), "end": b.GetEndAtomIdx(), "order": b.GetBondTypeAsDouble()} for b in display.GetBonds()]}
