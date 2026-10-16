"""Turn raw CBZ customer rows into the model matrix.

The study snapshot is the latest activity date in the modelling file
(1 July 2025). Days since last activity are measured against that date
so a score means the same thing in the notebook and in the staff tool.
"""

from __future__ import annotations

import pandas as pd

SNAPSHOT_DATE = pd.Timestamp("2025-07-01")

NUMERIC_FEATURES = [
    "credit_score",
    "age",
    "balance_usd",
    "monthly_income_usd",
    "tenure_years",
    "cards_held",
    "services_held",
    "monthly_spend_usd",
    "engagement_score",
    "days_since_last_active",
    "account_age_days",
    "balance_to_income",
    "spend_to_income",
    "products_held",
]

CATEGORICAL_FEATURES = [
    "gender",
    "occupation",
    "origin_province",
    "marital_status",
    "active_member",
    "customer_segment",
    "loyalty_level",
]

MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

RAW_REQUIRED = [
    "credit_sco",
    "gender",
    "age",
    "occupation",
    "balance_usd",
    "monthly_income_usd",
    "tenure_ye",
    "married",
    "nums_card",
    "nums_service",
    "active_member",
    "last_active_date",
    "last_transaction_month_usd",
    "created_date",
    "customer_segment",
    "engagement_score",
    "loyalty_level",
]


def _as_frame(records) -> pd.DataFrame:
    if isinstance(records, pd.DataFrame):
        return records.copy()
    return pd.DataFrame(records)


def _yes_no(series: pd.Series) -> pd.Series:
    text = series.astype(str).str.strip().str.lower()
    mapped = text.map({
        "true": "yes",
        "false": "no",
        "1": "yes",
        "0": "no",
        "yes": "yes",
        "no": "no",
        "y": "yes",
        "n": "no",
    })
    return mapped.fillna(text)


def engineer_features(records, snapshot=SNAPSHOT_DATE) -> pd.DataFrame:
    """Build the modelling columns from staff-facing customer fields.

    Names and location are not used. The saved pipeline still expects a
    province column, so that column is filled with a withheld value and
    does not describe where the customer lives. digital_behavior duplicates
    active_member on every row of the study file. risk_score, risk_segment
    and cluster_group are existing scores, so using them would leak another
    model's answer into this one.
    """
    data = _as_frame(records)
    data.columns = [str(column).strip() for column in data.columns]
    missing = [column for column in RAW_REQUIRED if column not in data.columns]
    if missing:
        raise ValueError(
            "The file is missing required columns: " + ", ".join(missing)
        )

    snapshot = pd.Timestamp(snapshot)
    created = pd.to_datetime(data["created_date"], dayfirst=True, errors="coerce")
    last_active = pd.to_datetime(data["last_active_date"], dayfirst=True, errors="coerce")

    frame = pd.DataFrame(index=data.index)
    frame["credit_score"] = pd.to_numeric(data["credit_sco"], errors="coerce")
    frame["age"] = pd.to_numeric(data["age"], errors="coerce")
    frame["balance_usd"] = pd.to_numeric(data["balance_usd"], errors="coerce")
    frame["monthly_income_usd"] = pd.to_numeric(data["monthly_income_usd"], errors="coerce")
    frame["tenure_years"] = pd.to_numeric(data["tenure_ye"], errors="coerce")
    frame["cards_held"] = pd.to_numeric(data["nums_card"], errors="coerce")
    frame["services_held"] = pd.to_numeric(data["nums_service"], errors="coerce")
    frame["monthly_spend_usd"] = pd.to_numeric(data["last_transaction_month_usd"], errors="coerce")
    frame["engagement_score"] = pd.to_numeric(data["engagement_score"], errors="coerce")
    frame["days_since_last_active"] = (snapshot - last_active).dt.days.clip(lower=0)
    frame["account_age_days"] = (snapshot - created).dt.days.clip(lower=0)

    income = frame["monthly_income_usd"].clip(lower=0).fillna(0) + 1
    frame["balance_to_income"] = frame["balance_usd"] / income
    frame["spend_to_income"] = frame["monthly_spend_usd"] / income
    frame["products_held"] = frame["cards_held"].fillna(0) + frame["services_held"].fillna(0)

    frame["gender"] = data["gender"].astype(str).str.strip().str.lower()
    frame["occupation"] = data["occupation"].astype(str).str.strip()
    frame["origin_province"] = "withheld"
    frame["marital_status"] = data["married"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
    frame["active_member"] = _yes_no(data["active_member"])
    frame["customer_segment"] = data["customer_segment"].astype(str).str.strip()
    frame["loyalty_level"] = data["loyalty_level"].astype(str).str.strip()
    return frame[MODEL_FEATURES]
