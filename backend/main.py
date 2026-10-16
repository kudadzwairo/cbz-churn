"""Staff API for the CBZ customer churn prototype."""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cbz_churn.features import RAW_REQUIRED, SNAPSHOT_DATE, engineer_features
from cbz_churn.scoring import retention_actions, signal_notes, status_from_probability

ARTIFACT_PATH = ROOT / "models" / "cbz_churn_model.joblib"
CARD_PATH = ROOT / "models" / "model_card.json"

app = FastAPI(title="CBZ Churn Prediction", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_artifact = None


def get_artifact():
    global _artifact
    if _artifact is None:
        if not ARTIFACT_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail="The trained model file is not available yet.",
            )
        _artifact = joblib.load(ARTIFACT_PATH)
    return _artifact


class CustomerIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    credit_sco: float = Field(..., ge=0, le=900)
    gender: str
    age: float = Field(..., ge=18, le=100)
    occupation: str
    balance_usd: float = Field(..., ge=0)
    monthly_income_usd: float = Field(..., ge=0)
    tenure_ye: float = Field(..., ge=0, le=80)
    married: str
    nums_card: float = Field(..., ge=0, le=20)
    nums_service: float = Field(..., ge=0, le=30)
    active_member: str
    last_active_date: str
    last_transaction_month_usd: float = Field(..., ge=0)
    created_date: str
    customer_segment: str
    engagement_score: float = Field(..., ge=0, le=100)
    loyalty_level: str


def _score_frame(raw: pd.DataFrame) -> list[dict]:
    artifact = get_artifact()
    features = engineer_features(raw, snapshot=artifact["snapshot_date"])
    probability = artifact["pipeline"].predict_proba(features)[:, 1]
    threshold = float(artifact["decision_threshold"])
    profile = artifact.get("profile", {})
    rows = []
    for index, chance in enumerate(probability):
        source = raw.iloc[index].to_dict()
        status = status_from_probability(float(chance))
        customer_id = source.get("id")
        if customer_id is None or pd.isna(customer_id) or str(customer_id).strip() == "":
            customer_id = None
        else:
            customer_id = str(customer_id)
        rows.append({
            "id": customer_id,
            "customer_segment": str(source.get("customer_segment", "")),
            "probability": round(float(chance), 4),
            "status": status,
            "likely_to_churn": bool(chance >= threshold),
            "signals": signal_notes(source, profile),
            "actions": retention_actions(source, status),
        })
    return rows


def _read_upload(payload: bytes) -> pd.DataFrame:
    try:
        frame = pd.read_csv(io.BytesIO(payload))
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"The CSV could not be read: {error}") from error
    if frame.empty:
        raise HTTPException(status_code=400, detail="The CSV has no customer rows.")
    hidden = [
        column for column in frame.columns
        if str(column).strip().lower() in {"full_name", "name", "address", "residential_address", "physical_address", "origin_province"}
    ]
    if hidden:
        frame = frame.drop(columns=hidden)
    missing = [column for column in RAW_REQUIRED if column not in frame.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Missing columns: " + ", ".join(missing),
        )
    return frame


@app.get("/api/health")
def health():
    ready = ARTIFACT_PATH.exists()
    return {"status": "ok" if ready else "model_missing", "model_ready": ready}


@app.get("/api/model")
def model_card():
    if not CARD_PATH.exists():
        raise HTTPException(status_code=503, detail="Model card has not been written yet.")
    return json.loads(CARD_PATH.read_text())


@app.get("/api/examples")
def examples():
    artifact = get_artifact()
    hidden = {"full_name", "name", "address", "origin_province"}
    public = []
    for example in artifact["examples"]:
        values = {key: value for key, value in example["values"].items() if key not in hidden}
        public.append({"label": example["label"], "values": values})
    return {"snapshot_date": str(artifact["snapshot_date"].date()), "examples": public}


@app.post("/api/predict")
def predict(customer: CustomerIn):
    frame = pd.DataFrame([customer.model_dump()])
    try:
        scored = _score_frame(frame)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    result = scored[0]
    result["snapshot_date"] = str(get_artifact()["snapshot_date"].date())
    result["decision_threshold"] = float(get_artifact()["decision_threshold"])
    return result


@app.post("/api/predict/batch")
async def predict_batch(file: UploadFile = File(...)):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(payload) > 25_000_000:
        raise HTTPException(status_code=400, detail="Please upload a CSV smaller than 25 MB.")
    frame = _read_upload(payload)
    if len(frame) > 20000:
        raise HTTPException(status_code=400, detail="Please score at most 20,000 customers at a time.")
    try:
        scored = _score_frame(frame)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    summary = {status: 0 for status in ["Churned", "At-Risk High", "At-Risk Medium", "At-Risk Low", "Retained"]}
    for row in scored:
        summary[row["status"]] += 1
    ranked = sorted(scored, key=lambda row: row["probability"], reverse=True)
    return {
        "scored_count": len(ranked),
        "shown_count": min(len(ranked), 400),
        "summary": summary,
        "rows": ranked[:400],
        "snapshot_date": str(SNAPSHOT_DATE.date()),
    }


@app.post("/api/predict/batch.csv")
async def predict_batch_csv(file: UploadFile = File(...)):
    payload = await file.read()
    frame = _read_upload(payload)
    if len(frame) > 20000:
        raise HTTPException(status_code=400, detail="Please score at most 20,000 customers at a time.")
    scored = _score_frame(frame)
    export = pd.DataFrame(scored)
    export["actions"] = export["actions"].apply(lambda items: " | ".join(items))
    export["signals"] = export["signals"].apply(lambda items: " | ".join(items))
    buffer = io.StringIO()
    export.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cbz_churn_scores.csv"},
    )
