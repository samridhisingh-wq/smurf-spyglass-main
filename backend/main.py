from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, UploadFile, File, HTTPException
import pandas as pd
import time

from detectors.validators import validate_csv
from detectors.graph_builder import build_graph
from detectors.cycle_detector import detect_cycles
from detectors.smurfing_detector import detect_smurfing
from detectors.shell_detector import detect_shell_chains
from detectors.ring_merger import merge_rings
from detectors.scoring import score_account
from detectors.refinement import final_format

app = FastAPI(
    title="MuleCatcher AML Engine",
    description="Explainable, deterministic AML decision-support system",
    version="3.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "running"}

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    start_time = time.time()

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files allowed")

    try:
        df = pd.read_csv(file.file)
    except:
        raise HTTPException(status_code=400, detail="Invalid CSV format")

    validation = validate_csv(df)
    if not all(validation.values()):
        raise HTTPException(status_code=400, detail="CSV validation failed")

    G = build_graph(df)

    cycles = detect_cycles(G)
    smurfing = detect_smurfing(df)
    shell = detect_shell_chains(G)

    rings = merge_rings(cycles + shell)

    account_patterns = {}

    for pattern in cycles:
        for acc in pattern:
            account_patterns.setdefault(acc, set()).add("cycle")

    for pattern in shell:
        for acc in pattern:
            account_patterns.setdefault(acc, set()).add("shell")

    for s in smurfing:
        account_patterns.setdefault(s["receiver"], set()).add("smurfing")

    suspicious_accounts = []
    for acc, patterns in account_patterns.items():
        base_score = score_account(patterns)
        suspicious_accounts.append({
            "account_id": acc,
            "suspicion_score": base_score,
            "detected_patterns": list(patterns)
        })

    processing_time = time.time() - start_time

    return final_format(suspicious_accounts, rings, df, processing_time)