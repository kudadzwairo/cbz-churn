"""Risk bands and retention actions shared by the notebook and the API."""

from __future__ import annotations

STATUSES = [
    "Churned",
    "At-Risk High",
    "At-Risk Medium",
    "At-Risk Low",
    "Retained",
]

# Cuts on the calibrated probability of churn. The scores sit near the
# 18% book rate, so an 80% cut would leave the top bands empty. These
# cuts still rise with the chance of leaving, and each one is populated.
BAND_RULES = (
    (0.50, "Churned"),
    (0.40, "At-Risk High"),
    (0.28, "At-Risk Medium"),
    (0.15, "At-Risk Low"),
    (0.00, "Retained"),
)


def status_from_probability(probability: float) -> str:
    for lower, label in BAND_RULES:
        if probability >= lower:
            return label
    return "Retained"


def _number(row, key, default=0.0) -> float:
    value = row.get(key, default)
    try:
        if value is None or value == "":
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _is_active(row) -> bool:
    return str(row.get("active_member", "")).strip().lower() in {"true", "1", "yes", "y"}


def signal_notes(row, profile: dict | None = None) -> list[str]:
    """Plain-language cues a member of staff can check against the profile."""
    profile = profile or {}
    notes = []
    engagement = _number(row, "engagement_score", 0)
    typical_engagement = profile.get("median_engagement")
    if typical_engagement is not None and engagement < typical_engagement:
        notes.append(
            f"Engagement is {engagement:.0f}, below the typical customer at {typical_engagement:.0f}."
        )
    if not _is_active(row):
        notes.append("The customer is not an active member, which in this file is the same pattern as offline banking.")
    if _number(row, "last_transaction_month_usd", 0) <= 0:
        notes.append("No transaction value was recorded in the latest month.")
    income = _number(row, "monthly_income_usd", 0)
    balance = _number(row, "balance_usd", 0)
    if income > 0 and balance < income:
        notes.append("The USD balance is below one month of income.")
    if _number(row, "tenure_ye", 0) <= 1:
        notes.append("The relationship is still in its first year.")
    segment = str(row.get("customer_segment", "")).strip()
    if segment in {"Priority", "Affluent"}:
        notes.append(f"The customer sits in the {segment.lower()} book.")
    return notes[:4]


def retention_actions(row, status: str) -> list[str]:
    """Actions follow the push and pull factors described in Chapter 1."""
    actions = []
    opening = {
        "Churned": (
            "Call within 48 hours. Confirm whether salary or everyday spending has already moved, "
            "and offer a fee review before the account becomes fully dormant."
        ),
        "At-Risk High": (
            "Priority follow-up this week: a personal call, a review of monthly charges, "
            "and a clear reason to keep the main account at CBZ."
        ),
        "At-Risk Medium": (
            "Add the customer to the retention worklist and make a personalised offer within two weeks. "
            "Avoid a blanket message."
        ),
        "At-Risk Low": (
            "A light check-in is enough: prompt CBZ Touch registration or raise the relationship at the next branch visit."
        ),
        "Retained": (
            "No win-back campaign is needed. Keep service steady and recognise the relationship."
        ),
    }
    actions.append(opening[status])

    if not _is_active(row) and status != "Retained":
        actions.append(
            "Invite the customer onto CBZ Touch. Mobile-money convenience is a pull factor in the Zimbabwean market, and an inactive account is easy to leave quiet."
        )
    if _number(row, "last_transaction_month_usd", 0) <= 0 and status != "Retained":
        actions.append(
            "Ask where salary and household payments now go. A quiet account with no formal closure is the silent-churn pattern Chapter 1 highlights."
        )
    income = _number(row, "monthly_income_usd", 0)
    if income > 0 and _number(row, "balance_usd", 0) < income and status in {"Churned", "At-Risk High", "At-Risk Medium"}:
        actions.append(
            "Review service charges with the customer. Cost of transacting is one of the push factors that moves balances out of the bank."
        )
    if _number(row, "tenure_ye", 0) <= 1 and status != "Retained":
        actions.append(
            "Finish early-tenure onboarding with one product the customer will use, rather than a wide product pitch."
        )
    segment = str(row.get("customer_segment", "")).strip()
    if segment in {"Priority", "Affluent"} and status in {"Churned", "At-Risk High"}:
        actions.append(
            f"This {segment.lower()} relationship is worth a relationship manager, not a mass campaign."
        )
    if str(row.get("loyalty_level", "")).strip() == "Gold" and status != "Retained":
        actions.append("Gold loyalty with this risk band should be handled by a named officer.")

    unique = []
    for action in actions:
        if action not in unique:
            unique.append(action)
    return unique[:4]
