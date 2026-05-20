# Marsh Discovery Call — David Hirschfeld, CDO
**30-min discovery · 10-min demo · ODI as the open landing zone that feeds their Databricks**

> Manager is on the call. **Marsh is Databricks-first, AWS-preferred, mid-migration off four data centers, and just integrated McGriff.** This is not a "rip out Snowflake" pitch — it never was. **ODI is the open ingestion layer + open table landing on S3 that retires their custom Python/PySpark framework and de-risks the data-center exit.** Every word below reflects that.

---

## The single sentence the call has to deliver

> "Fivetran lands your on-prem Oracle and SQL Server into open Delta or Iceberg tables on **your** S3 — the same lake Databricks already reads — so the data-center exit and the McGriff integration both finish faster, governed, AI-ready, and **without rewriting your custom ingestion framework.**"

If David and our manager leave repeating any version of that, we won.

---

## What we know, going in (verified public facts — leverage liberally)

- **Databricks is the analytics platform.** "Crown jewel." Don't pitch against it. Pitch *into* it.
- **AWS is preferred cloud** (May 2025 announcement). Aligned with our story.
- **Four data centers closing in phases**, per Paul Beswick, CIO/COO. Largest is last. **This is the urgency.**
- **McGriff closed Nov 2024 — $7.75B, 3,500 people.** Live data integration pain. Don't name-drop unprompted; let him raise it. Have the answer ready.
- **LenAI in production** for ~90K employees, ~2M requests/month, Databricks underneath. He has a real AI program — speak to it as a peer.
- **David has been CDO since 2021**, public scope: "Analytics, Data Governance, Reference Data, Data Masters, building a new data platform."

**What we do NOT know — don't bluff:**
- David's personal views on Iceberg vs. Delta. Don't claim he's said anything publicly. He hasn't.
- Whether Marsh runs Guidewire (Oracle) specifically. MMA job posts reference SQL Server; Guidewire/Oracle is *industry standard* but unconfirmed at Marsh. Say "the on-prem stack you've described" — not "your Guidewire."

---

## ODI scoreboard (Fivetran's official framing — every beat maps to one)

**Three principles:**
1. **Open, standards-based data movement and transformation**
2. **Unified, open data lake foundation** (storage / compute decoupled)
3. **Activation, semantics, and AI consumption** (governance applied consistently across BI, workflows, AI)

**Four benefits:**
- No vendor lock-in · Lower cost at scale · Faster innovation · Built for AI and real-time

---

## Pre-call dress rehearsal (30 min before)

```bash
# Atlas Risk
cd ~/Documents/github/Insurance-ODI-Demo/atlas-app/frontend
npm ci && npm run dev    # localhost:5173

# Mission Control (governance + observability)
cd ~/Documents/github/ODI-Mission-Control/console-app/frontend
npm ci && npm run dev    # localhost:5174
```

**Green-box checklist:**

- [ ] `/architecture` SVG shows Oracle 19c · SQL Server · NAIC · NOAA
- [ ] `/architecture` engine tabs cycle Athena → DuckDB → Trino → Spark → Snowflake → **Databricks (mention verbally — Snowflake tab proves the pattern)**
- [ ] `/pipeline` shows Oracle PAS, SQL Server Claims, NAIC, NOAA with throughput + lag
- [ ] `/catastrophe` map renders, circle click populates right panel — **footer disclaimer now reads "Iceberg gold layer · refreshed continuously"** (fixed)
- [ ] Mission Control `/governance` and `/lineage` load
- [ ] **Browser zoom 110%.** SVGs crisp on second screen
- [ ] Notifications muted. Dock auto-hide. Reminders off
- [ ] Backup tab: deployed GitHub Pages URLs ready
- [ ] Manager pre-briefed on Beat 3 handoff (Oracle CDC references in insurance)
- [ ] **Decide before the call**: are we demoing `/agent`? If no API key is configured, **skip Beat 6** — the disabled button signals incomplete. If configured & tested, keep it. The narrative still closes cleanly without it (see Beat 6 fallback below).

---

## Discovery (minutes 0–8) — laptop closed

**Open (45 sec) — let manager say it:**
> "David — 30 minutes. Eight of discovery, ten of something most prospects never see from us, twelve for whatever you want to dig into."

### The opening hook (proves you did homework, not stalker-ish)

Pick **one** — whichever fits manager's intro line:

> "Before I ask anything: I saw the AWS preferred-cloud announcement last year and Paul Beswick's commentary on phasing the data center exits — where are you on that timeline, and how is data following that path versus apps?"

or

> "I caught the EXL/AWS webinar you did on modern data platforms — the Customer 360 underwriting/claims/marketing shape resonated. Is that still the use-case you're chasing, or has the AI program shifted what's on top?"

### Then the structured discovery — pick by his energy

**The platform question — always lead:**
> "Databricks is well-publicized as the analytics platform. The question I'm always curious about — where does the **ingestion** layer sit today? Is that custom-built, or is there an opinion at Marsh about open table formats — Delta, Iceberg — at the landing zone?"

**The systems question — primes Beat 3:**
> "On-prem footprint as the data centers close — which is the bigger headache for your team: the **policy admin / claims** stack on SQL Server, or the **GL / financial close** stack on Oracle?"
> *(Whichever he names, lead with that system at Beat 3.)*

**The McGriff question — only if he raises it:**
> "When MMA brought McGriff in last year — did their data follow the same path your existing book takes, or did you treat it as a separate integration problem?"

**The governance question — primes Beat 5:**
> "Your public scope includes data governance and data masters. As LenAI scales and the agent surface grows, what's the regulator's posture on AI touching customer data — and who at Marsh owns that policy?"

**Listen for hooks:**

| If he surfaces... | Beat that lands hardest |
|---|---|
| Custom Python/PySpark ingestion pain | **Beat 3** (Fivetran retires the framework) |
| Data-center exit timeline pressure | **Beat 2** (open landing, no warehouse-coupled rewrite) |
| McGriff integration friction | **Beat 3 + 2** (next acquisition lands the next morning) |
| LenAI / AI governance | **Beat 5 + 6** (lake-native AI, governed) |
| Databricks cost pressure | **Beat 4** (multi-engine without leaving Databricks) |

---

## The 10-minute demo (minutes 8–18)

> **Rule 1**: Never open the Fivetran sync UI.
> **Rule 2**: Mirror his words. He said "Delta"? You say "Delta." He said "lakehouse"? You say "lakehouse."
> **Rule 3**: Two seconds of silence after each beat. Don't fill it.
> **Rule 4**: Never click the Pipeline "Simulate failure" buttons — the word "Simulated:" appears in the failure text.

### ⏱ Beat 1 · Business outcome — anchor first (0:00–0:45) — `/catastrophe`

**Why this beat:** CDOs fund outcomes, not infrastructure. Show the outcome, then earn the architectural conversation.

**Action**: Click one heatmap circle. Right panel populates: TIV, 1-in-100 PML, perils, claims, reinsurance attachment.

**Say:**
> "Underwriting cockpit — TIV concentration, modeled PML, loss ratio vs. plan. Three feeds joined: policy, claims, catastrophe modeling. **Now I'll show you what's underneath — because that's where the architectural decision lives for Marsh.**"

**Move. 45 seconds. Don't linger.**

---

### ⏱ Beat 2 · The open lake — what feeds Databricks (0:45–2:15) — `/architecture`

> **[ODI Principle 2: Unified open data lake] · [Benefit: No vendor lock-in]**

**Action**: Scroll to SVG. Hover bronze → silver → gold.

**Say** (slow, deliberate, **Databricks-first framing**):
> "Every table on this lake is an open table — **Iceberg here, but Delta works the same way**, your call. Registered in Glue. Sitting on S3 — your S3, your account. Bronze is raw landings. Silver conforms with dbt. Gold is business-ready. **The same tables Databricks already reads natively as external Delta or Iceberg.**"

**The line that has to land:**
> "Notice what isn't in this diagram. There's no proprietary internal table format. There's no warehouse owning the source-of-truth. **Your Databricks stays the analytics engine. Your S3 stays the lake. Fivetran feeds it.** That's the boundary."

**Scroll to MDS-vs-ODI panel. Silence. Let him read.**

---

### ⏱ Beat 3 · Your on-prem reality, landing in the lake (2:15–3:45) — `/pipeline`

> **[ODI Principle 1: Open standards-based ingestion] · [Benefit: Faster innovation]**

**Action**: Open Pipeline page. Point at each card — Oracle, SQL Server, NAIC, NOAA. Throughput sparklines and lag visible.

**Say** (point as you talk, **mirror the system he flagged in discovery**):
> "Oracle 19c policy admin — **LogMiner CDC**, no triggers, no source-side impact. SQL Server claims — **Change Tracking**, same low-touch. NAIC and NOAA via our Connector SDK. Four sources, one open destination, live throughput and lag visible. **Managed.**"

**The CDO line (Marsh-specific, verified):**
> "You're closing four data centers in phases. As each one comes offline, the data sitting in Oracle and SQL Server has to land somewhere — fast, governed, with lineage. Today, my understanding is that's a custom Python/PySpark framework your team maintains. **Fivetran replaces the framework. Your team builds business logic in Databricks instead of maintaining JDBC plumbing.**"

> 🎤 **Manager handoff**: *"[Manager], anything to add on Oracle CDC reference customers in insurance — carriers doing this into Delta today?"*

---

### ⏱ Beat 4 · Compute is a choice — including Databricks (3:45–5:15) — `/architecture` engine tabs

> **[ODI Principle 2: Storage/compute decoupled] · [Benefit: Lower cost at scale]**

**Action**: Click engine tabs — Athena, DuckDB, Trino, Spark, Snowflake. Then verbally insert Databricks.

**Say:**
> "Same open tables. Multiple engines. **Databricks is the primary one for Marsh** — same SQL pattern as the Spark tab here, reading the same Delta or Iceberg tables Fivetran wrote. Athena for ad-hoc. DuckDB on an engineer's laptop. Trino federating against a system we haven't moved yet. **The point isn't that we replace Databricks. The point is the data isn't locked inside any one engine — including Databricks itself.**"

**The lock-in beat (only if vendor strategy surfaced):**
> "If a future Marsh CDO ever wants to put Trino on top, or Snowflake as a federated read, the lake doesn't care. The data outlives the engine. **That's the architectural insurance policy ODI gives you.**"

---

### ⏱ Beat 5 · Governance, lineage, audit (5:15–6:45) — Mission Control

> **[ODI Principle 3: Governance applied consistently] · [All four benefits]**

**Action**: Switch to Mission Control. Open `/governance`, then `/lineage`.

**Say on `/governance`:**
> "SOC 2, HIPAA, GDPR posture per dataset. RBAC roles. Audit log of every read against the lake. **Not roadmap — observable today.** This is the surface your data masters and reference data teams operate from."

**Then `/lineage`:**
> "Lineage from your Oracle and SQL Server, through bronze, silver, gold, into every consumer — including Databricks, including LenAI's agents. PII flow callouts on every edge. When the NAIC or your model-risk committee asks 'where did this data come from and who touched it,' the answer is on this page."

**The closing line on governance:**
> "Open metadata is *better* for audit, not worse. Your regulators will prefer this architecture once they understand it."

---

### ⏱ Beat 6 · AI on the lake — IF agent works (6:45–8:30) — `/agent`

> **[ODI Principle 3: AI consumption] · [Benefit: Built for AI and real-time]**

**ONLY do this beat if you tested `/agent` with a working API key in the dress rehearsal.** If not, **skip directly to the close** and absorb the 90 seconds into Beat 5 + the closing line.

**Action**: Type *"Which carriers in our book have elevated catastrophe exposure and a declining loss ratio?"*

**Say** (while it runs):
> "Claude reading the lake directly. Not a copy. Not a vector summary. The actual gold-layer tables you just saw. **Row-level security from Lake Formation applies automatically — the agent has no privileges your analysts don't have. That's the same pattern LenAI follows on Databricks.**"

**The closing line (rehearse word-for-word):**
> "Every other platform sells you a warehouse, then sells you AI bolted onto the warehouse. ODI is the opposite. **The lake is the platform. The compute engine — your Databricks — is the choice. AI is just another query engine on the same governed tables.** And that's what we'd land underneath the work you've already done at Marsh."

---

### ⏱ Close (8:30–10:00)

**Stop sharing. Eye contact.**

> "David — that's the ten. What landed, what didn't, what do you want to dig into?"

---

## Post-demo (minutes 18–28) — earn the next meeting

**Questions that mean you're winning:**
- "How does this work with our Lake Formation permissions and Databricks Unity Catalog?"
- "What's the lift to replace our custom JDBC framework on SQL Server?"
- "Could we POC this on the McGriff integration specifically?"
- "Who else in insurance is running Fivetran into Delta on AWS?"

**Pick one next step:**

| Energy in room | Next step |
|---|---|
| Engaged, architecture-curious | **Architecture deep-dive (45 min)** — bring in our SE lead + ask David to bring Matt Williams (Chief Architect) and/or Raja Thomas (data eng). Whiteboard Marsh's source list against ODI on Databricks. |
| Procurement-minded | **POC scope** — one source he picks (likely SQL Server claims or one Oracle PAS schema), one business question, 6-week timeline, into Delta on his S3 read by his Databricks. |
| Skeptical / hesitant | **Reference call** — insurance carriers running Oracle/SQL Server CDC into Delta/Iceberg on AWS today. |

**Closing:**
> "David, three options for the next conversation — architecture deep-dive, POC scoping, or a reference call. Which is the most useful use of your time? I can have any of them booked this week."

---

## Cheat sheet — when he pushes back

| He says | You say |
|---|---|
| "We're Databricks-standardized." | "Understood — and that's a strength, not a barrier. ODI lands data in the open tables Databricks already reads. We're the on-ramp, not a replacement." |
| "We built our own ingestion framework." | "Common pattern — and a smart one for the time it was built. Question is what your team would build *next* if they weren't maintaining JDBC plumbing." |
| "Why not just use Delta Live Tables?" | "DLT is excellent for transformation inside Databricks. The question is what's *feeding* it from your Oracle and SQL Server today. Fivetran sits one layer upstream of DLT." |
| "Iceberg is too new." | "Delta works identically — same pattern, same value. Marsh picks the format. Netflix, Apple, Stripe on Iceberg; thousands of Databricks customers on Delta. Both are open." |
| "We already have Fivetran." | "Then half the work is done. The question is the destination — is it landing in a warehouse, or in open Delta/Iceberg on S3 that Databricks reads natively?" |
| "What about Informatica?" | "Coexistence for years. ODI changes *where* data lands, not whether Informatica keeps doing what it does for the workloads where it's earning its keep." |
| "Pricing?" | "MAR-based, same model. No warehouse egress. We'll model your specific source list at the architecture call." |
| "Why not just keep using JDBC into Databricks?" | "Latency, schema evolution, and the team-hours your engineers spend on connector maintenance versus on the analytics work that actually moves the business. We can put numbers on that during the architecture call." |

---

## Anti-patterns (read twice before the call)

- ❌ Don't open the Fivetran sync UI. Ever.
- ❌ Don't pitch ODI as a Databricks replacement. **Databricks is sacred at Marsh.** ODI feeds it.
- ❌ Don't say "ELT" or "data movement." Say "lake-first ingestion" or "CDC into open tables."
- ❌ Don't show `/holdings` — kills the insurance framing.
- ❌ Don't click Pipeline "Simulate failure" — exposes "Simulated:" text.
- ❌ Don't demo `/agent` without a tested API key. The disabled state signals incomplete.
- ❌ Don't read this doc. Glance only. Eyes on David.
- ❌ Don't promise GA dates you're not 100% on. "Confirm and email same day" is safe.
- ❌ Don't claim David has said anything publicly about Iceberg/Delta — he hasn't.
- ❌ Don't name McGriff, Raja Thomas, or Matt Williams unprompted. If David raises any of them, you're glad to hear it. If he doesn't, don't reveal we've been talking to his team.
- ❌ Don't apologize for any localhost glitch. Pivot to the live URL silently.

---

## After the call (within 30 min)

- Email David + cc manager. Subject: *"Marsh + ODI — the open landing zone for Databricks."* One paragraph. Live `/architecture` URL + next-step calendar invite.
- CRM: discovery answers, what resonated, what fell flat, what surprised us.
- If he asked for the reference call: line up two carriers same-day on Delta/Iceberg-on-AWS. Don't wait for him to chase.
- Loop our manager into next-step prep within 24 hours regardless of outcome — this call is the template if it lands.
