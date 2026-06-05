"""
Generate + load Verity Insurance Policy Admin System into the shared demo SQL Server.

Mirrors the Altavest pattern: creates a fresh `verity_demo` database on the
existing EC2 SQL Server, defines a SQL-Server-flavoured P&C policy admin schema
(policyholders / agents / products / policies / coverages / endorsements /
premium_ledger / billing_invoices), generates synthetic data, and bulk-loads
via pymssql.

A Fivetran SQL Server connector then mirrors `verity_demo` into the lake.

Env (read from this repo's .env, falls back to the shared Healthcare demo .env):

    SQLSERVER_HOST       (default: ec2-52-89-75-245.us-west-2.compute.amazonaws.com)
    SQLSERVER_PORT       (default: 1433)
    SQLSERVER_USERNAME   (default: sa)
    SQLSERVER_PASSWORD   (required)
    VERITY_DATABASE      (default: verity_demo)
    VERITY_SCHEMA        (default: policy_admin)
"""

import os
import sys
import random
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import pymssql
from dotenv import load_dotenv

REPO_ROOT = Path("/Users/jason.chletsos/Documents/GitHub/Insurance-ODI-Demo")
LOG_DIR = REPO_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "load_policy_admin.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("verity")

# Load .env: prefer this repo's, then fall back to the shared Healthcare demo
# (which is where the SQL Server password lives by default).
load_dotenv(REPO_ROOT / ".env")
SHARED_ENV = Path.home() / "Documents" / "GitHub" / "Healthcare-Epic-MDLS-DuckDB" / ".env"
if SHARED_ENV.exists():
    load_dotenv(SHARED_ENV, override=False)

HOST = os.getenv("SQLSERVER_HOST", "ec2-52-89-75-245.us-west-2.compute.amazonaws.com")
PORT = int(os.getenv("SQLSERVER_PORT", "1433"))
USER = os.getenv("SQLSERVER_USERNAME", "sa")
PWD = os.getenv("SQLSERVER_PASSWORD")
DB = os.getenv("VERITY_DATABASE", "verity_demo")
SCHEMA = os.getenv("VERITY_SCHEMA", "policy_admin")

if not PWD:
    log.error("SQLSERVER_PASSWORD not set in .env (or the shared Healthcare demo .env).")
    sys.exit(1)

# ─── Schema ────────────────────────────────────────────────────────────────────

TABLE_DEFS = {
    "POLICYHOLDERS": {
        "columns": [
            ("POLICYHOLDER_ID", "INT PRIMARY KEY"),
            ("FIRST_NAME", "VARCHAR(60)"),
            ("LAST_NAME", "VARCHAR(60)"),
            ("DOB", "DATE"),
            ("EMAIL", "VARCHAR(120)"),
            ("PHONE", "VARCHAR(20)"),
            ("ADDR_LINE1", "VARCHAR(120)"),
            ("CITY", "VARCHAR(60)"),
            ("STATE", "CHAR(2)"),
            ("POSTAL_CODE", "VARCHAR(10)"),
            ("STATUS", "VARCHAR(20)"),
            ("CREATED_AT", "DATETIME"),
            ("UPDATED_AT", "DATETIME"),
        ],
        "indexes": ["LAST_NAME", "STATE"],
    },
    "AGENTS": {
        "columns": [
            ("AGENT_ID", "INT PRIMARY KEY"),
            ("AGENT_NAME", "VARCHAR(120)"),
            ("AGENCY", "VARCHAR(120)"),
            ("REGION", "VARCHAR(40)"),
            ("LICENSE_STATE", "CHAR(2)"),
            ("HIRE_DATE", "DATE"),
            ("STATUS", "VARCHAR(20)"),
        ],
        "indexes": ["REGION", "LICENSE_STATE"],
    },
    "PRODUCTS": {
        "columns": [
            ("PRODUCT_ID", "INT PRIMARY KEY"),
            ("LINE_OF_BUSINESS", "VARCHAR(40)"),
            ("PRODUCT_NAME", "VARCHAR(120)"),
            ("PRODUCT_CODE", "VARCHAR(20)"),
            ("STATE_AVAILABILITY", "VARCHAR(200)"),
            ("BASE_PREMIUM", "DECIMAL(12,2)"),
        ],
        "indexes": ["LINE_OF_BUSINESS"],
    },
    "POLICIES": {
        "columns": [
            ("POLICY_ID", "INT PRIMARY KEY"),
            ("POLICY_NUMBER", "VARCHAR(24)"),
            ("POLICYHOLDER_ID", "INT"),
            ("AGENT_ID", "INT"),
            ("PRODUCT_ID", "INT"),
            ("EFFECTIVE_DATE", "DATE"),
            ("EXPIRY_DATE", "DATE"),
            ("TERM_MONTHS", "INT"),
            ("ANNUAL_PREMIUM", "DECIMAL(12,2)"),
            ("SUM_INSURED", "DECIMAL(18,2)"),
            ("STATUS", "VARCHAR(20)"),
            ("ISSUED_AT", "DATETIME"),
            ("UPDATED_AT", "DATETIME"),
        ],
        "indexes": ["POLICYHOLDER_ID", "AGENT_ID", "PRODUCT_ID", "STATUS"],
    },
    "COVERAGES": {
        "columns": [
            ("COVERAGE_ID", "BIGINT PRIMARY KEY"),
            ("POLICY_ID", "INT"),
            ("PERIL", "VARCHAR(40)"),
            ("LIMIT_AMOUNT", "DECIMAL(18,2)"),
            ("DEDUCTIBLE", "DECIMAL(12,2)"),
            ("PREMIUM_PORTION", "DECIMAL(12,2)"),
        ],
        "indexes": ["POLICY_ID"],
    },
    "ENDORSEMENTS": {
        "columns": [
            ("ENDORSEMENT_ID", "BIGINT PRIMARY KEY"),
            ("POLICY_ID", "INT"),
            ("EFFECTIVE_DATE", "DATE"),
            ("CHANGE_TYPE", "VARCHAR(40)"),
            ("DELTA_PREMIUM", "DECIMAL(12,2)"),
            ("REASON", "VARCHAR(200)"),
            ("CREATED_AT", "DATETIME"),
        ],
        "indexes": ["POLICY_ID", "EFFECTIVE_DATE"],
    },
    "PREMIUM_LEDGER": {
        "columns": [
            ("ENTRY_ID", "BIGINT PRIMARY KEY"),
            ("POLICY_ID", "INT"),
            ("POSTED_AT", "DATETIME"),
            ("AMOUNT", "DECIMAL(18,2)"),
            ("KIND", "VARCHAR(20)"),
            ("METHOD", "VARCHAR(20)"),
            ("REFERENCE", "VARCHAR(60)"),
        ],
        "indexes": ["POLICY_ID", "POSTED_AT", "KIND"],
    },
    "BILLING_INVOICES": {
        "columns": [
            ("INVOICE_ID", "BIGINT PRIMARY KEY"),
            ("POLICY_ID", "INT"),
            ("INVOICE_NUMBER", "VARCHAR(24)"),
            ("BILLED_AMOUNT", "DECIMAL(12,2)"),
            ("DUE_DATE", "DATE"),
            ("PAID_DATE", "DATE"),
            ("STATUS", "VARCHAR(20)"),
            ("CREATED_AT", "DATETIME"),
        ],
        "indexes": ["POLICY_ID", "STATUS", "DUE_DATE"],
    },
}

LOAD_ORDER = [
    "POLICYHOLDERS", "AGENTS", "PRODUCTS", "POLICIES",
    "COVERAGES", "ENDORSEMENTS", "PREMIUM_LEDGER", "BILLING_INVOICES",
]

# ─── Synthetic generators ─────────────────────────────────────────────────────

random.seed(42)

FIRST_NAMES = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael",
               "Linda", "William", "Elizabeth", "David", "Barbara", "Richard",
               "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen",
               "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Margaret",
               "Anthony", "Betty", "Mark", "Sandra", "Donald", "Ashley", "Steven",
               "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
               "Aisha", "Diego", "Priya", "Mateo", "Yuki", "Omar", "Zara", "Leon"]

LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
              "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez",
              "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore",
              "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
              "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
              "Walker", "Young", "Allen", "King", "Wright", "Scott",
              "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams",
              "Nakamura", "Kowalski", "Okafor", "Patel", "Singh", "Cohen"]

STREET_NAMES = ["Maple", "Oak", "Pine", "Cedar", "Elm", "Washington", "Lake",
                "Hill", "Park", "Spring", "River", "Main", "Sunset", "Highland",
                "Madison", "Jefferson", "Lincoln", "Church", "Court", "Mill"]

STREET_SUFFIXES = ["St", "Ave", "Rd", "Dr", "Ln", "Ct", "Blvd", "Way", "Pl"]

CITIES_BY_STATE = {
    "CA": ["Los Angeles", "San Diego", "San Jose", "Sacramento", "Fresno", "Oakland"],
    "TX": ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso"],
    "NY": ["New York", "Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany"],
    "FL": ["Miami", "Orlando", "Tampa", "Jacksonville", "St. Petersburg", "Tallahassee"],
    "IL": ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford", "Springfield"],
    "PA": ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton"],
    "OH": ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton"],
    "GA": ["Atlanta", "Augusta", "Columbus", "Savannah", "Athens", "Macon"],
    "NC": ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem", "Cary"],
    "MI": ["Detroit", "Grand Rapids", "Warren", "Sterling Heights", "Ann Arbor", "Lansing"],
    "WA": ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue", "Kent"],
    "AZ": ["Phoenix", "Tucson", "Mesa", "Chandler", "Scottsdale", "Glendale"],
    "MA": ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell", "Brockton"],
    "CO": ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Lakewood", "Boulder"],
    "NJ": ["Newark", "Jersey City", "Paterson", "Elizabeth", "Edison", "Trenton"],
}

STATES = list(CITIES_BY_STATE.keys())

REGIONS = {
    "Northeast": ["NY", "PA", "MA", "NJ"],
    "Southeast": ["FL", "GA", "NC"],
    "Midwest": ["IL", "OH", "MI"],
    "South": ["TX"],
    "West": ["CA", "WA", "AZ", "CO"],
}

STATE_TO_REGION = {st: reg for reg, sts in REGIONS.items() for st in sts}

AGENCY_NAMES = ["Verity Direct", "Cornerstone Insurance Group", "Pacific Crest Agency",
                "Liberty Shield Partners", "Heritage Risk Advisors", "Summit Coverage",
                "Beacon Underwriters", "Cardinal Insurance Network", "Evergreen Risk",
                "Compass Mutual Brokers", "Northstar Agency", "Trident Insurance"]

LINES_OF_BUSINESS = ["AUTO", "HOME", "RENTERS", "UMBRELLA", "LIFE_TERM",
                     "COMMERCIAL_AUTO", "COMMERCIAL_PROPERTY", "CYBER"]

PRODUCT_CATALOG = [
    ("AUTO", "Standard Auto", "AUTO-STD", 1200),
    ("AUTO", "Premium Auto Plus", "AUTO-PRM", 1850),
    ("AUTO", "High-Mileage Auto", "AUTO-HM", 1450),
    ("HOME", "Homeowners HO-3", "HOME-HO3", 1600),
    ("HOME", "Homeowners HO-5 Premier", "HOME-HO5", 2400),
    ("HOME", "Dwelling Fire DP-3", "HOME-DP3", 950),
    ("RENTERS", "Renters Essential", "RENT-ESS", 220),
    ("RENTERS", "Renters Plus", "RENT-PLS", 380),
    ("UMBRELLA", "Personal Umbrella 1M", "UMB-1M", 350),
    ("UMBRELLA", "Personal Umbrella 2M", "UMB-2M", 580),
    ("UMBRELLA", "Personal Umbrella 5M", "UMB-5M", 1100),
    ("LIFE_TERM", "Term Life 10yr", "LIFE-T10", 240),
    ("LIFE_TERM", "Term Life 20yr", "LIFE-T20", 420),
    ("LIFE_TERM", "Term Life 30yr", "LIFE-T30", 680),
    ("COMMERCIAL_AUTO", "Commercial Fleet Auto", "CAUTO-FLT", 4200),
    ("COMMERCIAL_AUTO", "Light Commercial Auto", "CAUTO-LT", 2400),
    ("COMMERCIAL_PROPERTY", "Small Business Property", "CPROP-SMB", 3200),
    ("COMMERCIAL_PROPERTY", "Mid-Market Property", "CPROP-MID", 8500),
    ("COMMERCIAL_PROPERTY", "BOP Bundle", "CPROP-BOP", 4800),
    ("CYBER", "Cyber Essentials SMB", "CYB-ESS", 1800),
    ("CYBER", "Cyber Pro 1M", "CYB-PRO1", 4500),
    ("CYBER", "Cyber Enterprise 5M", "CYB-ENT5", 12000),
    ("CYBER", "Cyber Ransomware Add-On", "CYB-RAN", 2200),
    ("AUTO", "Classic Auto", "AUTO-CLS", 980),
]

PERILS_BY_LOB = {
    "AUTO": ["BODILY_INJURY", "PROPERTY_DAMAGE", "COLLISION", "COMPREHENSIVE", "UNINSURED_MOTORIST"],
    "HOME": ["DWELLING", "PERSONAL_PROPERTY", "LIABILITY", "MEDICAL_PAYMENTS", "LOSS_OF_USE"],
    "RENTERS": ["PERSONAL_PROPERTY", "LIABILITY", "LOSS_OF_USE"],
    "UMBRELLA": ["EXCESS_LIABILITY"],
    "LIFE_TERM": ["DEATH_BENEFIT"],
    "COMMERCIAL_AUTO": ["BODILY_INJURY", "PROPERTY_DAMAGE", "COLLISION", "COMPREHENSIVE", "HIRED_AUTO"],
    "COMMERCIAL_PROPERTY": ["BUILDING", "BUSINESS_PERSONAL_PROPERTY", "BUSINESS_INTERRUPTION", "EQUIPMENT_BREAKDOWN"],
    "CYBER": ["DATA_BREACH", "RANSOMWARE", "BUSINESS_INTERRUPTION", "REGULATORY_DEFENSE"],
}

CHANGE_TYPES = ["ADD_DRIVER", "REMOVE_DRIVER", "ADD_VEHICLE", "RAISE_LIMIT",
                "LOWER_DEDUCTIBLE", "NAME_CHANGE", "ADDRESS_CHANGE"]

CHANGE_REASONS = {
    "ADD_DRIVER": "New driver added to household policy",
    "REMOVE_DRIVER": "Driver removed per insured request",
    "ADD_VEHICLE": "New vehicle acquired by insured",
    "RAISE_LIMIT": "Insured elected to increase coverage limit",
    "LOWER_DEDUCTIBLE": "Deductible reduced at renewal",
    "NAME_CHANGE": "Legal name change on file",
    "ADDRESS_CHANGE": "Insured relocated within state",
}

LEDGER_KINDS = ["BILLED", "PAID", "REFUND", "NSF", "WRITE_OFF"]
PAYMENT_METHODS = ["ACH", "CARD", "CHECK", "AUTOPAY", "WIRE"]

NOW = datetime(2026, 5, 24, 7, 30, 0)
TODAY = date(2026, 5, 24)


def gen_policyholders(n=1500):
    rows = []
    statuses_w = ["ACTIVE"] * 92 + ["INACTIVE"] * 6 + ["DECEASED"] * 2
    for i in range(1, n + 1):
        st = random.choice(STATES)
        city = random.choice(CITIES_BY_STATE[st])
        fn = random.choice(FIRST_NAMES)
        ln = random.choice(LAST_NAMES)
        created = datetime(2018, 1, 1) + timedelta(days=random.randint(0, 2900))
        rows.append({
            "POLICYHOLDER_ID": i,
            "FIRST_NAME": fn,
            "LAST_NAME": ln,
            "DOB": date(1940, 1, 1) + timedelta(days=random.randint(0, 365 * 65)),
            "EMAIL": f"{fn.lower()}.{ln.lower()}{random.randint(1, 9999)}@example.com",
            "PHONE": f"({random.randint(200, 999)}) {random.randint(200, 999)}-{random.randint(1000, 9999)}",
            "ADDR_LINE1": f"{random.randint(10, 9999)} {random.choice(STREET_NAMES)} {random.choice(STREET_SUFFIXES)}",
            "CITY": city,
            "STATE": st,
            "POSTAL_CODE": f"{random.randint(10000, 99999)}",
            "STATUS": random.choice(statuses_w),
            "CREATED_AT": created,
            "UPDATED_AT": created + timedelta(days=random.randint(0, 600)),
        })
    return rows


def gen_agents(n=200):
    statuses_w = ["ACTIVE"] * 90 + ["INACTIVE"] * 8 + ["ON_LEAVE"] * 2
    rows = []
    for i in range(1, n + 1):
        st = random.choice(STATES)
        fn = random.choice(FIRST_NAMES)
        ln = random.choice(LAST_NAMES)
        rows.append({
            "AGENT_ID": i,
            "AGENT_NAME": f"{fn} {ln}",
            "AGENCY": random.choice(AGENCY_NAMES),
            "REGION": STATE_TO_REGION.get(st, "West"),
            "LICENSE_STATE": st,
            "HIRE_DATE": date(2010, 1, 1) + timedelta(days=random.randint(0, 5600)),
            "STATUS": random.choice(statuses_w),
        })
    return rows


def gen_products():
    rows = []
    for i, (lob, name, code, base) in enumerate(PRODUCT_CATALOG, start=1):
        # Pick 5–15 states the product is filed in
        states_av = ",".join(sorted(random.sample(STATES, k=random.randint(5, len(STATES)))))
        rows.append({
            "PRODUCT_ID": i,
            "LINE_OF_BUSINESS": lob,
            "PRODUCT_NAME": name,
            "PRODUCT_CODE": code,
            "STATE_AVAILABILITY": states_av,
            "BASE_PREMIUM": round(base * random.uniform(0.9, 1.1), 2),
        })
    return rows


def gen_policies(policyholders, agents, products, n=3000):
    status_w = ["ACTIVE"] * 62 + ["RENEWED"] * 22 + ["LAPSED"] * 10 + ["CANCELLED"] * 6
    term_choices = [6, 12, 12, 12, 24]
    rows = []
    for i in range(1, n + 1):
        ph = random.choice(policyholders)
        ag = random.choice(agents)
        pr = random.choice(products)
        term = random.choice(term_choices)
        eff = date(2022, 1, 1) + timedelta(days=random.randint(0, 1100))
        exp = eff + timedelta(days=term * 30)
        # Premium scaled by product base, plus jitter
        ann_prem = round(float(pr["BASE_PREMIUM"]) * random.uniform(0.85, 1.35), 2)
        # Sum insured tied loosely to LOB
        lob = pr["LINE_OF_BUSINESS"]
        if lob in ("AUTO", "COMMERCIAL_AUTO"):
            si = round(random.choice([50_000, 100_000, 250_000, 500_000]) * random.uniform(0.9, 1.1), 2)
        elif lob in ("HOME", "COMMERCIAL_PROPERTY"):
            si = round(random.uniform(200_000, 2_500_000), 2)
        elif lob == "RENTERS":
            si = round(random.uniform(15_000, 80_000), 2)
        elif lob == "UMBRELLA":
            si = round(random.choice([1_000_000, 2_000_000, 5_000_000]), 2)
        elif lob == "LIFE_TERM":
            si = round(random.choice([100_000, 250_000, 500_000, 1_000_000]), 2)
        else:  # CYBER
            si = round(random.choice([500_000, 1_000_000, 5_000_000]), 2)
        issued = datetime.combine(eff, datetime.min.time()) - timedelta(days=random.randint(1, 30))
        rows.append({
            "POLICY_ID": i,
            "POLICY_NUMBER": f"VTY-{pr['PRODUCT_CODE']}-{1000000 + i}",
            "POLICYHOLDER_ID": ph["POLICYHOLDER_ID"],
            "AGENT_ID": ag["AGENT_ID"],
            "PRODUCT_ID": pr["PRODUCT_ID"],
            "EFFECTIVE_DATE": eff,
            "EXPIRY_DATE": exp,
            "TERM_MONTHS": term,
            "ANNUAL_PREMIUM": ann_prem,
            "SUM_INSURED": si,
            "STATUS": random.choice(status_w),
            "ISSUED_AT": issued,
            "UPDATED_AT": issued + timedelta(days=random.randint(1, 400)),
        })
    return rows


def gen_coverages(policies, products):
    product_by_id = {p["PRODUCT_ID"]: p for p in products}
    deductible_choices = [250, 500, 1000, 2500]
    rows = []
    cid = 200_000_000
    for pol in policies:
        prod = product_by_id[pol["PRODUCT_ID"]]
        lob = prod["LINE_OF_BUSINESS"]
        perils_pool = PERILS_BY_LOB[lob]
        k = min(len(perils_pool), random.randint(1, 4))
        chosen = random.sample(perils_pool, k=k)
        ann = float(pol["ANNUAL_PREMIUM"])
        # split annual premium across coverages
        weights = [random.uniform(0.5, 1.5) for _ in chosen]
        wsum = sum(weights)
        for peril, w in zip(chosen, weights):
            cid += 1
            limit = round(random.choice([25_000, 50_000, 100_000, 250_000, 500_000,
                                         1_000_000, 2_500_000, 5_000_000]) * random.uniform(0.95, 1.05), 2)
            ded = random.choice(deductible_choices) if lob not in ("UMBRELLA", "LIFE_TERM") else 0
            portion = round(ann * (w / wsum), 2)
            rows.append({
                "COVERAGE_ID": cid,
                "POLICY_ID": pol["POLICY_ID"],
                "PERIL": peril,
                "LIMIT_AMOUNT": limit,
                "DEDUCTIBLE": ded,
                "PREMIUM_PORTION": portion,
            })
    return rows


def gen_endorsements(policies, n=1500):
    rows = []
    eid = 300_000_000
    for _ in range(n):
        pol = random.choice(policies)
        eid += 1
        ct = random.choice(CHANGE_TYPES)
        # endorsement falls between effective + 30d and min(today, expiry)
        eff = pol["EFFECTIVE_DATE"] + timedelta(days=random.randint(30, 300))
        if eff > TODAY:
            eff = TODAY - timedelta(days=random.randint(1, 60))
        delta = round(random.gauss(0, 120), 2)
        if ct in ("RAISE_LIMIT", "ADD_DRIVER", "ADD_VEHICLE"):
            delta = abs(delta) + round(random.uniform(50, 400), 2)
        elif ct in ("REMOVE_DRIVER", "LOWER_DEDUCTIBLE"):
            delta = -abs(delta) - round(random.uniform(25, 200), 2)
        else:
            delta = round(delta, 2)
        rows.append({
            "ENDORSEMENT_ID": eid,
            "POLICY_ID": pol["POLICY_ID"],
            "EFFECTIVE_DATE": eff,
            "CHANGE_TYPE": ct,
            "DELTA_PREMIUM": delta,
            "REASON": CHANGE_REASONS[ct],
            "CREATED_AT": datetime.combine(eff, datetime.min.time()) + timedelta(hours=random.randint(1, 18)),
        })
    return rows


def gen_premium_ledger(policies, n=10000):
    kind_w = (["BILLED"] * 36 + ["PAID"] * 50 + ["REFUND"] * 4 +
              ["NSF"] * 5 + ["WRITE_OFF"] * 5)
    rows = []
    entry_id = 400_000_000
    for _ in range(n):
        pol = random.choice(policies)
        entry_id += 1
        kind = random.choice(kind_w)
        base = float(pol["ANNUAL_PREMIUM"]) / 12.0
        amt = round(base * random.uniform(0.4, 1.2), 2)
        if kind in ("REFUND", "WRITE_OFF"):
            amt = -abs(amt)
        elif kind == "NSF":
            amt = 0.00
        posted = datetime.combine(pol["EFFECTIVE_DATE"], datetime.min.time()) + timedelta(
            days=random.randint(1, 400), hours=random.randint(6, 20))
        if posted > NOW:
            posted = NOW - timedelta(days=random.randint(1, 30))
        rows.append({
            "ENTRY_ID": entry_id,
            "POLICY_ID": pol["POLICY_ID"],
            "POSTED_AT": posted,
            "AMOUNT": amt,
            "KIND": kind,
            "METHOD": random.choice(PAYMENT_METHODS) if kind in ("PAID", "BILLED", "REFUND") else "N/A",
            "REFERENCE": f"REF-{random.randint(100000, 9999999)}",
        })
    return rows


def gen_billing_invoices(policies, n=6000):
    status_w = ["PAID"] * 72 + ["OPEN"] * 18 + ["PAST_DUE"] * 8 + ["VOID"] * 2
    rows = []
    inv_id = 500_000_000
    for _ in range(n):
        pol = random.choice(policies)
        inv_id += 1
        billed = round(float(pol["ANNUAL_PREMIUM"]) / random.choice([1, 2, 4, 12]), 2)
        due = pol["EFFECTIVE_DATE"] + timedelta(days=random.randint(15, 360))
        status = random.choice(status_w)
        paid_date = None
        if status == "PAID":
            paid_date = due - timedelta(days=random.randint(0, 14))
        elif status == "PAST_DUE" and random.random() < 0.3:
            paid_date = due + timedelta(days=random.randint(5, 45))
        created = datetime.combine(due, datetime.min.time()) - timedelta(days=random.randint(20, 40))
        rows.append({
            "INVOICE_ID": inv_id,
            "POLICY_ID": pol["POLICY_ID"],
            "INVOICE_NUMBER": f"INV-{1_000_000 + (inv_id % 9_000_000)}",
            "BILLED_AMOUNT": billed,
            "DUE_DATE": due,
            "PAID_DATE": paid_date,
            "STATUS": status,
            "CREATED_AT": created,
        })
    return rows


# ─── DB helpers (mirror Altavest load_trade_ledger.py) ─────────────────────────

def autocommit_conn(database):
    return pymssql.connect(
        server=HOST, port=PORT, user=USER, password=PWD,
        database=database, autocommit=True, timeout=30, login_timeout=15,
    )


def conn(database):
    return pymssql.connect(
        server=HOST, port=PORT, user=USER, password=PWD,
        database=database, timeout=60, login_timeout=15,
    )


def ensure_database():
    with autocommit_conn("master") as c:
        cur = c.cursor()
        cur.execute(
            f"IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '{DB}') "
            f"CREATE DATABASE [{DB}]"
        )
        cur.close()
    log.info(f"Database {DB} ready")


def ensure_schema(c):
    cur = c.cursor()
    cur.execute(
        f"IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '{SCHEMA}') "
        f"EXEC('CREATE SCHEMA {SCHEMA}')"
    )
    c.commit()
    cur.close()
    log.info(f"Schema {SCHEMA} ready")


def drop_table(c, tbl):
    cur = c.cursor()
    cur.execute(f"IF OBJECT_ID('{SCHEMA}.{tbl}', 'U') IS NOT NULL DROP TABLE {SCHEMA}.{tbl}")
    c.commit()
    cur.close()


def create_table(c, tbl, defn):
    cols = ", ".join(f"{col} {ty}" for col, ty in defn["columns"])
    sql = f"CREATE TABLE {SCHEMA}.{tbl} ({cols})"
    cur = c.cursor()
    cur.execute(sql)
    c.commit()
    cur.close()
    log.info(f"  created {SCHEMA}.{tbl}")


def create_indexes(c, tbl, defn):
    if "indexes" not in defn:
        return
    cur = c.cursor()
    for col in defn["indexes"]:
        idx = f"IX_{tbl}_{col}"
        cur.execute(
            f"IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '{idx}') "
            f"CREATE INDEX {idx} ON {SCHEMA}.{tbl} ({col})"
        )
        c.commit()
    cur.close()


def bulk_insert(c, tbl, defn, rows):
    # pymssql's executemany ships one RPC per row over the wire, which is
    # brutal against a remote MSSQL box. Multi-row VALUES collapses N round
    # trips into ceil(N/CHUNK), ~50x faster against the EC2 box.
    if not rows:
        log.warning(f"  no rows for {tbl}")
        return 0
    cols = [name for name, _ in defn["columns"]]
    col_list = ", ".join(cols)
    placeholders_one = "(" + ", ".join(["%s"] * len(cols)) + ")"
    cur = c.cursor()
    CHUNK = 200  # 200 * cols * ~8 bytes stays well under MSSQL's 2100 param cap for typical widths
    # Safety: SQL Server caps to 2100 parameters per call; if cols are wide, shrink chunk.
    if CHUNK * len(cols) > 2000:
        CHUNK = max(1, 2000 // len(cols))
    total = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        values_sql = ", ".join([placeholders_one] * len(chunk))
        sql = f"INSERT INTO {SCHEMA}.{tbl} ({col_list}) VALUES {values_sql}"
        params = tuple(v for r in chunk for v in (r.get(col) for col in cols))
        cur.execute(sql, params)
        c.commit()
        total += len(chunk)
    cur.close()
    log.info(f"  inserted {total:,} rows into {SCHEMA}.{tbl}")
    return total


def main():
    log.info("=" * 60)
    log.info("VERITY POLICY ADMIN → SQL SERVER")
    log.info(f"  host:     {HOST}:{PORT}")
    log.info(f"  database: {DB}")
    log.info(f"  schema:   {SCHEMA}")
    log.info("=" * 60)

    log.info("generating synthetic policy admin data...")
    policyholders = gen_policyholders()
    agents = gen_agents()
    products = gen_products()
    policies = gen_policies(policyholders, agents, products)
    coverages = gen_coverages(policies, products)
    endorsements = gen_endorsements(policies)
    ledger = gen_premium_ledger(policies)
    invoices = gen_billing_invoices(policies)

    data = {
        "POLICYHOLDERS": policyholders,
        "AGENTS": agents,
        "PRODUCTS": products,
        "POLICIES": policies,
        "COVERAGES": coverages,
        "ENDORSEMENTS": endorsements,
        "PREMIUM_LEDGER": ledger,
        "BILLING_INVOICES": invoices,
    }
    for tbl in LOAD_ORDER:
        log.info(f"  {tbl}: {len(data[tbl]):,} rows generated")

    ensure_database()
    c = conn(DB)
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
        log.info("=" * 60)
    finally:
        c.close()


if __name__ == "__main__":
    main()
