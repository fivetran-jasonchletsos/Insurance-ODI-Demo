# Marsh — 10-Min Demo · Cheat Card
David Hirschfeld · Chief Data Transformation Officer · https://fivetran-jasonchletsos.github.io/Insurance-ODI-Demo/

His frame: "Moving data is easy. Mapping is the hard part." Demo answers that. Center of gravity = Beat 4.

---

## ⏱ Beat 1 · Home (0:00–0:45) — `/`

"Every number reads from open Iceberg, transformed and tested by dbt Labs. Same pattern as your data masters program."

## ⏱ Beat 2 · Catastrophe (0:45–1:45) — `/catastrophe`

Click circle → right panel. "Every number passed dbt Labs tests before it rendered. Walk you to where those tests live."

## ⏱ Beat 3 · Copilot (1:45–3:00) — `/agent` (skip if no key)

Ask: *"Carriers with elevated cat exposure and declining loss ratio?"*
"Same gold tables LenAI reads. AI on a governed lake — not a black box. Governance comes next."

## ⏱ Beat 4 · ARCHITECTURE — THE DWELL (3:00–7:30) — `/architecture`

**4a Open lake (3:00–3:30) · FAST.** "Fivetran lands raw. dbt Labs — now part of Fivetran — shapes silver and gold. Databricks stays the engine. dbt Labs is the canon."

**4b Data Quality (3:30–5:00) · DWELL.** Three layer cards.
- "**You said mapping is the hard part. This is where mapping lives.**"
- "**'Closed date' having seven definitions — Marsh-closed, broker-closed, client-closed, LATAM vs US — this is where that gets canonicalized.** One semantic definition. Tested. Versioned."
- "**Configurable systems become chaos — until you have a canon. dbt Labs is the canon.** Config that violates the canon doesn't promote to gold."
- "97 tests, 96 passing, 12m ago. Failures block promotion. **Bad data physically cannot reach LenAI.**"

**4c Lineage (5:00–6:30) · DWELL.** PII edges, dbt Labs edges.
- "Column-level lineage from your Oracle and SQL Server through every transformation to every consumer."
- "**When LATAM asks why their closed-date count differs from US — the answer is on this page. Column-level lineage is semantic mapping made auditable.**"
- "**Six-to-twelve-week onboarding becomes days — because you're not re-deriving mappings, you're reusing them.** That's the dbt Labs compounding return."

**4d Multi-engine (6:30–7:30) · FAST.** Click Athena → Spark → Snowflake.
"Same governed tables. Databricks is yours. **When you acquire the next firm — you've just integrated McGriff — their data extends the canon, not re-does it.**"

## ⏱ Beat 5 · Pipeline (7:30–8:15) — `/pipeline` · BRIEF

Glance only. NO throughput, NO lag narration.
"**I know connectors aren't your pain — you told Collin that, and you're right.** What it frees: every minute your team isn't here is a minute they spend on mappings."

## ⏱ Close (8:15–10:00)

Procurement: "**One housekeeping note — we're already through Marsh procurement and security. Eight gates already passed.**"

Closing (rehearse):
"Every other platform sells you connectors and calls it modernization. **You already know that's not the problem.** Fivetran lands the data so your team doesn't, dbt Labs governs the meaning so 'closed date' stops being seven things, lineage proves every column. That's how 6–12 weeks actually moves."

"David — what landed, what didn't, where do you want to dig in?"

---

## NEVER on this call

- ❌ Open the Fivetran sync UI
- ❌ Lead with throughput, lag, or connector counts
- ❌ Click Pipeline "Simulate failure"
- ❌ Say "dbt" alone — always "dbt Labs"
- ❌ Call him "CDO" — Chief Data **Transformation** Officer
- ❌ Name McGriff, Raja Thomas, Matt Williams, EuroSys, EasyInsure, Fusion, DB2 unprompted

## His words → your callbacks

| He said | Use it back |
|---|---|
| "Moving data is easy. Mapping is the hard part." | Beat 4b opener |
| "Closed date" 7–8 definitions | Beat 4b dwell |
| "Configurable systems become chaos" | Beat 4b second beat |
| 6–12 weeks onboarding | Beat 4c payoff |
| Procurement = "eight gates of hell" | Closing housekeeping |
