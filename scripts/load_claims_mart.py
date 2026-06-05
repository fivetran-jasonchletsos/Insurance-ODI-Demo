"""
Generate + load Verity Insurance "Claims Mart" into Oracle RDS.

Mirrors the Altavest/Clarity loader pattern but targets Oracle (python-oracledb
in thin mode). Defines a P&C claims warehouse schema in the CLAIMS_MART schema:
claim_statuses, peril_types, adjusters, claims, claim_payments,
claim_reserves_history, claim_notes, subrogation_recoveries.

A Fivetran Oracle connector then mirrors CLAIMS_MART into the lake.

Env (read from this repo's .env, falls back to the shared Healthcare demo .env):

    ORACLE_HOST              (required)
    ORACLE_PORT              (default: 1521)
    ORACLE_SERVICE           (default: ORCL)
    ORACLE_USERNAME          (default: admin)
    ORACLE_PASSWORD          (required)
    VERITY_CLAIMS_SCHEMA     (default: CLAIMS_MART)
"""

import os
import sys
import math
import random
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import oracledb
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = REPO_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "load_claims_mart.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("verity")

# Load .env: prefer this repo's, then fall back to the shared Healthcare demo
load_dotenv(REPO_ROOT / ".env")
SHARED_ENV = Path.home() / "Documents" / "GitHub" / "Healthcare-Epic-MDLS-DuckDB" / ".env"
if SHARED_ENV.exists():
    load_dotenv(SHARED_ENV, override=False)

HOST = os.getenv("ORACLE_HOST", "").strip()
PORT = int(os.getenv("ORACLE_PORT", "1521"))
SERVICE = os.getenv("ORACLE_SERVICE", "ORCL")
USER = os.getenv("ORACLE_USERNAME", "admin")
PWD = os.getenv("ORACLE_PASSWORD")
TARGET_SCHEMA = os.getenv("VERITY_CLAIMS_SCHEMA", "CLAIMS_MART").upper()

if not HOST:
    log.error("ORACLE_HOST not set in .env (or the shared Healthcare demo .env).")
    log.error("  Add ORACLE_HOST=<rds endpoint> to one of:")
    log.error(f"    {REPO_ROOT / '.env'}")
    log.error(f"    {SHARED_ENV}")
    sys.exit(1)

if not PWD:
    log.error("ORACLE_PASSWORD not set in .env (or the shared Healthcare demo .env).")
    sys.exit(1)

DSN = f"{HOST}:{PORT}/{SERVICE}"
# Effective schema is resolved at runtime (may fall back to the connecting user).
EFFECTIVE_SCHEMA = TARGET_SCHEMA

# ─── Schema ────────────────────────────────────────────────────────────────────

TABLE_DEFS = {
    "CLAIM_STATUSES": {
        "columns": [
            ("STATUS_CODE", "VARCHAR2(20) PRIMARY KEY"),
            ("DESCRIPTION", "VARCHAR2(120)"),
        ],
    },
    "PERIL_TYPES": {
        "columns": [
            ("PERIL_CODE", "VARCHAR2(20) PRIMARY KEY"),
            ("PERIL_NAME", "VARCHAR2(80)"),
            ("CAT_FLAG", "CHAR(1)"),
        ],
    },
    "ADJUSTERS": {
        "columns": [
            ("ADJUSTER_ID", "NUMBER(10) PRIMARY KEY"),
            ("ADJUSTER_NAME", "VARCHAR2(120)"),
            ("TEAM", "VARCHAR2(40)"),
            ("REGION", "VARCHAR2(20)"),
            ("LICENSE_STATE", "CHAR(2)"),
            ("HIRE_DATE", "DATE"),
            ("EXPERIENCE_YEARS", "NUMBER(4,1)"),
        ],
    },
    "CLAIMS": {
        "columns": [
            ("CLAIM_ID", "NUMBER(12) PRIMARY KEY"),
            ("CLAIM_NUMBER", "VARCHAR2(20)"),
            ("POLICY_NUMBER", "VARCHAR2(20)"),
            ("POLICYHOLDER_NAME", "VARCHAR2(160)"),
            ("DATE_OF_LOSS", "DATE"),
            ("REPORTED_DATE", "DATE"),
            ("PERIL_CODE", "VARCHAR2(20)"),
            ("STATUS_CODE", "VARCHAR2(20)"),
            ("ADJUSTER_ID", "NUMBER(10)"),
            ("LOSS_STATE", "CHAR(2)"),
            ("LOSS_ZIP", "VARCHAR2(10)"),
            ("ESTIMATED_LOSS_USD", "NUMBER(14,2)"),
            ("RESERVE_USD", "NUMBER(14,2)"),
            ("PAID_TO_DATE_USD", "NUMBER(14,2)"),
            ("DEDUCTIBLE_USD", "NUMBER(10,2)"),
            ("CAT_CODE", "VARCHAR2(10)"),
            ("LITIGATION_FLAG", "CHAR(1)"),
            ("FRAUD_FLAG", "CHAR(1)"),
            ("CREATED_AT", "TIMESTAMP"),
            ("UPDATED_AT", "TIMESTAMP"),
        ],
        "indexes": ["STATUS_CODE", "DATE_OF_LOSS", "POLICY_NUMBER"],
    },
    "CLAIM_PAYMENTS": {
        "columns": [
            ("PAYMENT_ID", "NUMBER(12) PRIMARY KEY"),
            ("CLAIM_ID", "NUMBER(12)"),
            ("PAYMENT_DATE", "DATE"),
            ("PAYMENT_TYPE", "VARCHAR2(20)"),
            ("AMOUNT_USD", "NUMBER(14,2)"),
            ("PAYEE_TYPE", "VARCHAR2(30)"),
            ("CHECK_NUMBER", "VARCHAR2(20)"),
            ("POSTED_AT", "TIMESTAMP"),
        ],
        "indexes": ["CLAIM_ID"],
    },
    "CLAIM_RESERVES_HISTORY": {
        "columns": [
            ("RESERVE_ID", "NUMBER(12) PRIMARY KEY"),
            ("CLAIM_ID", "NUMBER(12)"),
            ("AS_OF", "DATE"),
            ("RESERVE_USD", "NUMBER(14,2)"),
            ("CHANGE_REASON", "VARCHAR2(60)"),
            ("ADJUSTER_ID", "NUMBER(10)"),
            ("CREATED_AT", "TIMESTAMP"),
        ],
        "indexes": ["CLAIM_ID"],
    },
    "CLAIM_NOTES": {
        "columns": [
            ("NOTE_ID", "NUMBER(12) PRIMARY KEY"),
            ("CLAIM_ID", "NUMBER(12)"),
            ("NOTE_DATE", "DATE"),
            ("NOTE_TYPE", "VARCHAR2(30)"),
            ("AUTHOR", "VARCHAR2(80)"),
            ("NOTE_TEXT", "VARCHAR2(500)"),
        ],
        "indexes": ["CLAIM_ID"],
    },
    "SUBROGATION_RECOVERIES": {
        "columns": [
            ("RECOVERY_ID", "NUMBER(12) PRIMARY KEY"),
            ("CLAIM_ID", "NUMBER(12)"),
            ("RECOVERED_DATE", "DATE"),
            ("RECOVERY_USD", "NUMBER(14,2)"),
            ("COUNTERPARTY", "VARCHAR2(120)"),
            ("STATUS", "VARCHAR2(20)"),
        ],
        "indexes": ["CLAIM_ID"],
    },
}

LOAD_ORDER = [
    "CLAIM_STATUSES", "PERIL_TYPES", "ADJUSTERS", "CLAIMS",
    "CLAIM_PAYMENTS", "CLAIM_RESERVES_HISTORY", "CLAIM_NOTES",
    "SUBROGATION_RECOVERIES",
]

# ─── Synthetic generators ─────────────────────────────────────────────────────

random.seed(42)

STATUS_ROWS = [
    ("OPEN", "Claim acknowledged, initial triage"),
    ("INVESTIGATING", "Coverage / cause-of-loss investigation in progress"),
    ("RESERVED", "Indemnity and expense reserves posted"),
    ("IN_LITIGATION", "Active lawsuit; defense counsel assigned"),
    ("SETTLED", "Settlement reached, awaiting final payment"),
    ("CLOSED_PAID", "Claim closed after full payment of indemnity"),
    ("CLOSED_NO_PAY", "Claim closed without payment (no coverage / withdrawn)"),
    ("DENIED", "Coverage denied per policy terms"),
    ("REOPENED", "Previously closed claim reopened for new exposure"),
    ("SUBROGATION", "In subrogation pursuit against responsible third party"),
]

PERIL_ROWS = [
    ("COLLISION", "Auto Collision", "N"),
    ("COMPREHENSIVE", "Auto Comprehensive", "N"),
    ("FIRE", "Property Fire", "N"),
    ("THEFT", "Theft / Burglary", "N"),
    ("WIND", "Wind Damage", "N"),
    ("HAIL", "Hail Damage", "Y"),
    ("FLOOD", "Flood", "Y"),
    ("WATER_NON_WX", "Water (non-weather)", "N"),
    ("LIABILITY_BI", "Bodily Injury Liability", "N"),
    ("LIABILITY_PD", "Property Damage Liability", "N"),
    ("WORKERS_COMP", "Workers Compensation", "N"),
    ("EQ", "Earthquake", "Y"),
    ("HURRICANE", "Hurricane / Tropical Storm", "Y"),
    ("TORNADO", "Tornado", "Y"),
    ("WILDFIRE", "Wildfire", "Y"),
    ("WINTER_STORM", "Winter Storm / Freeze", "Y"),
    ("LIGHTNING", "Lightning Strike", "N"),
    ("VANDALISM", "Vandalism / Malicious Mischief", "N"),
    ("ANIMAL", "Animal Strike", "N"),
    ("GLASS", "Glass Breakage", "N"),
    ("MEDPAY", "Medical Payments", "N"),
    ("PIP", "Personal Injury Protection", "N"),
    ("UM_UIM", "Uninsured / Underinsured Motorist", "N"),
    ("UMBRELLA", "Umbrella Liability", "N"),
]

# Realistic weighted peril distribution for P&C book.
PERIL_WEIGHTS = {
    "COLLISION": 18, "COMPREHENSIVE": 8, "FIRE": 4, "THEFT": 5,
    "WIND": 7, "HAIL": 6, "FLOOD": 2, "WATER_NON_WX": 8,
    "LIABILITY_BI": 6, "LIABILITY_PD": 7, "WORKERS_COMP": 4,
    "EQ": 1, "HURRICANE": 2, "TORNADO": 1, "WILDFIRE": 2,
    "WINTER_STORM": 3, "LIGHTNING": 2, "VANDALISM": 3,
    "ANIMAL": 2, "GLASS": 4, "MEDPAY": 2, "PIP": 2,
    "UM_UIM": 1, "UMBRELLA": 1,
}

# Weighted status distribution — most claims either CLOSED_PAID or OPEN.
STATUS_WEIGHTS = {
    "CLOSED_PAID": 52, "OPEN": 14, "RESERVED": 8, "INVESTIGATING": 6,
    "SETTLED": 5, "CLOSED_NO_PAY": 5, "DENIED": 4, "IN_LITIGATION": 3,
    "SUBROGATION": 2, "REOPENED": 1,
}

CAT_CODES = [None, None, None, None, None, None, None,
             "CAT-26A", "CAT-26B", "CAT-26C", "CAT-25Q4", "CAT-25Q3"]

TEAMS = ["Auto-Express", "Auto-Complex", "Property-SFR", "Property-Commercial",
         "Liability-GL", "Liability-BI", "WC-East", "WC-West", "Cat-Response", "SIU"]
REGIONS = ["NE", "MA", "SE", "MW", "SW", "PNW", "CA", "MTN"]
STATES = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI",
          "NJ", "VA", "WA", "AZ", "MA", "TN", "IN", "MO", "MD", "WI",
          "CO", "MN", "SC", "AL", "LA", "KY", "OR", "OK", "CT", "IA",
          "MS", "AR", "KS", "UT", "NV", "NM", "NE", "WV", "ID", "HI",
          "NH", "ME", "MT", "RI", "DE", "SD", "ND", "AK", "VT", "WY"]

FIRST_NAMES = ["Alex", "Morgan", "Taylor", "Jordan", "Casey", "Riley", "Jamie",
               "Avery", "Quinn", "Cameron", "Drew", "Reese", "Sam", "Hayden",
               "Skyler", "Parker", "Rowan", "Emerson", "Finley", "Sage",
               "Maria", "Jose", "David", "Sarah", "Michael", "Jennifer",
               "Robert", "Linda", "James", "Patricia", "John", "Barbara",
               "William", "Elizabeth", "Richard", "Susan", "Joseph", "Jessica",
               "Thomas", "Karen", "Charles", "Nancy", "Daniel", "Lisa"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
              "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez",
              "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore",
              "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
              "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
              "Walker", "Young", "Allen", "King", "Wright", "Scott",
              "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams",
              "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
              "Carter", "Roberts", "Patel", "Iyer", "Okafor", "Cohen"]

NOTE_TYPES = ["CONTACT", "INSPECTION", "ESTIMATE", "COVERAGE_REVIEW",
              "RESERVE_CHANGE", "LITIGATION", "SIU_REFERRAL", "MEDICAL_REVIEW",
              "REPAIR_AUTH", "SETTLEMENT_OFFER", "DENIAL_RATIONALE", "CLOSURE"]

NOTE_SNIPPETS = [
    "Spoke with insured; confirmed loss circumstances and obtained recorded statement.",
    "Field inspection completed; photos uploaded to claim file.",
    "Estimate received from approved shop; reviewing line items vs. industry guides.",
    "Coverage A confirmed; deductible applied per policy form HO3-2024.",
    "Reserve adjusted upward to reflect updated medical specials.",
    "Suit filed by claimant counsel; defense counsel assigned via panel.",
    "Referred to SIU due to inconsistent statements and prior loss history.",
    "IME scheduled with Dr. patel for orthopedic eval.",
    "Repair authorization issued to shop; ACV settlement letter mailed.",
    "Settlement offer extended at policy limits; awaiting release.",
    "Denial issued — loss falls outside policy effective dates.",
    "Final payment posted; claim closed in system.",
    "Subrogation demand letter sent to at-fault carrier.",
    "Salvage proceeds received from auction; net of fees applied.",
    "Mitigation vendor on site within 4 hours of FNOL.",
]

CHANGE_REASONS = ["INITIAL_RESERVE", "ESTIMATE_RECEIVED", "MEDICAL_UPDATE",
                  "LITIGATION_ADDED", "POLICY_LIMIT_REVIEW", "DEMAND_RECEIVED",
                  "SUBRO_RECOVERY_EXPECTED", "REOPEN_ADJUSTMENT",
                  "SETTLEMENT_NEGOTIATION", "EXPERT_REPORT"]

PAYMENT_TYPES_W = (["INDEMNITY"] * 55 + ["EXPENSE"] * 18 + ["MEDICAL"] * 12 +
                   ["LEGAL"] * 10 + ["SALVAGE_REVENUE"] * 5)
PAYEE_TYPES = ["INSURED", "CLAIMANT", "REPAIR_SHOP", "MEDICAL_PROVIDER",
               "LAW_FIRM", "VENDOR", "MORTGAGEE", "SUBROGEE"]

COUNTERPARTIES = ["State Farm Mutual", "Geico General", "Progressive Casualty",
                  "Allstate Property & Casualty", "Liberty Mutual",
                  "Farmers Insurance Exchange", "Nationwide Mutual",
                  "Travelers Indemnity", "USAA Casualty", "American Family Mutual",
                  "Erie Insurance Exchange", "AAA Mid-Atlantic",
                  "Hartford Fire", "Mercury Casualty", "MetLife Auto & Home"]


def weighted_choice(weights_dict):
    keys = list(weights_dict.keys())
    weights = list(weights_dict.values())
    return random.choices(keys, weights=weights, k=1)[0]


def lognormal_amount(mu, sigma, floor=50.0, ceil=2_500_000.0):
    """Skewed dollar amount — most small, occasional large."""
    x = math.exp(random.gauss(mu, sigma))
    return float(max(floor, min(ceil, round(x, 2))))


def gen_claim_statuses():
    return [{"STATUS_CODE": c, "DESCRIPTION": d} for c, d in STATUS_ROWS]


def gen_peril_types():
    return [{"PERIL_CODE": c, "PERIL_NAME": n, "CAT_FLAG": f}
            for c, n, f in PERIL_ROWS]


def gen_adjusters(n=120):
    rows = []
    for i in range(1, n + 1):
        hire = date(2010, 1, 1) + timedelta(days=random.randint(0, 5800))
        exp = round(max(0.5, (date(2026, 5, 24) - hire).days / 365.25 +
                        random.uniform(-1.5, 1.5)), 1)
        rows.append({
            "ADJUSTER_ID":      10_000 + i,
            "ADJUSTER_NAME":    f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            "TEAM":             random.choice(TEAMS),
            "REGION":           random.choice(REGIONS),
            "LICENSE_STATE":    random.choice(STATES),
            "HIRE_DATE":        hire,
            "EXPERIENCE_YEARS": exp,
        })
    return rows


def gen_claims(adjusters, n=22_000):
    rows = []
    start = date(2024, 1, 1)
    horizon_days = (date(2026, 5, 24) - start).days
    for i in range(1, n + 1):
        peril = weighted_choice(PERIL_WEIGHTS)
        status = weighted_choice(STATUS_WEIGHTS)
        dol = start + timedelta(days=random.randint(0, horizon_days))
        reported = dol + timedelta(days=random.randint(0, 14))

        # Loss amounts skewed log-normal by peril severity.
        if peril in ("LIABILITY_BI", "WORKERS_COMP", "HURRICANE", "WILDFIRE", "EQ", "FIRE"):
            est = lognormal_amount(mu=10.5, sigma=1.4)
        elif peril in ("LIABILITY_PD", "COLLISION", "FLOOD", "TORNADO", "WIND", "HAIL"):
            est = lognormal_amount(mu=9.2, sigma=1.1)
        elif peril in ("GLASS", "ANIMAL", "MEDPAY", "VANDALISM"):
            est = lognormal_amount(mu=7.0, sigma=0.7)
        else:
            est = lognormal_amount(mu=8.4, sigma=1.0)

        if status == "CLOSED_PAID":
            paid = round(est * random.uniform(0.6, 1.0), 2)
            reserve = 0.0
        elif status == "CLOSED_NO_PAY" or status == "DENIED":
            paid = 0.0
            reserve = 0.0
        elif status == "SETTLED":
            paid = round(est * random.uniform(0.4, 0.85), 2)
            reserve = round(est - paid, 2)
        elif status in ("OPEN", "INVESTIGATING", "RESERVED", "REOPENED"):
            paid = round(est * random.uniform(0.0, 0.4), 2)
            reserve = round(max(0.0, est - paid) * random.uniform(0.7, 1.2), 2)
        elif status == "IN_LITIGATION":
            paid = round(est * random.uniform(0.05, 0.3), 2)
            reserve = round(est * random.uniform(1.0, 1.8), 2)
        elif status == "SUBROGATION":
            paid = round(est * random.uniform(0.7, 1.0), 2)
            reserve = round(est * random.uniform(0.05, 0.2), 2)
        else:
            paid = 0.0
            reserve = round(est, 2)

        deductible = float(random.choice([0, 250, 500, 500, 1000, 1000, 1500, 2500, 5000]))
        cat = random.choice(CAT_CODES)
        if peril in ("HURRICANE", "TORNADO", "WILDFIRE", "EQ") and not cat:
            cat = random.choice(["CAT-26A", "CAT-26B", "CAT-25Q4"])

        litigation = "Y" if status == "IN_LITIGATION" or random.random() < 0.03 else "N"
        fraud = "Y" if random.random() < 0.012 else "N"

        adj = random.choice(adjusters)
        now = datetime(2026, 5, 24, 7, 14, 0)
        created = datetime.combine(reported, datetime.min.time()) + timedelta(hours=random.randint(1, 36))

        rows.append({
            "CLAIM_ID":           500_000 + i,
            "CLAIM_NUMBER":       f"VRT-{dol.year}-{500_000 + i:07d}",
            "POLICY_NUMBER":      f"POL-{random.randint(1_000_000, 9_999_999)}",
            "POLICYHOLDER_NAME":  f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            "DATE_OF_LOSS":       dol,
            "REPORTED_DATE":      reported,
            "PERIL_CODE":         peril,
            "STATUS_CODE":        status,
            "ADJUSTER_ID":        adj["ADJUSTER_ID"],
            "LOSS_STATE":         random.choice(STATES),
            "LOSS_ZIP":           f"{random.randint(1001, 99950):05d}",
            "ESTIMATED_LOSS_USD": est,
            "RESERVE_USD":        reserve,
            "PAID_TO_DATE_USD":   paid,
            "DEDUCTIBLE_USD":     deductible,
            "CAT_CODE":           cat,
            "LITIGATION_FLAG":    litigation,
            "FRAUD_FLAG":         fraud,
            "CREATED_AT":         created,
            "UPDATED_AT":         now,
        })
    return rows


def gen_claim_payments(claims, target_n=38_000):
    rows = []
    pid = 800_000
    # Distribute payments roughly 38k / 22k ≈ 1.7 per claim, skewed.
    payments_per_claim_pool = [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 7]
    for c in claims:
        # Only claims with paid > 0 (or salvage) get payment rows.
        if c["PAID_TO_DATE_USD"] <= 0 and c["STATUS_CODE"] not in ("SUBROGATION",):
            if random.random() > 0.05:
                continue
        n_pay = random.choice(payments_per_claim_pool)
        if n_pay == 0:
            continue
        total_paid = c["PAID_TO_DATE_USD"] or lognormal_amount(7.5, 0.9, floor=100.0, ceil=50_000.0)
        # Split total across n_pay payments roughly.
        splits = [random.random() for _ in range(n_pay)]
        s = sum(splits) or 1.0
        splits = [x / s for x in splits]
        base_date = c["REPORTED_DATE"]
        for k, frac in enumerate(splits):
            pid += 1
            ptype = random.choice(PAYMENT_TYPES_W)
            amt = round(total_paid * frac, 2)
            if ptype == "SALVAGE_REVENUE":
                amt = -round(abs(amt) * random.uniform(0.1, 0.3), 2)
            elif ptype == "EXPENSE":
                amt = round(amt * random.uniform(0.05, 0.25), 2)
            elif ptype == "LEGAL":
                amt = round(amt * random.uniform(0.1, 0.4), 2)
            elif ptype == "MEDICAL":
                amt = round(amt * random.uniform(0.2, 0.7), 2)
            pay_date = base_date + timedelta(days=random.randint(3, 220))
            posted = datetime.combine(pay_date, datetime.min.time()) + timedelta(hours=random.randint(8, 18))
            rows.append({
                "PAYMENT_ID":   pid,
                "CLAIM_ID":     c["CLAIM_ID"],
                "PAYMENT_DATE": pay_date,
                "PAYMENT_TYPE": ptype,
                "AMOUNT_USD":   amt,
                "PAYEE_TYPE":   random.choice(PAYEE_TYPES),
                "CHECK_NUMBER": f"CHK-{random.randint(100000, 999999)}",
                "POSTED_AT":    posted,
            })
            if len(rows) >= target_n:
                return rows
    return rows


def gen_reserves_history(claims, adjusters, target_n=60_000):
    rows = []
    rid = 2_000_000
    # ~2.7 reserve changes per claim.
    for c in claims:
        n_ch = random.choices([1, 2, 3, 4, 5, 6, 8],
                              weights=[18, 22, 20, 15, 10, 8, 7], k=1)[0]
        if c["STATUS_CODE"] in ("CLOSED_NO_PAY", "DENIED"):
            n_ch = random.choice([1, 1, 2])
        base = c["RESERVE_USD"] or c["ESTIMATED_LOSS_USD"]
        cur = max(0.0, base * random.uniform(0.4, 0.9))
        as_of = c["REPORTED_DATE"]
        adj_id = c["ADJUSTER_ID"]
        for k in range(n_ch):
            rid += 1
            as_of = as_of + timedelta(days=random.randint(7, 95))
            # Drift the reserve.
            cur = max(0.0, cur * random.uniform(0.85, 1.25))
            rows.append({
                "RESERVE_ID":    rid,
                "CLAIM_ID":      c["CLAIM_ID"],
                "AS_OF":         as_of,
                "RESERVE_USD":   round(cur, 2),
                "CHANGE_REASON": random.choice(CHANGE_REASONS),
                "ADJUSTER_ID":   adj_id if random.random() > 0.1 else random.choice(adjusters)["ADJUSTER_ID"],
                "CREATED_AT":    datetime.combine(as_of, datetime.min.time()) + timedelta(hours=random.randint(8, 17)),
            })
            if len(rows) >= target_n:
                return rows
    return rows


def gen_claim_notes(claims, adjusters, target_n=80_000):
    rows = []
    nid = 3_000_000
    adjuster_names = [a["ADJUSTER_NAME"] for a in adjusters]
    for c in claims:
        n_notes = random.choices([1, 2, 3, 4, 5, 6, 8, 10, 14],
                                 weights=[10, 14, 18, 16, 12, 10, 8, 7, 5], k=1)[0]
        if c["STATUS_CODE"] == "IN_LITIGATION":
            n_notes += random.randint(3, 8)
        as_of = c["REPORTED_DATE"]
        for k in range(n_notes):
            nid += 1
            as_of = as_of + timedelta(days=random.randint(1, 30))
            rows.append({
                "NOTE_ID":   nid,
                "CLAIM_ID":  c["CLAIM_ID"],
                "NOTE_DATE": as_of,
                "NOTE_TYPE": random.choice(NOTE_TYPES),
                "AUTHOR":    random.choice(adjuster_names),
                "NOTE_TEXT": random.choice(NOTE_SNIPPETS),
            })
            if len(rows) >= target_n:
                return rows
    return rows


def gen_subrogation(claims, target_n=3_000):
    rows = []
    sid = 4_000_000
    # Bias toward claims marked SUBROGATION + a long tail elsewhere.
    pool = [c for c in claims if c["STATUS_CODE"] == "SUBROGATION"]
    extra = [c for c in claims if c["STATUS_CODE"] in ("CLOSED_PAID", "SETTLED")
             and c["PERIL_CODE"] in ("COLLISION", "LIABILITY_PD", "WATER_NON_WX")]
    candidates = pool + random.sample(extra, min(len(extra), target_n * 3))
    random.shuffle(candidates)
    statuses_w = (["PURSUING"] * 35 + ["DEMAND_SENT"] * 25 + ["RECOVERED"] * 25 +
                  ["CLOSED_NO_RECOVERY"] * 15)
    for c in candidates:
        if len(rows) >= target_n:
            break
        sid += 1
        recovered_date = c["REPORTED_DATE"] + timedelta(days=random.randint(60, 540))
        status = random.choice(statuses_w)
        if status == "RECOVERED":
            recovery = round((c["PAID_TO_DATE_USD"] or c["ESTIMATED_LOSS_USD"]) *
                             random.uniform(0.2, 0.9), 2)
        elif status == "CLOSED_NO_RECOVERY":
            recovery = 0.0
        else:
            recovery = round((c["PAID_TO_DATE_USD"] or c["ESTIMATED_LOSS_USD"]) *
                             random.uniform(0.05, 0.4), 2)
        rows.append({
            "RECOVERY_ID":    sid,
            "CLAIM_ID":       c["CLAIM_ID"],
            "RECOVERED_DATE": recovered_date,
            "RECOVERY_USD":   recovery,
            "COUNTERPARTY":   random.choice(COUNTERPARTIES),
            "STATUS":         status,
        })
    return rows


# ─── Oracle DB helpers ─────────────────────────────────────────────────────────

def connect():
    return oracledb.connect(user=USER, password=PWD, dsn=DSN)


def ensure_schema(c):
    """Try to CREATE USER for the target schema; fall back to connecting user."""
    global EFFECTIVE_SCHEMA
    cur = c.cursor()
    try:
        cur.execute(f"SELECT username FROM all_users WHERE username = '{TARGET_SCHEMA}'")
        if cur.fetchone():
            EFFECTIVE_SCHEMA = TARGET_SCHEMA
            log.info(f"schema {EFFECTIVE_SCHEMA} already exists; using it")
            return
    except Exception as e:
        log.warning(f"could not check all_users: {e}")
    finally:
        cur.close()

    cur = c.cursor()
    try:
        # Quoted password; Oracle requires explicit quoted identifier for some special chars.
        cur.execute(f'CREATE USER {TARGET_SCHEMA} IDENTIFIED BY "{PWD}"')
        c.commit()
        try:
            cur.execute(f"GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO {TARGET_SCHEMA}")
            c.commit()
        except Exception as ge:
            log.warning(f"could not grant on {TARGET_SCHEMA}: {ge}")
        EFFECTIVE_SCHEMA = TARGET_SCHEMA
        log.info(f"created schema/user {EFFECTIVE_SCHEMA}")
    except Exception as e:
        # ORA-01031 (insufficient privileges) or RDS managed user policy — fall back.
        log.warning(f"could not create user {TARGET_SCHEMA}: {e}")
        EFFECTIVE_SCHEMA = USER.upper()
        log.info(f"falling back to connecting user's schema: {EFFECTIVE_SCHEMA}")
    finally:
        cur.close()


def drop_table(c, tbl):
    cur = c.cursor()
    plsql = f"""
    BEGIN
       EXECUTE IMMEDIATE 'DROP TABLE {EFFECTIVE_SCHEMA}.{tbl} CASCADE CONSTRAINTS';
    EXCEPTION
       WHEN OTHERS THEN
          IF SQLCODE != -942 THEN RAISE; END IF;
    END;
    """
    cur.execute(plsql)
    c.commit()
    cur.close()


def create_table(c, tbl, defn):
    cols = ", ".join(f"{col} {ty}" for col, ty in defn["columns"])
    ddl = f"CREATE TABLE {EFFECTIVE_SCHEMA}.{tbl} ({cols})"
    plsql = f"""
    BEGIN
       EXECUTE IMMEDIATE '{ddl.replace("'", "''")}';
    EXCEPTION
       WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
    END;
    """
    cur = c.cursor()
    cur.execute(plsql)
    c.commit()
    cur.close()
    log.info(f"  created {EFFECTIVE_SCHEMA}.{tbl}")


def create_indexes(c, tbl, defn):
    if "indexes" not in defn:
        return
    cur = c.cursor()
    for col in defn["indexes"]:
        idx = f"IX_{tbl}_{col}"[:30]  # Oracle 11g compat (30-char limit)
        ddl = f"CREATE INDEX {EFFECTIVE_SCHEMA}.{idx} ON {EFFECTIVE_SCHEMA}.{tbl} ({col})"
        plsql = f"""
        BEGIN
           EXECUTE IMMEDIATE '{ddl.replace("'", "''")}';
        EXCEPTION
           WHEN OTHERS THEN
              IF SQLCODE != -955 AND SQLCODE != -1408 THEN RAISE; END IF;
        END;
        """
        cur.execute(plsql)
        c.commit()
    cur.close()


def bulk_insert(c, tbl, defn, rows):
    if not rows:
        log.warning(f"  no rows for {tbl}")
        return 0
    cols = [name for name, _ in defn["columns"]]
    placeholders = ", ".join(f":{i + 1}" for i in range(len(cols)))
    sql = f"INSERT INTO {EFFECTIVE_SCHEMA}.{tbl} ({', '.join(cols)}) VALUES ({placeholders})"
    cur = c.cursor()
    batch = 1000
    total = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        data = [tuple(r.get(col) for col in cols) for r in chunk]
        cur.executemany(sql, data)
        c.commit()
        total += len(chunk)
    cur.close()
    log.info(f"  inserted {total:,} rows into {EFFECTIVE_SCHEMA}.{tbl}")
    return total


def main():
    log.info("=" * 60)
    log.info("VERITY CLAIMS MART → ORACLE RDS")
    log.info(f"  host:    {HOST}:{PORT}")
    log.info(f"  service: {SERVICE}")
    log.info(f"  user:    {USER}")
    log.info(f"  schema:  {TARGET_SCHEMA} (target)")
    log.info("=" * 60)

    log.info("generating synthetic claims mart...")
    statuses = gen_claim_statuses()
    perils = gen_peril_types()
    adjusters = gen_adjusters()
    claims = gen_claims(adjusters)
    payments = gen_claim_payments(claims)
    reserves = gen_reserves_history(claims, adjusters)
    notes = gen_claim_notes(claims, adjusters)
    subro = gen_subrogation(claims)

    data = {
        "CLAIM_STATUSES":         statuses,
        "PERIL_TYPES":            perils,
        "ADJUSTERS":              adjusters,
        "CLAIMS":                 claims,
        "CLAIM_PAYMENTS":         payments,
        "CLAIM_RESERVES_HISTORY": reserves,
        "CLAIM_NOTES":            notes,
        "SUBROGATION_RECOVERIES": subro,
    }
    for tbl in LOAD_ORDER:
        log.info(f"  {tbl}: {len(data[tbl]):,} rows generated")

    c = connect()
    try:
        ensure_schema(c)
        for tbl in LOAD_ORDER:
            log.info(f"loading {tbl}...")
            drop_table(c, tbl)
            create_table(c, tbl, TABLE_DEFS[tbl])
            bulk_insert(c, tbl, TABLE_DEFS[tbl], data[tbl])
            create_indexes(c, tbl, TABLE_DEFS[tbl])
        log.info("=" * 60)
        log.info("LOAD COMPLETE")
        log.info(f"  effective schema: {EFFECTIVE_SCHEMA}")
        log.info("=" * 60)
    finally:
        c.close()


if __name__ == "__main__":
    main()
