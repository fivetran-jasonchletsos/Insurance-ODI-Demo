# Marsh — 10-Minute ODI Demo (SE script)
Atlas Risk · David Hirschfeld, Chief Data Transformation Officer · manager on the line

---

## What David already told us (from prior Collin Diehl conversation)

This is not a connector pitch. David's own words:

- "Moving data is easy. Mapping is the hard part."
- Connectors are commodity. They help "a little."
- The pain is semantic mapping, contextual interpretation, normalization across fragmented systems, governance.
- "Closed date" has 7–8 definitions across regions/BUs/workflows (Marsh-closed vs broker-closed vs client-closed; payment sent vs cashed; LATAM vs US).
- Configurable systems "become chaos." New claims platform already has 8 customized instances.
- Onboarding a source today = 6–12 weeks. Most of it = mapping + SME interpretation.
- He wants to talk: dbt workflows, transformation orchestration, metadata/context, governance, semantic consistency, reusable models, AI-ready governed data.
- Marsh procurement is "the eight gates of hell." Fivetran is already through it — that's real leverage.

The demo center of gravity is Beat 4 (Architecture: Data Quality + Lineage). Pipeline (Beat 5) is a brief stop, not a dwell.

---

## The one sentence I'm selling

> Fivetran + dbt Labs are the canonical layer underneath your data masters program. Connectors do the table-stakes part. dbt Labs is where "closed date" stops having seven meanings, where mapping logic is versioned and reusable, where lineage proves every column back to source — so AI scales on trusted data and onboarding goes from 6–12 weeks to days.

---

## Live URL (deployed)

Atlas Risk → https://fivetran-jasonchletsos.github.io/Insurance-ODI-Demo/

## Pre-flight (T-5 min)

- Site loaded · zoom 110% · notifications off
- Test `/agent` (Copilot) with API key BEFORE the call. If broken, skip Beat 3 and absorb into Beat 4.
- Never click Pipeline "Simulate failure."

---

## ⏱ Beat 1 · Home — set the table (0:00–0:45) — `/`

Land on the homepage. Show hero + Lake Snapshot panel.

> "Atlas Risk — a working insurance application built on Fivetran's Open Data Infrastructure. The Lake Snapshot on the right — carriers, policies, claims — every number reads from open Iceberg tables on S3, transformed and tested by dbt Labs. The reason I'm starting here: this entire surface is rendering off a governed gold layer. Same pattern as your data masters program."

Click into Catastrophe.

---

## ⏱ Beat 2 · Catastrophe — business outcome (0:45–1:45) — `/catastrophe`

Click a heatmap circle → right panel populates.

> "TIV concentration, modeled PML, loss ratio vs. plan. Three feeds joined: policy, claims, catastrophe. Every number on this page passed dbt Labs tests before it rendered. We're about to walk through where those tests live — because that's where your mapping problem gets solved."

---

## ⏱ Beat 3 · Copilot — AI on a governed lake (1:45–3:00) — `/agent` (only if tested)

Type: "Which carriers in our book have elevated catastrophe exposure and a declining loss ratio?"

> "Claude reading the lake directly. Not a copy. Not a vector summary. The actual gold-layer tables — same ones LenAI reads via Databricks today. Row-level security from Lake Formation applies automatically."

CDO-specific line:
> "The reason this is safe to put in front of an underwriter — and the reason you'd let LenAI scale onto these tables — is the governance layer I'm showing you next. AI on a black box is the problem. AI on a governed, tested, lineage-tracked lake is the answer."

If Copilot is unavailable:
> "Same AI pattern as LenAI — I'll show you the governance contract underneath it now."

---

## ⏱ Beat 4 · ODI Architecture — Fivetran + dbt Labs · the hard part (3:00–7:30) — `/architecture`

THIS IS THE DWELL. Three sub-beats in order.

### 4a · The open lake (3:00–3:30) — keep this fast

Scroll to the SVG. Hover bronze → silver → gold.

> "Open tables on S3 — Iceberg shown, Delta works identically. Fivetran lands raw. dbt Labs — now part of Fivetran after the merger — shapes silver and gold. Same tables Databricks reads natively, same tables LenAI consumes. Your Databricks stays the analytics engine. dbt Labs is the canon."

Move quickly. The architecture diagram is context, not the headline.

### 4b · Data Quality — where mapping lives (3:30–5:00) — DWELL

Scroll to the Data Quality section. Point at the three layer cards.

> "David — you told Collin that moving data is easy and mapping is the hard part. **This is where mapping lives.** Bronze tests freshness, volume, schema drift — did the data even land. Silver tests nulls, uniqueness, referential integrity, accepted values — is it clean. Gold tests business rules and reconciliation — does it match the definition your CFO closes books against."

The "closed date" callback — say this slowly:
> "When you mentioned 'closed date' having seven or eight definitions — Marsh-closed, broker-closed, client-closed, payment sent versus cashed, LATAM versus US — **this is where that gets canonicalized.** One semantic definition in dbt Labs, versioned, tested. The test isn't 'does the column have a value' — it's 'does this match our business definition of closed.' If LATAM's regional implementation drifts, the test fails. The gold layer stays clean."

The configurable-systems callback:
> "You also said configurable systems become chaos. That's true everywhere — until you have a canon. **dbt Labs is the canon.** Configuration that violates the canon doesn't promote to gold. Eight customized instances of a new claims platform can coexist underneath, as long as they reconcile to one definition above."

The CDO governance line:
> "97 tests, 96 passing, last run twelve minutes ago. Failures block promotion. Bad data physically cannot reach LenAI or the underwriting desk. **This is the governance contract a Chief Data Transformation Officer can sign their name to.**"

### 4c · Lineage — semantic mapping made auditable (5:00–6:30) — DWELL

Scroll to the Lineage section. Point at the column-level flow. PII markers on edges.

> "Column-level lineage from your Oracle and SQL Server through every transformation into every consumer — Athena, Databricks, the Copilot, NAIC report. Orange edges are dbt Labs transformations. Amber edges carry PII. Auto-emitted by dbt Labs on every build."

The reframe that lands the whole call:
> "When a regulator or your model-risk committee asks 'where did this number come from and who touched it' — the answer is on this page. **But more importantly for your team**: when an analyst in LATAM asks 'why does my closed-date count differ from the US team's' — the answer is also on this page. Column-level lineage is semantic mapping made auditable. It's the artifact your data masters program is trying to produce. dbt Labs auto-emits it."

The onboarding-time payoff:
> "You said today a new source takes six to twelve weeks, most of that on mapping and SME interpretation. Once your canonical models live here, **new sources land in days because you're not re-deriving mappings — you're reusing them.** That's the compounding return on the dbt Labs investment."

### 4d · Compute is a choice (6:30–7:30) — keep this fast

Click engine tabs: Athena → Spark → Snowflake.

> "Same governed tables. Multiple engines. Databricks is yours. The data isn't locked inside any one of them. When Marsh acquires the next firm — and you've just integrated McGriff — their data lands in this same lake under these same tests. **You don't re-do the mapping work for every acquisition. You extend the canon.**"

---

## ⏱ Beat 5 · Pipeline — table stakes, brief stop (7:30–8:15) — `/pipeline`

Open Pipeline page. Glance only — do NOT dwell.

> "Quick stop here. Oracle, SQL Server, NAIC, NOAA — landing into the lake with CDC. Live lag, observable failures, lineage to source. **I know connectors aren't where your pain is — you said that to Collin and you're right.** The reason this matters isn't the connector itself. It's what it frees up. Every minute your team isn't maintaining JDBC plumbing or a custom Python framework is a minute they spend on the mappings, which is where the real Marsh work happens."

Move on. Do not narrate throughput. Do not narrate lag.

---

## ⏱ Close (8:15–10:00)

Stop sharing. Eye contact. Hand back to AE / boss.

Procurement housekeeping (subtle, brief):
> "One housekeeping note before I close — we're already through Marsh procurement and security review. So whatever next step you and the team land on, you're not restarting that clock. Eight gates already passed."

Closing line (rehearse verbatim):
> "Every other platform sells you connectors and calls it modernization. **You already know that's not the problem.** What we're offering is the canonical layer underneath your data masters program — Fivetran lands the data so your team doesn't, dbt Labs governs the meaning so 'closed date' stops being seven things, lineage proves every column so the regulator and LenAI both get a straight answer. That's how the six-to-twelve-week onboarding number actually moves."

> "David — that's the ten. What landed, what didn't, where do you want to dig in?"

---

## Hard guardrails

- Never open the Fivetran sync UI.
- Never lead with connector throughput, lag, or counts. He told us connectors are commodity.
- Never click Pipeline "Simulate failure."
- Always say "dbt Labs" — never just "dbt." The merger is the point.
- His title is **Chief Data Transformation Officer**, not CDO.
- Don't name McGriff, Raja Thomas, Matt Williams, EuroSys, EasyInsure, Fusion, or DB2 unprompted. If he raises any, lean in.
- Pair AI with governance every time. Never one without the other.

---

## If he steers the conversation

| He raises | Where you go |
|---|---|
| Semantic mapping / glossaries / closed date again | Beat 4b + 4c — dwell, use his example back to him |
| EuroSys / mainframe / DB2 / EasyInsure | Brief Pipeline stop, then snap back to Beat 4 |
| Onboarding 6–12 weeks | Beat 4c: "the connector half goes to days. The mapping half compounds — reusable across the 200 transaction systems" |
| Configurable systems / regional drift | Beat 4b: "the tests are the canon. Configuration that violates the canon doesn't promote" |
| AI / Databricks / LenAI | Beat 3 Copilot + Beat 4 governance pairing |
| Data masters / canonical models | Beat 4c Lineage: "the gold layer IS your data masters program" |
| Procurement / vendor onboarding | Closing line — "already through, eight gates passed" |
