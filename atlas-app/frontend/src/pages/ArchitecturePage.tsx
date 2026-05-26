// Verity Insurance — Open Data Infrastructure architecture page.
//
// Upgraded from the basic three-engine diagram to the full Snowflake-Summit
// medallion surface: AliveMedallion (particle flow + per-source freshness),
// ticking throughput hero, schema-evolution ticker, FinOps cost panel,
// failure/recovery panel, NAIC-flavoured data contracts, interactive
// lineage, multi-engine showcase, Iceberg catalog, data-quality strip,
// and the before/after pipeline panel. Athena is the primary engine for
// Verity; Snowflake/DuckDB/Trino/Spark stay listed as the open-lake reads.
//
// Iceberg table list is inlined (no extra API endpoint) so the page can
// render in the recording even if connectors are paused.

import { useState, useEffect } from 'react';
import { AliveMedallion, type SourceNode, type EngineNode, type ConsumerRole } from '../components/AliveMedallion';

const VERITY_SOURCES: SourceNode[] = [
  { id: 'policy',    label: 'Policy Admin System',   sub: 'SQL Server log-CDC',   logo: 'sqlserver', freshness: '52s lag',  status: 'healthy', pipelineUrl: 'https://fivetran.com/dashboard/connectors/granite_rocky' },
  { id: 'claims',    label: 'Claims Mart',           sub: 'Oracle Binary Log Reader', logo: 'oracle', freshness: '3 min lag', status: 'healthy', pipelineUrl: 'https://fivetran.com/dashboard/connectors/intentional_began' },
  { id: 'telem',     label: 'Telematics Stream',     sub: 'Kafka event stream',    logo: 'hl7',       freshness: 'live',      status: 'healthy', streaming: true },
  { id: 'naic',      label: 'NAIC Filings',          sub: 'Weekly regulatory feed',logo: 'naic',      freshness: '4d lag',    status: 'healthy' },
];

const VERITY_ENGINES: EngineNode[] = [
  { name: 'Snowflake', active: true,  logo: 'snowflake' },
  { name: 'Athena',                   logo: 'athena' },
  { name: 'DuckDB',                   logo: 'duckdb' },
  { name: 'Trino',                    logo: 'trino' },
  { name: 'Spark',                    logo: 'spark' },
];

const VERITY_ROLES: ConsumerRole[] = [
  { label: 'Underwriters', sub: 'risk pricing' },
  { label: 'Claims',       sub: 'fraud & SIU' },
  { label: 'Actuarial',    sub: 'reserves & rate' },
  { label: 'Compliance',   sub: 'NAIC reporting' },
];

// ─── Types (local) ──────────────────────────────────────────────────────────

interface IcebergTable {
  database: 'bronze' | 'silver' | 'gold';
  table: string;
  source_system: string;
  rows: number;
  bytes: number;
  schema_columns: number;
  partitions: string[];
  last_updated_at: string;
}

interface QueryEngine {
  name: 'Athena' | 'Snowflake' | 'DuckDB' | 'Trino' | 'Spark';
  status: 'active' | 'available' | 'demo';
  description: string;
  sample_query: string;
}

const TABLES: IcebergTable[] = [
  { database: 'bronze', table: 'bronze.verity__policies',          source_system: 'oracle · Policy Admin',     rows: 2_184_000, bytes: 1_240_000_000, schema_columns: 96,  partitions: ['ingest_date'],        last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.verity__policyholders',     source_system: 'oracle · Policy Admin',     rows: 1_842_000, bytes: 942_000_000,   schema_columns: 64,  partitions: ['ingest_date'],        last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.verity__premium_ledger',    source_system: 'oracle · Policy Admin',     rows: 18_410_200, bytes: 4_820_000_000, schema_columns: 38,  partitions: ['ingest_date'],        last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.atlas__claim_events',       source_system: 'sql_server · Claims',       rows: 6_142_000, bytes: 2_410_000_000, schema_columns: 72,  partitions: ['ingest_date'],        last_updated_at: '2026-05-24T07:13:00Z' },
  { database: 'bronze', table: 'bronze.atlas__claim_payments',     source_system: 'sql_server · Claims',       rows: 8_842_400, bytes: 3_120_000_000, schema_columns: 41,  partitions: ['ingest_date'],        last_updated_at: '2026-05-24T07:13:00Z' },
  { database: 'bronze', table: 'bronze.atlas__claim_adjusters',    source_system: 'sql_server · Claims',       rows: 14_200,     bytes: 8_400_000,     schema_columns: 22,  partitions: [],                      last_updated_at: '2026-05-24T07:13:00Z' },
  { database: 'bronze', table: 'bronze.naic__carrier_filings',     source_system: 'http · NAIC API',           rows: 248_000,   bytes: 184_000_000,   schema_columns: 58,  partitions: ['filing_year'],         last_updated_at: '2026-05-24T03:00:00Z' },
  { database: 'bronze', table: 'bronze.naic__rate_filings',        source_system: 'http · NAIC SERFF',         rows: 124_400,   bytes: 92_000_000,    schema_columns: 34,  partitions: ['filing_year'],         last_updated_at: '2026-05-24T03:00:00Z' },
  { database: 'bronze', table: 'bronze.noaa__storm_events',        source_system: 'http · NOAA NCEI',          rows: 1_842_000, bytes: 462_000_000,   schema_columns: 48,  partitions: ['event_date'],          last_updated_at: '2026-05-24T07:12:00Z' },

  { database: 'silver', table: 'silver.int_policy_exposure_spine',  source_system: 'dbt · merged',             rows: 2_184_000, bytes: 980_000_000,   schema_columns: 54,  partitions: ['effective_date'],      last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_claim_lifecycle',         source_system: 'dbt · merged',             rows: 6_142_000, bytes: 2_140_000_000, schema_columns: 46,  partitions: ['loss_date'],            last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_carrier_exposure',        source_system: 'dbt · merged',             rows: 184_400,   bytes: 124_000_000,   schema_columns: 38,  partitions: ['quarter'],              last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_peril_state_grid',       source_system: 'dbt · merged',             rows: 482_200,   bytes: 312_000_000,   schema_columns: 24,  partitions: ['peril', 'state'],       last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_cat_event_impact',       source_system: 'dbt · merged',             rows: 1_124_000, bytes: 412_000_000,   schema_columns: 31,  partitions: ['event_date'],           last_updated_at: '2026-05-24T07:18:00Z' },

  { database: 'gold',   table: 'gold.dim_carriers',                 source_system: 'dbt mart',                 rows: 6_240,     bytes: 4_800_000,     schema_columns: 32,  partitions: [],                      last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.dim_perils',                    source_system: 'dbt mart',                 rows: 48,        bytes: 184_000,       schema_columns: 18,  partitions: [],                      last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.dim_states',                    source_system: 'dbt mart',                 rows: 56,        bytes: 92_000,        schema_columns: 14,  partitions: [],                      last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_carrier_risk_signal',       source_system: 'dbt mart',                 rows: 184_400,   bytes: 142_000_000,   schema_columns: 38,  partitions: ['as_of_week'],          last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_carrier_loss_ratio_by_peril_state_weekly', source_system: 'dbt mart', rows: 412_200,   bytes: 184_000_000,   schema_columns: 26,  partitions: ['as_of_week'],          last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_cat_exposure',              source_system: 'dbt mart',                 rows: 482_200,   bytes: 224_000_000,   schema_columns: 32,  partitions: ['peril', 'state'],      last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_loss_development',          source_system: 'dbt mart',                 rows: 1_142_000, bytes: 412_000_000,   schema_columns: 28,  partitions: ['accident_quarter'],    last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_denied_claims',             source_system: 'dbt mart',                 rows: 224_400,   bytes: 124_000_000,   schema_columns: 31,  partitions: ['denial_month'],        last_updated_at: '2026-05-24T07:22:00Z' },
];

const ENGINES: QueryEngine[] = [
  {
    name: 'Athena',
    status: 'active',
    description: 'Primary serverless engine for the Verity gold layer. Reads Iceberg externals through Glue catalog; pay per query, zero infra to manage. Where the front end, the cost-estimator, and the underwriting copilot all land.',
    sample_query: `SELECT
  c.naic_code, c.carrier, c.hq_state,
  r.loss_ratio_ttm, r.cat_exposure_score,
  r.risk_bucket, r.as_of_week
FROM gold.dim_carriers              c
JOIN gold.fct_carrier_risk_signal   r USING (naic_code)
WHERE r.risk_bucket IN ('elevated','high')
  AND r.as_of_week = date_trunc('week', current_date)
ORDER BY r.loss_ratio_ttm DESC
LIMIT 25;`,
  },
  {
    name: 'Snowflake',
    status: 'available',
    description: 'External tables can point at the same Iceberg lake — useful if an analytics team is Snowflake-resident. Same gold tables, same row counts, no copy.',
    sample_query: `SELECT peril, state, SUM(written_premium_qtd) AS premium_qtd
FROM gold.fct_cat_exposure
WHERE as_of_week >= date_trunc('quarter', current_date)
GROUP BY peril, state
ORDER BY premium_qtd DESC;`,
  },
  {
    name: 'DuckDB',
    status: 'available',
    description: 'Engineer\'s laptop. Same Iceberg tables, queried directly from S3 with the iceberg extension. Tiny ad-hoc joins without spinning up anything.',
    sample_query: `INSTALL iceberg;
LOAD iceberg;

SELECT *
FROM iceberg_scan('s3://verity-odi-lake/gold/fct_denied_claims/')
WHERE denial_reason_code IN ('LOB-FLD-EXC','PEND-IME')
LIMIT 100;`,
  },
  {
    name: 'Trino',
    status: 'available',
    description: 'Federated engine that joins the lake to other relational sources (state DOI systems, reinsurance treaty databases) without copying data first.',
    sample_query: `SELECT c.carrier, AVG(e.event_count) AS storms_per_year
FROM iceberg.gold.fct_carrier_risk_signal c
JOIN postgres.reinsurance.treaty_layers t
  ON t.cedant_naic = c.naic_code
WHERE c.line_of_business = 'Property'
GROUP BY c.carrier;`,
  },
  {
    name: 'Spark',
    status: 'available',
    description: 'Distributed compute for cat modelling and large carrier-portfolio joins. Reads the same Iceberg tables via the spark-iceberg runtime.',
    sample_query: `df = spark.read.format("iceberg")\\
  .load("gold.fct_cat_exposure")
df.groupBy("peril", "state")\\
  .agg({"written_premium_qtd": "sum"})\\
  .show()`,
  },
];

const ENGINE_COLORS: Record<QueryEngine['name'], string> = {
  Athena:    '#b8975c',
  Snowflake: '#29b5e8',
  DuckDB:    '#0b2545',
  Trino:     '#1d4e89',
  Spark:     '#b45309',
};

// ─── Number formatters (local) ──────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBytes(b: number): string {
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(2)} GB`;
  if (b >= 1_000_000)     return `${(b / 1_000_000).toFixed(1)} MB`;
  if (b >= 1_000)         return `${(b / 1_000).toFixed(1)} KB`;
  return `${b} B`;
}

// =============================================================================
// Page
// =============================================================================

export default function ArchitecturePage() {
  const [activeEngine, setActiveEngine] = useState<QueryEngine>(ENGINES[0]);

  const byLayer = (l: 'bronze' | 'silver' | 'gold') => TABLES.filter((t) => t.database === l);
  const layerStats = (l: 'bronze' | 'silver' | 'gold') => {
    const t = byLayer(l);
    return { tables: t.length, rows: t.reduce((s, r) => s + r.rows, 0), bytes: t.reduce((s, r) => s + r.bytes, 0) };
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-[var(--hairline)] pb-6">
        <div className="eyebrow mb-1">Open Data Infrastructure</div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ink-strong)]">
          One lake. Every engine. The whole carrier story.
        </h1>
        <p className="mt-3 text-[var(--ink-muted)] max-w-3xl leading-relaxed">
          Verity Insurance treats <em>storage</em>, <em>catalog</em>, and <em>compute</em> as three
          independently swappable layers. Iceberg is the storage spec. Glue is the catalog.
          Athena, Snowflake, DuckDB, Trino, and Spark can all read the same tables &mdash; no copy,
          no extract, no proprietary format between the policy system and the underwriter.
        </p>
        <p className="mt-3 font-serif italic text-[15px] text-[var(--ink-strong)] max-w-3xl leading-relaxed">
          Fivetran moves what's new. Great Expectations decides what passes. dbt decides what
          becomes business-ready.
        </p>
      </header>

      {/* ── Live throughput hero (rows in motion, ticking up) ─────────────── */}
      <ThroughputHero />

      {/* ── Sync-aware dbt savings teaser — actuals only; full forecast below ── */}
      <RunCacheSavingsTeaser hitPercent={81} hoursSaved={2.59} dollarsSaved={5.18} />

      {/* ── Data Flow diagram ─────────────────────────────────────────────── */}
      <section className="research-card p-6 sm:p-8 mb-8" style={cardStyle}>
        <div className="eyebrow mb-1">Data Flow</div>
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mb-2">
          Fivetran &rarr; Iceberg (MDLS) &rarr; Snowflake &middot; Athena &middot; Trino &rarr; dbt
        </h2>
        <p className="text-sm text-[var(--ink-muted)] leading-relaxed max-w-3xl mb-6">
          Fivetran lands every CDC row into Iceberg (MDLS) on S3 in open Apache Iceberg format &mdash;
          one copy of the bytes. Snowflake, Athena, and Trino all read the same Iceberg tables via
          external table catalogs (no copies, no extracts). Fivetran Transformations triggers dbt
          Labs the moment each source sync finishes; bronze &rarr; silver &rarr; gold materialization
          stays in Iceberg.
        </p>

        <AliveMedallion
          sources={VERITY_SOURCES}
          bronze={{ ...layerStats('bronze'), trend: [220, 235, 248, 262, 278, 294, 310] }}
          silver={{ ...layerStats('silver'), trend: [140, 152, 165, 178, 192, 205, 218] }}
          gold={{   ...layerStats('gold'),   trend: [88, 96, 105, 115, 124, 135, 148] }}
          engines={VERITY_ENGINES}
          roles={VERITY_ROLES}
          enginesCaption="All five read the same data — no copies, no rebuilds per tool."
          accent="#b8975c"
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[var(--ink-muted)]">
          <LayerDetail layer="bronze" stats={layerStats('bronze')} desc="Raw rows landed by Fivetran. 1:1 with source. CDC kept current within five minutes." />
          <LayerDetail layer="silver" stats={layerStats('silver')} desc="Conformed dims and facts. Cleaned, deduped, joined to a policy + exposure spine." />
          <LayerDetail layer="gold"   stats={layerStats('gold')}   desc="Business-ready marts + the dbt semantic layer. What every underwriter-facing surface reads." />
        </div>
      </section>

      {/* ── Schema-evolution ticker (Iceberg's killer feature) ────────────── */}
      <SchemaEvolutionTicker />

      {/* ── Sync-aware dbt incrementals — zero-row builds when Fivetran no-ops ─ */}
      <RunCachePanel />

      {/* ── Cost panel (the CFO line) ────────────────────────────────────── */}
      <CostPanel />

      {/* ── Failure & recovery ────────────────────────────────────────────── */}
      <FailureRecoveryPanel />

      {/* ── NAIC + state-DOI compliance data contracts ────────────────────── */}
      <DataContractsPanel />

      {/* ── Interactive lineage — click any gold model, see its upstreams ── */}
      <LineagePanel />

      {/* ── Multi-engine showcase ────────────────────────────────────────── */}
      <section className="research-card overflow-hidden mb-8" style={cardStyle}>
        <header className="research-card-header" style={cardHeaderStyle}>
          <div className="eyebrow">Compute is a choice</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Same Iceberg tables. Five engines. One query at a time.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Pick a query engine &mdash; the SQL barely changes, but the operational, cost, and
            governance profile shifts dramatically. That choice belongs to the carrier, not the vendor.
          </p>
        </header>

        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {ENGINES.map((e) => (
            <button
              key={e.name}
              onClick={() => setActiveEngine(e)}
              className="px-3 py-2 rounded-sm text-xs font-semibold uppercase tracking-wider border transition-all"
              style={
                activeEngine.name === e.name
                  ? { background: ENGINE_COLORS[e.name], borderColor: ENGINE_COLORS[e.name], color: '#ffffff' }
                  : { background: '#ffffff', color: 'var(--ink-muted)', borderColor: 'var(--hairline)' }
              }
            >
              {e.name}
              {e.status === 'active' && <span className="ml-1.5 text-[9px] opacity-80">● ACTIVE</span>}
              {e.status === 'demo'   && <span className="ml-1.5 text-[9px] opacity-60">DEMO</span>}
            </button>
          ))}
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-2">Query</div>
            <pre className="rounded-sm p-4 text-[11.5px] leading-relaxed overflow-x-auto font-mono" style={{ background: '#0b2545', color: 'var(--paper,#fefaf3)' }}>
              <code>{activeEngine.sample_query}</code>
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-2">Why this engine</div>
            <p className="text-sm text-[var(--ink)] leading-relaxed">{activeEngine.description}</p>
            <div className="mt-4 pt-4 border-t border-[var(--hairline-soft,#e8e4d8)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-1">Status</div>
              <div className="text-sm font-semibold" style={{ color: activeEngine.status === 'active' ? '#16a34a' : '#6b7280' }}>
                {activeEngine.status === 'active' ? '● Primary engine — powers this site' : 'Compatible and ready to wire in'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Iceberg catalog ──────────────────────────────────────────────── */}
      <section className="research-card overflow-hidden mb-8" style={cardStyle}>
        <header className="research-card-header" style={cardHeaderStyle}>
          <div className="eyebrow">Iceberg Catalog</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Every table on the lake, registered in AWS Glue
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Open metadata. Every engine reads the same schema, the same partition layout, the same
            row counts &mdash; without anyone owning the "source of truth" exclusively.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="border-b border-[var(--hairline)]" style={{ background: 'var(--paper-deep,#f4efe2)' }}>
              <tr>
                <Th>Layer</Th>
                <Th>Table</Th>
                <Th>Source</Th>
                <Th align="right">Rows</Th>
                <Th align="right">Size</Th>
                <Th align="right">Columns</Th>
                <Th>Partitions</Th>
                <Th align="right">Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline-soft,#e8e4d8)]">
              {TABLES.map((t) => (
                <tr key={`${t.database}.${t.table}`} className="hover:bg-[var(--paper-deep,#f4efe2)] cursor-default">
                  <td className="px-4 py-2.5"><LayerChip layer={t.database} /></td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-strong)]">{t.table}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)] font-mono">{t.source_system}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[var(--ink-strong)]">{formatNumber(t.rows)}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--ink)]">{formatBytes(t.bytes)}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--ink-muted)]">{t.schema_columns}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)] font-mono">
                    {t.partitions.length ? t.partitions.join(', ') : <span className="text-[var(--ink-soft)]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--ink-muted)] font-mono">
                    {new Date(t.last_updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Data Quality — dbt Labs ──────────────────────────────────────── */}
      <section className="research-card overflow-hidden mb-8" style={cardStyle}>
        <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
          <div>
            <div className="eyebrow" style={{ color: '#FF694A' }}>Data Quality · dbt Labs</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
              Every table tested. Every run. Same lake.
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              Tests defined in dbt Labs run on every build, against the same Iceberg tables every
              engine reads. Failures block promotion to the next layer &mdash; bad data never
              reaches the underwriting desk. Paired with the Great Expectations checkpoints below:
              GX runs suite-based expectations against raw landings; dbt enforces SQL-native
              contracts across bronze, silver, and gold.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#FF694A' }}>
            dbt Labs
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
          {[
            { layer: 'bronze' as const, tests: 24, passing: 24, monitors: ['freshness', 'volume', 'schema drift'],                                                color: '#b45309' },
            { layer: 'silver' as const, tests: 62, passing: 61, monitors: ['nulls', 'uniqueness', 'referential', 'accepted values'],                              color: '#6b7280' },
            { layer: 'gold'   as const, tests: 38, passing: 38, monitors: ['PII-flagged columns', 'PML reconciliation', 'loss-ratio sum-to-source'],              color: '#b8975c' },
          ].map((q) => {
            const ok = q.passing === q.tests;
            return (
              <div key={q.layer} className="p-5">
                <div className="flex items-center justify-between">
                  <LayerChip layer={q.layer} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ok ? '#16a34a' : '#dc2626' }}>
                    {ok ? '● all passing' : `● ${q.tests - q.passing} warn`}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <div className="font-serif text-3xl font-semibold text-[var(--ink-strong)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {q.passing}<span className="text-[var(--ink-soft)]">/{q.tests}</span>
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">tests · last run 12m ago</div>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-[var(--ink-muted)]">
                  {q.monitors.map((m) => (
                    <li key={m} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: q.color }} />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-[var(--hairline-soft,#e8e4d8)] flex items-center justify-between text-[11px] text-[var(--ink-soft)]" style={{ background: 'var(--paper-deep,#f4efe2)' }}>
          <span className="font-mono">124 tests · 123 passing · 1 warn · 0 errors</span>
          <span className="uppercase tracking-wider font-semibold">dbt Labs · joining Fivetran</span>
        </div>
      </section>

      {/* ── Data Quality — Great Expectations (Fivetran-stewarded OSS) ──── */}
      <GreatExpectationsPanel />

      {/* ── Before / After — what ODI actually replaces ──────────────────── */}
      <BeforeAfterPanel />
    </div>
  );
}

// =============================================================================
// Helpers — shared styles + sub-components
// =============================================================================

const cardStyle = {
  background: '#ffffff',
  border: '1px solid var(--hairline, #d9d3c4)',
  borderRadius: '4px',
};

const cardHeaderStyle = {
  padding: '20px',
  borderBottom: '1px solid var(--hairline-soft, #e8e4d8)',
};

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)] ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function LayerChip({ layer }: { layer: 'bronze' | 'silver' | 'gold' }) {
  const styles: Record<typeof layer, { bg: string; fg: string; border: string }> = {
    bronze: { bg: '#fef3c7', fg: '#92400e', border: '#b45309' },
    silver: { bg: '#f3f4f6', fg: '#374151', border: '#6b7280' },
    gold:   { bg: '#faf3e1', fg: '#7a5e2d', border: '#b8975c' },
  };
  const s = styles[layer];
  return (
    <span className="inline-block text-[9px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-sm border"
          style={{ background: s.bg, color: s.fg, borderColor: s.border }}>
      {layer}
    </span>
  );
}

function LayerDetail({ layer, stats, desc }: { layer: 'bronze' | 'silver' | 'gold'; stats: { tables: number; rows: number; bytes: number }; desc: string }) {
  return (
    <div className="border border-[var(--hairline,#d9d3c4)] rounded-sm p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <LayerChip layer={layer} />
        <span className="text-[10px] text-[var(--ink-soft)] font-mono">{stats.tables} table{stats.tables === 1 ? '' : 's'}</span>
      </div>
      <div className="text-sm font-bold text-[var(--ink-strong)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(stats.rows)} rows · {formatBytes(stats.bytes)}
      </div>
      <div className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">{desc}</div>
    </div>
  );
}

// =============================================================================
// ThroughputHero — pulsing live counter "rows in motion today"
// =============================================================================
function ThroughputHero() {
  const [rowsToday, setRowsToday] = useState(6_842_017);
  // Tick up by 6–14 rows every 600ms — matches real CDC arrival pace
  useEffect(() => {
    const id = setInterval(() => setRowsToday((n) => n + 6 + Math.floor(Math.random() * 9)), 600);
    return () => clearInterval(id);
  }, []);
  const trend = [4.8, 5.2, 5.6, 5.9, 6.2, 6.6, 6.84]; // 7-day Mrows
  return (
    <section className="mb-8 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 sm:gap-4">
      <div className="research-card p-5 sm:p-6 relative overflow-hidden" style={cardStyle}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(184,151,92,0.14), transparent 60%)' }} />
        <div className="relative">
          <div className="eyebrow" style={{ color: '#b8975c' }}>● Live</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)] font-semibold">
            Rows in motion today
          </div>
          <div className="mt-2 font-serif font-semibold leading-none text-[var(--ink-strong)]"
               style={{ fontSize: 44, fontVariantNumeric: 'tabular-nums' }}>
            {rowsToday.toLocaleString()}
          </div>
          <div className="mt-2 text-xs text-[var(--ink-muted)]">across 4 sources · 22 Iceberg tables · CDC + streaming</div>
        </div>
      </div>
      <Kpi label="CDC freshness · p50" value="38s" sub="SQL Server claims source" />
      <Kpi label="Bronze → Gold lag · p99" value="6 min" sub="Within 10-min SLO" />
      <Kpi label="Connector uptime · 90d" value="99.97%" sub={
        <Sparklike values={trend} />
      } />
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="research-card p-4 sm:p-5" style={cardStyle}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold">{label}</div>
      <div className="mt-1.5 font-serif font-semibold leading-none text-[var(--ink-strong)]"
           style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)]">{sub}</div>
    </div>
  );
}

function Sparklike({ values }: { values: number[] }) {
  const max = Math.max(...values), min = Math.min(...values);
  const rng = max - min || 1;
  const w = 80, h = 18;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#b8975c" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// =============================================================================
// RunCacheSavingsTeaser — slim band placed beneath ThroughputHero. Shows
// today's *actuals* (not the annual projection) with a jump-link to the
// full forecast model inside RunCachePanel below. Neutral slate card +
// violet left-border so it doesn't fight the ThroughputHero palette.
// =============================================================================
function RunCacheSavingsTeaser({
  hitPercent,
  hoursSaved,
  dollarsSaved,
}: {
  hitPercent: number;
  hoursSaved: number;
  dollarsSaved: number;
}) {
  return (
    <section className="mb-8 research-card overflow-hidden" style={{ ...cardStyle, borderLeft: '4px solid #7c3aed' }}>
      <div className="p-4 sm:p-5 flex items-center gap-x-6 gap-y-3 flex-wrap">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#7c3aed' }}>
            Sync-aware dbt · last 24h
          </div>
          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">Today's actuals · annual model below</div>
        </div>
        <div className="flex items-baseline gap-x-6 gap-y-2 flex-wrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <TeaserStat big={`$${dollarsSaved.toFixed(2)}`} sub="saved today" accent />
          <TeaserStat big={`${hoursSaved.toFixed(1)} h`} sub="compute skipped" />
          <TeaserStat big={`${hitPercent}%`} sub="no-op rate" />
        </div>
        <a href="#run-cache-forecast" className="ml-auto text-[11px] font-semibold whitespace-nowrap hover:underline" style={{ color: '#7c3aed' }}>
          See annual forecast &rarr;
        </a>
      </div>
    </section>
  );
}

function TeaserStat({ big, sub, accent = false }: { big: string; sub: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-serif font-semibold leading-none" style={{ fontSize: 22, color: accent ? '#7c3aed' : 'var(--ink-strong)' }}>
        {big}
      </span>
      <span className="text-[10.5px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">{sub}</span>
    </div>
  );
}

// =============================================================================
// RunCachePanel — Fivetran skips a sync entirely when source data hasn't
// changed. Hit rate runs in the low-80s on Verity's mixed Oracle / SQL
// Server / NOAA / NAIC connector set; reference data (carrier filings,
// peril codes, state grids) changes rarely, which keeps the average high.
// =============================================================================
function RunCachePanel() {
  // Connector-level hit rates over the last 24h. Quiet reference feeds run
  // near 100%; the premium ledger churns. The mix lands the aggregate at ~81%.
  const CONNECTORS = [
    { name: 'Oracle Policy Admin · policies',       scheduled: 96, skipped: 86, hit: 0.896 },
    { name: 'Oracle Policy Admin · premium_ledger', scheduled: 96, skipped: 60, hit: 0.625 },
    { name: 'SQL Server Claims · claim_events',     scheduled: 96, skipped: 75, hit: 0.781 },
    { name: 'NAIC · carrier filings',               scheduled: 24, skipped: 24, hit: 1.000 },
    { name: 'NAIC · rate filings',                  scheduled: 24, skipped: 23, hit: 0.958 },
    { name: 'NOAA · storm events',                  scheduled: 48, skipped: 43, hit: 0.896 },
  ];
  const tot = CONNECTORS.reduce((a, c) => ({ s: a.s + c.scheduled, k: a.k + c.skipped }), { s: 0, k: 0 });
  const hit = tot.s ? Math.round((tot.k / tot.s) * 100) : 0;

  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
        <div>
          <div className="eyebrow" style={{ color: '#7c3aed' }}>Sync-aware dbt incrementals</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            The cheapest dbt build is the one that processes zero rows.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
            Before each scheduled sync, Fivetran checks the source for changes. When there are
            none, the sync is a no-op and the <code className="font-mono text-[12px]">_fivetran_synced</code> timestamp
            doesn't advance &mdash; so dbt incrementals filtered on it process zero rows on the
            downstream build. Claims arrive in business-hour bursts and the NAIC/NOAA reference
            feeds barely move; the no-op detection earns its keep on the long quiet stretches in
            between, then steps aside when the premium ledger and claim events light up.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#7c3aed' }}>
          {hit}% Fivetran no-op · 24h
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <RecoveryTile label="Fivetran no-op sync rate · 24h" big={`${hit}%`}                                  sub={`${tot.k} of ${tot.s} scheduled syncs ended in no-op — source hadn't changed`} color="#7c3aed" />
        <RecoveryTile label="Compute hours saved · 90d"      big="118 h"                                       sub="≈ $236 in warehouse time at XS rate · idle hours bill at zero" color="#16a34a" />
        <RecoveryTile label="Annual savings · stack-wide"    big="$22.1k"                                      sub="Zero-row dbt builds + downstream skip · projected at full Meridian Re + Verity connector mix" color="#16a34a" />
        <RecoveryTile label="No-op-sync check time"          big="~200 ms"                                     sub="p50 control-plane check · no warehouse spin-up · no rows landed" />
      </div>

      <div className="p-5 border-t border-[var(--hairline-soft,#e8e4d8)]">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">No-op sync rate · by connector · last 24h</div>
        <ul className="space-y-2 max-w-4xl">
          {CONNECTORS.map((c) => {
            const pct = Math.round(c.hit * 100);
            const colour = pct >= 80 ? '#16a34a' : pct >= 50 ? '#7c3aed' : '#b45309';
            return (
              <li key={c.name} className="grid grid-cols-[1.6fr_3fr_auto] gap-3 items-center text-[12px]">
                <span className="font-mono text-[11px] text-[var(--ink-strong)] truncate">{c.name}</span>
                <span className="relative h-2.5 rounded-sm overflow-hidden" style={{ background: '#f4f4ef', border: '1px solid var(--hairline-soft,#e8e4d8)' }}>
                  <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: colour, transition: 'width 600ms ease' }} />
                </span>
                <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
                  <strong className="text-[var(--ink-strong)]">{pct}%</strong> · {c.skipped}/{c.scheduled}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 pt-3 border-t border-[var(--hairline-soft,#e8e4d8)] grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-[12px] text-[var(--ink-muted)] leading-snug">
          <div><strong className="text-[var(--ink-strong)]">Filter on <code className="font-mono text-[11px]">_fivetran_synced</code></strong> in every dbt incremental &mdash; that's what propagates Fivetran's no-op decision into the dbt build.</div>
          <div><strong className="text-[var(--ink-strong)]">Honor <code className="font-mono text-[11px]">_fivetran_deleted</code></strong> for soft deletes; the staging layer carries the flag through to gold.</div>
          <div><strong className="text-[var(--ink-strong)]">Never <code className="font-mono text-[11px]">--full-refresh</code></strong> on a schedule &mdash; one rebuild defeats months of saved compute.</div>
        </div>
        <div className="mt-4 rounded-sm border border-[var(--hairline-soft,#e8e4d8)] p-3 flex items-start gap-3 text-[12px]" style={{ background: 'rgba(125,58,237,0.04)' }}>
          <span className="inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white shrink-0 mt-0.5" style={{ background: '#7c3aed' }}>Related</span>
          <div className="text-[var(--ink-muted)] leading-relaxed">
            <strong className="text-[var(--ink-strong)]">Looking for Run Cache the product?</strong> Run Cache is a separate dbt Core plugin (<code className="font-mono text-[11px]">pip install run-cache</code>) that skips, defers, or clones dbt models at the build level — different from this connector-side pattern. See the canonical page at <span className="font-mono text-[11px]">github.com/fivetran-jasonchletsos/00-Intro-ODI-Demo/run-cache</span>.
          </div>
        </div>
      </div>

      <RunCacheForecast
        syncsPerDay={tot.s}
        hitRate={tot.k / tot.s}
        secPerSync={30}
        ratePerHour={2.0}
        dbtAmplification={2.4}
        enterpriseScale={4.9}
        connectorCount={CONNECTORS.length}
      />
    </section>
  );
}

// -----------------------------------------------------------------------------
// RunCacheForecast — transparent savings model attached to RunCachePanel.
// Labelled "Model output · not actuals." Reconciles to the headline annual-
// savings tile via an enterprise-scale multiplier.
// -----------------------------------------------------------------------------
function RunCacheForecast({
  syncsPerDay,
  hitRate,
  secPerSync,
  ratePerHour,
  dbtAmplification,
  enterpriseScale,
  connectorCount,
}: {
  syncsPerDay: number;
  hitRate: number;
  secPerSync: number;
  ratePerHour: number;
  dbtAmplification: number;
  enterpriseScale: number;
  connectorCount: number;
}) {
  const syncsRun = Math.round(syncsPerDay * (1 - hitRate));
  const hoursBaseline = (syncsPerDay * secPerSync) / 3600;
  const hoursCached = (syncsRun * secPerSync) / 3600;
  const hoursSaved = hoursBaseline - hoursCached;
  const dollarsBaselineDay = hoursBaseline * ratePerHour * dbtAmplification;
  const dollarsCachedDay = hoursCached * ratePerHour * dbtAmplification;
  const dollarsSavedDay = dollarsBaselineDay - dollarsCachedDay;
  const cachedPctOfBase = (hoursCached / hoursBaseline) * 100;
  const savedPctOfBase = 100 - cachedPctOfBase;

  const yr = dollarsSavedDay * 365;
  const yrEnterprise = yr * enterpriseScale;
  const hoursYrEnterprise = hoursSaved * 365 * enterpriseScale;

  return (
    <div
      id="run-cache-forecast"
      className="border-t border-[var(--hairline-soft,#e8e4d8)] p-5 scroll-mt-20"
      style={{ background: 'linear-gradient(180deg, rgba(124,58,237,0.04) 0%, rgba(124,58,237,0) 100%)' }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#7c3aed' }}>
            Forecast · projected savings
          </div>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">
            At today's modeled no-op rate, what skipping the unchanged syncs is worth in time and money.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider"
          style={{ background: '#ffffff', color: '#7c3aed', border: '1px solid #c4b5fd' }}
        >
          Model output · not actuals
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-5 text-[11px] font-mono text-[var(--ink-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span><strong className="text-[var(--ink-strong)]">{syncsPerDay}</strong> syncs/day</span>
        <span className="opacity-50">·</span>
        <span><strong className="text-[var(--ink-strong)]">{secPerSync}s</strong>/sync uncached</span>
        <span className="opacity-50">·</span>
        <span><strong className="text-[var(--ink-strong)]">{Math.round(hitRate * 100)}%</strong> modeled no-op rate</span>
        <span className="opacity-50">·</span>
        <span><strong className="text-[var(--ink-strong)]">${ratePerHour.toFixed(2)}</strong>/credit-hour XS</span>
        <span className="opacity-50">·</span>
        <span><strong className="text-[var(--ink-strong)]">{dbtAmplification}×</strong> dbt amp <span className="opacity-70">(incremental models only)</span></span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold">Daily picture</div>

          <div>
            <div className="flex items-baseline justify-between text-[11px] mb-1">
              <span className="font-semibold text-[var(--ink-strong)]">Without no-op detection</span>
              <span className="font-mono text-[var(--ink-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{hoursBaseline.toFixed(2)} h · ${dollarsBaselineDay.toFixed(2)}</span>
            </div>
            <div className="h-3.5 rounded-sm overflow-hidden" style={{ background: '#f4f4ef', border: '1px solid var(--hairline-soft,#e8e4d8)' }}>
              <div className="h-full" style={{ width: '100%', background: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)', opacity: 0.85 }} />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between text-[11px] mb-1">
              <span className="font-semibold text-[var(--ink-strong)]">With no-op detection</span>
              <span className="font-mono text-[var(--ink-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{hoursCached.toFixed(2)} h · ${dollarsCachedDay.toFixed(2)}</span>
            </div>
            <div className="h-3.5 rounded-sm overflow-hidden" style={{ background: '#f4f4ef', border: '1px solid var(--hairline-soft,#e8e4d8)' }}>
              <div className="h-full" style={{ width: `${cachedPctOfBase.toFixed(1)}%`, background: 'linear-gradient(90deg, #7c3aed 0%, #6d28d9 100%)', opacity: 0.9, transition: 'width 900ms ease' }} />
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--hairline-soft,#e8e4d8)]">
            <div className="flex items-baseline justify-between text-[11.5px] mb-1">
              <span className="font-semibold" style={{ color: '#15803d' }}>Saved · zero-row dbt + amp</span>
              <span className="font-mono font-bold" style={{ color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{hoursSaved.toFixed(2)} h · ${dollarsSavedDay.toFixed(2)}</span>
            </div>
            <div className="h-3.5 rounded-sm overflow-hidden" style={{ background: '#f4f4ef', border: '1px solid var(--hairline-soft,#e8e4d8)' }}>
              <div className="h-full" style={{ width: `${savedPctOfBase.toFixed(1)}%`, background: 'linear-gradient(90deg, #16a34a 0%, #15803d 100%)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)', transition: 'width 900ms ease' }} />
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Cumulative savings · horizon</div>
          <div className="space-y-2">
            <HorizonRow label="Today"    big={`$${dollarsSavedDay.toFixed(2)}`}                sub={`${hoursSaved.toFixed(2)} compute-hours saved`} />
            <HorizonRow label="30 days"  big={`$${(dollarsSavedDay * 30).toFixed(0)}`}         sub={`${(hoursSaved * 30).toFixed(0)} hours saved`} />
            <HorizonRow label="Quarter"  big={`$${(dollarsSavedDay * 90).toFixed(0)}`}         sub={`${(hoursSaved * 90).toFixed(0)} hours saved`} />
            <HorizonRow label="Annual"   big={`$${(yr).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub={`${(hoursSaved * 365).toFixed(0)} hours saved · this ${connectorCount}-connector mix`} accent />
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--hairline-soft,#e8e4d8)] rounded-sm p-2.5" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.18)' }}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#15803d' }}>Annual · enterprise scale</div>
                <div className="text-[10.5px] text-[var(--ink-muted)] mt-0.5">≈ {Math.round(enterpriseScale * connectorCount)} connectors at this hit-rate pattern</div>
              </div>
              <div className="text-right">
                <div className="font-serif font-semibold leading-none" style={{ fontSize: 22, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                  ${(yrEnterprise / 1000).toFixed(1)}k
                </div>
                <div className="font-mono text-[10px] text-[var(--ink-muted)] mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {(hoursYrEnterprise).toLocaleString('en-US', { maximumFractionDigits: 0 })} hours/yr
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed mt-5">
        <strong className="text-[var(--ink-strong)]">Validate in your environment.</strong> Demo-mix savings
        scale with sync cadence, warehouse rate, and downstream dbt model count &mdash; the dbt amplification
        multiplier reflects that every no-op-detected sync zero-rows the incrementals downstream of it.
        We size the enterprise extrapolation from your typical connector count and re-fit the assumptions during POC.
      </p>
    </div>
  );
}

function HorizonRow({ label, big, sub, accent = false }: { label: string; big: string; sub: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10.5px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold shrink-0" style={{ width: 72 }}>{label}</span>
      <span className="font-mono font-semibold shrink-0" style={{ color: accent ? '#15803d' : 'var(--ink-strong)', fontVariantNumeric: 'tabular-nums', fontSize: accent ? 14 : 12, minWidth: 70 }}>{big}</span>
      <span className="text-[10.5px] text-[var(--ink-soft)] truncate">{sub}</span>
    </div>
  );
}

// =============================================================================
// SchemaEvolutionTicker — Iceberg's killer feature, displayed as a stock-ticker
// =============================================================================
const EVO_EVENTS = [
  { ts: '2026-05-24 06:14', op: 'ADD COLUMN cat_exposure_score',         table: 'gold.fct_carrier_risk_signal',  ms: 36, models: 5 },
  { ts: '2026-05-23 22:01', op: 'RENAME COLUMN dob_str → dob',            table: 'bronze.verity__policyholders',  ms: 24, models: 6 },
  { ts: '2026-05-22 14:47', op: 'WIDEN INT → BIGINT reserve_amount',      table: 'silver.int_claim_lifecycle',    ms: 42, models: 3 },
  { ts: '2026-05-21 09:30', op: 'ADD COLUMN peril_subtype',                table: 'bronze.noaa__storm_events',     ms: 21, models: 4 },
  { ts: '2026-05-20 18:09', op: 'DROP COLUMN deprecated_pml_v1',          table: 'silver.int_cat_event_impact',   ms: 28, models: 2 },
];
function SchemaEvolutionTicker() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((n) => (n + 1) % EVO_EVENTS.length), 4200);
    return () => clearInterval(id);
  }, []);
  const e = EVO_EVENTS[idx];
  return (
    <section className="mb-8 research-card p-5 overflow-hidden relative" style={{ ...cardStyle, background: 'linear-gradient(90deg, #fff 0%, #f8fafc 100%)' }}>
      <div className="absolute top-0 right-0 bottom-0 w-1.5" style={{ background: 'linear-gradient(180deg, #b8975c, #0b2545)' }} />
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="eyebrow" style={{ color: '#0b2545' }}>Iceberg · Schema evolution</div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm" style={{ color: '#7a5e2d', background: '#faf3e1', border: '1px solid #ebd9a3' }}>
            ● Live feed
          </span>
        </div>
        <div className="font-mono text-[10px] text-[var(--ink-soft)]">last 5 schema changes</div>
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="font-mono text-[11px] text-[var(--ink-soft)]">{e.ts}</span>
        <span className="font-mono text-[13px] font-semibold text-[var(--ink-strong)]">{e.op}</span>
        <span className="font-mono text-[12px] text-[var(--ink-muted)]">on {e.table}</span>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[12px] text-[var(--ink-muted)] flex-wrap">
        <span><strong className="text-[var(--ink-strong)]">{e.ms} ms</strong> · metadata-only operation</span>
        <span>•</span>
        <span>0 data rewritten · 0 downtime</span>
        <span>•</span>
        <span><strong className="text-[var(--ink-strong)]">{e.models}</strong> downstream dbt models auto-revalidated</span>
      </div>
      <div className="mt-3 text-[11px] text-[var(--ink-soft)] leading-relaxed">
        Apache Iceberg treats schema changes as table metadata, not file rewrites. The Modern Data Stack equivalent —
        an Oracle <code className="font-mono">ALTER TABLE ADD COLUMN</code> on an 18 M-row premium ledger — locks the
        table for ~8 minutes during the rewrite. Same change in Iceberg: <strong>milliseconds, no lock</strong>.
      </div>
    </section>
  );
}

// =============================================================================
// CostPanel — the CFO line. Storage cheap, compute the lever.
// =============================================================================
function CostPanel() {
  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header" style={cardHeaderStyle}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow" style={{ color: '#b8975c' }}>FinOps</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
              What this costs to run, every day
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
              Storage and compute billed separately. Storage is essentially free at this scale; compute scales
              with workload because Athena bills per query and nothing else runs idle.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#b8975c' }}>
            −68% vs legacy
          </div>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <CostTile label="Storage · per day"   value="$0.91"  sub="2.6 TB across bronze/silver/gold · S3 Standard-IA"  color="#16a34a" />
        <CostTile label="Compute · per day"   value="$3.78"  sub="Athena per-query · dbt · Spark cat-modelling" color="#b8975c" />
        <CostTile label="Zero-row dbt · saved" value="$5.18"  sub="81% of Fivetran syncs no-op today · downstream dbt builds finish in zero rows" color="#7c3aed" />
        <CostTile label="Equivalent MDS"      value="$14.20" sub="Internal benchmark · same data, warehouse-resident" color="#dc2626" />
      </div>
      <div className="px-5 py-3 border-t border-[var(--hairline-soft,#e8e4d8)] flex items-center justify-between text-[11px] text-[var(--ink-soft)] bg-[var(--paper-deep,#f4efe2)]">
        <span>Compute curve: 64% of spend is the 7 AM–10 AM underwriting window. Idle hours bill at zero.</span>
        <span className="uppercase tracking-wider font-semibold">Cost-attribution: per-engine + per-dbt-model</span>
      </div>
    </section>
  );
}

function CostTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold">{label}</div>
      <div className="mt-2 font-serif font-semibold leading-none" style={{ fontSize: 30, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)] leading-snug">{sub}</div>
    </div>
  );
}

// =============================================================================
// FailureRecoveryPanel — the "what happens when it breaks" answer
// =============================================================================
function FailureRecoveryPanel() {
  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header" style={cardHeaderStyle}>
        <div className="eyebrow" style={{ color: '#b45309' }}>Resilience · Recovery</div>
        <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
          What happens when a connector fails
        </h2>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
          Every Fivetran connector has automatic retry with exponential backoff; failed rows land in a
          dead-letter queue for replay; dbt builds gate gold on green silver. NAIC compliance audit logs
          capture every retry. Below: the last 30 days.
        </p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <RecoveryTile label="Retry policy"          big="exp 5×"   sub="2s · 8s · 30s · 2m · 8m, then DLQ" />
        <RecoveryTile label="Dead-letter · current" big="9"        sub="rows held · 6 NOAA late-arriving, 3 NAIC schema lag" color="#b45309" />
        <RecoveryTile label="MTTR · last 30d"       big="5 min"    sub="median · max 19 min during NAIC cert rotation" />
        <RecoveryTile label="Last incident"         big="3 d ago"  sub="Replayed automatically in 4 min, zero data loss" color="#16a34a" />
      </div>
    </section>
  );
}

function RecoveryTile({ label, big, sub, color = 'var(--ink-strong)' }: { label: string; big: string; sub: string; color?: string }) {
  return (
    <div className="p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold">{label}</div>
      <div className="mt-1.5 font-serif font-semibold leading-none" style={{ fontSize: 26, color, fontVariantNumeric: 'tabular-nums' }}>
        {big}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)] leading-snug">{sub}</div>
    </div>
  );
}

// =============================================================================
// DataContractsPanel — NAIC + state-DOI governance (PII, RLS, masking, audit)
// =============================================================================
function DataContractsPanel() {
  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
        <div>
          <div className="eyebrow" style={{ color: '#5b21b6' }}>Data Contracts · NAIC + State-DOI Compliance</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Policyholder PII never leaves the lake without a policy
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
            Every column with policyholder PII (name, DOB, SSN, address) is tagged at ingest. Row-level
            access scopes by line-of-business and writing state. Column masking on SSN, DOB, full
            address. Every read goes to the NAIC SOC audit log.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#5b21b6' }}>
          NAIC SOC
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Policy coverage</div>
          <ul className="space-y-2 text-sm">
            <Policy label="PII columns tagged"          value="28 columns across 8 tables · policyholder name/DOB/SSN" />
            <Policy label="Row-level access policy"     value="line_of_business + writing_state scoped per role" />
            <Policy label="Column masking on read"      value="ssn · dob · street_address · phone · policy_number" />
            <Policy label="Audit log destination"        value="CloudTrail → S3 (7y NAIC retention) → Iceberg audit table" />
            <Policy label="De-identification path"      value="gold.fct_carrier_risk_signal uses NAIC Model Act de-id" />
          </ul>
        </div>
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Sample contract · gold.dim_carriers</div>
          <pre className="font-mono text-[11.5px] leading-relaxed overflow-x-auto rounded-sm p-3" style={{ background: '#0b2545', color: '#e6e9f0' }}><code>{`columns:
  - name: naic_code
    tests: [unique, not_null]
    meta: { regulatory_key: true }
  - name: policyholder_ssn
    tests: [not_null]
    meta: { contains_pii: true, mask_policy: "redact_full" }
  - name: policyholder_dob
    meta: { contains_pii: true, mask_policy: "year_only" }
  - name: writing_state
    tests: [accepted_values: dim_states]
    meta: { rls_partition_key: true }`}</code></pre>
        </div>
      </div>
    </section>
  );
}

function Policy({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#5b21b6' }} />
      <div className="flex-1">
        <span className="text-[var(--ink-strong)] font-semibold">{label}</span>
        <span className="text-[var(--ink-muted)]"> · {value}</span>
      </div>
    </li>
  );
}

// =============================================================================
// GreatExpectationsPanel — GX Core as the validation gate before Silver
// promotion. Fivetran became steward of the Great Expectations community
// and the GX Core project on 2026-05-13; dbt tests sit alongside GX as
// the "trust" pillar of Fivetran's ODI story (move · transform · trust).
// =============================================================================
interface GxSuite {
  suite: string;
  table: string;
  layer: 'bronze' | 'silver' | 'gold';
  expectations: number;
  passing: number;
  last_run: string;
  why: string;
}

const GX_SUITES: GxSuite[] = [
  {
    suite: 'verity.policy.completeness',
    table: 'bronze.verity__policies',
    layer: 'bronze',
    expectations: 19,
    passing: 19,
    last_run: '07:14:22',
    why: 'policy_id unique and not null; effective_dt ≤ expiration_dt; premium_amount in [$0, $50M]; line_of_business ∈ accepted set.',
  },
  {
    suite: 'verity.policyholder.identity',
    table: 'bronze.verity__policyholders',
    layer: 'bronze',
    expectations: 16,
    passing: 16,
    last_run: '07:14:30',
    why: 'name and date_of_birth populated; state_code ∈ US states; age in [16, 110] at policy inception.',
  },
  {
    suite: 'verity.premium_ledger.ranges',
    table: 'bronze.verity__premium_ledger',
    layer: 'bronze',
    expectations: 14,
    passing: 13,
    last_run: '07:14:38',
    why: 'premium_amount ≥ 0; transaction_date within last 24 months; one warn on 23 back-dated cancellation transactions.',
  },
  {
    suite: 'atlas.claim.referential',
    table: 'bronze.atlas__claim_events',
    layer: 'bronze',
    expectations: 21,
    passing: 21,
    last_run: '07:13:18',
    why: 'every claim resolves to a known policy_id; loss_date ≤ report_date ≤ today; claim_status ∈ accepted set.',
  },
  {
    suite: 'atlas.claim_payments.balance',
    table: 'bronze.atlas__claim_payments',
    layer: 'bronze',
    expectations: 13,
    passing: 13,
    last_run: '07:13:24',
    why: 'payment_amount in [$0, $10M]; payment_status ∈ {issued, void, recovered}; sum per claim ≤ policy limit.',
  },
  {
    suite: 'naic.carrier_filings.schema',
    table: 'bronze.naic__carrier_filings',
    layer: 'bronze',
    expectations: 12,
    passing: 12,
    last_run: '07:11:05',
    why: 'naic_company_code is a 5-digit numeric (e.g., 25143); filing_year in [2015, current]; required schedule pages present.',
  },
  {
    suite: 'noaa.storm_events.geo',
    table: 'bronze.noaa__storm_events',
    layer: 'bronze',
    expectations: 11,
    passing: 11,
    last_run: '07:12:48',
    why: 'lat/lon within US bounds; event_type ∈ NOAA standard list; magnitude within published ranges per event type.',
  },
  {
    suite: 'silver.exposure_spine.integrity',
    table: 'silver.int_policy_exposure_spine',
    layer: 'silver',
    expectations: 22,
    passing: 22,
    last_run: '07:18:11',
    why: 'one row per (policy_id, exposure_period); no orphan claim attachments; written_premium reconciles to ledger.',
  },
  {
    suite: 'gold.loss_ratio.contract',
    table: 'gold.fct_carrier_loss_ratio_by_peril_state_weekly',
    layer: 'gold',
    expectations: 14,
    passing: 14,
    last_run: '07:22:51',
    why: 'loss_ratio in [0, 5]; one row per (carrier_id, peril, state, week); peril_id ∈ dim_perils; state ∈ dim_states.',
  },
];

function GreatExpectationsPanel() {
  const totals = GX_SUITES.reduce(
    (a, s) => ({ exp: a.exp + s.expectations, pass: a.pass + s.passing, suites: a.suites + 1 }),
    { exp: 0, pass: 0, suites: 0 },
  );
  const warns = totals.exp - totals.pass;

  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
        <div>
          <div className="eyebrow" style={{ color: '#9a3412' }}>Data Quality · Great Expectations</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Validation runs on Bronze before anything reaches Silver.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
            Expectation suites define what "valid" looks like for each table &mdash; policy
            completeness, claim referential integrity to the policy master, NAIC schedule
            schema, NOAA geo bounds, premium ledger ranges. A failed expectation blocks
            promotion. Same lake, same Iceberg snapshots, just gated.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: '#9a3412' }}>
            GX Core · OSS
          </div>
          <div className="text-[10px] text-[var(--ink-soft)] font-mono">Fivetran-stewarded</div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <RecoveryTile label="Expectation suites"     big={String(totals.suites)}            sub="across bronze · silver · gold layers" />
        <RecoveryTile label="Expectations · today"   big={`${totals.pass}/${totals.exp}`}    sub={`${warns} warn · 0 errors · gates Silver promotion`} color={warns ? '#b45309' : '#16a34a'} />
        <RecoveryTile label="Checkpoint cadence"     big="every sync"                        sub="triggered by Fivetran sync-complete · runs before dbt build" />
        <RecoveryTile label="Failed-expectation queue" big="23 rows"                         sub="back-dated cancellations · held in dlq.gx_quarantine · retried after suite update" color="#b45309" />
      </div>

      <div className="overflow-x-auto border-t border-[var(--hairline-soft,#e8e4d8)]">
        <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead className="border-b border-[var(--hairline)]" style={{ background: 'var(--paper-deep,#f4efe2)' }}>
            <tr>
              <Th>Layer</Th>
              <Th>Suite</Th>
              <Th>Table under test</Th>
              <Th align="right">Expectations</Th>
              <Th align="right">Last run</Th>
              <Th>What it asserts</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline-soft,#e8e4d8)]">
            {GX_SUITES.map((s) => {
              const ok = s.passing === s.expectations;
              return (
                <tr key={s.suite} className="hover:bg-[var(--paper-deep,#f4efe2)] cursor-default">
                  <td className="px-4 py-2.5"><LayerChip layer={s.layer} /></td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-strong)]">{s.suite}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)] font-mono">{s.table}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: ok ? '#16a34a' : '#b45309' }}>
                    {s.passing}/{s.expectations}
                    {!ok && <span className="ml-1 text-[10px] uppercase tracking-wider">warn</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--ink-muted)] font-mono">{s.last_run}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink)] leading-snug max-w-md">{s.why}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)] border-t border-[var(--hairline-soft,#e8e4d8)]">
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Sample expectation suite · verity.policy.completeness</div>
          <pre className="font-mono text-[11.5px] leading-relaxed overflow-x-auto rounded-sm p-3" style={{ background: '#0b2545', color: '#e6e9f0' }}><code>{`# verity_policy_completeness.yml
expectation_suite_name: verity.policy.completeness
data_asset_name: bronze.verity__policies

expectations:
  - expect_column_values_to_not_be_null:
      column: policy_id
  - expect_column_values_to_be_unique:
      column: policy_id
  - expect_column_pair_values_a_to_be_less_than_b:
      column_A: effective_dt
      column_B: expiration_dt
  - expect_column_values_to_be_between:
      column: premium_amount
      min_value: 0
      max_value: 50000000
  - expect_column_values_to_be_in_set:
      column: line_of_business
      value_set: [Auto, Home, Umbrella, Commercial, Specialty]
  - expect_table_row_count_to_be_between:
      min_value: 2000000
      max_value: 2400000`}</code></pre>
        </div>
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">How this fits the stack</div>
          <ul className="space-y-2.5 text-sm">
            <Policy label="Fivetran moves" value="Oracle Policy Admin + SQL Server claims + NAIC / NOAA feeds into Bronze (Iceberg)" />
            <Policy label="Great Expectations validates" value="Bronze landings against suites before Silver promotion" />
            <Policy label="dbt transforms" value="Silver exposure spine + Gold marts; dbt tests assert SQL-level constraints" />
            <Policy label="Failed rows" value="route to dlq.gx_quarantine on the same lake; retried after suite update" />
            <Policy label="Open source" value="GX Core remains community-driven; Fivetran funds maintenance, ecosystem, and engineering investment" />
            <Policy label="Community" value="github.com/great-expectations/great_expectations · thousands of teams use GX outside Fivetran's customer base" />
          </ul>
          <div className="mt-4 pt-3 border-t border-[var(--hairline-soft,#e8e4d8)] text-[11px] text-[var(--ink-soft)] leading-relaxed">
            On May 13, 2026 Fivetran announced it is becoming steward of the Great Expectations open
            source community and the GX Core project, supporting ongoing maintenance, ecosystem
            integrations, and community engagement. Same open project, backed by sustained engineering.
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// BeforeAfterPanel — what ODI replaces vs the legacy insurance MDS pipeline
// =============================================================================
function BeforeAfterPanel() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="research-card p-6 border-l-4" style={{ ...cardStyle, borderLeftColor: '#dc2626' }}>
        <div className="eyebrow" style={{ color: '#dc2626' }}>Before · Modern Data Stack</div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-[var(--ink-strong)]">14 hops · 3 copies of the bytes</h3>
        <pre className="font-mono text-[10.5px] leading-relaxed mt-4 p-3 rounded-sm overflow-x-auto" style={{ background: '#fef2f2', color: '#7f1d1d', border: '1px solid #fecaca' }}>{`Policy Admin → SFTP → Informatica → Snowflake (raw)
       → dbt → Snowflake (silver) → Snowflake (gold)
       → Reverse-ETL → cat-model vendor mart
       → Tableau extract → underwriter laptop`}</pre>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[var(--ink-soft)] text-xs">Copies of the data</div><div className="font-serif text-2xl font-semibold text-[var(--ink-strong)]">3</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Avg end-to-end latency</div><div className="font-serif text-2xl font-semibold text-[var(--ink-strong)]">14 hr</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Daily run-rate</div><div className="font-serif text-2xl font-semibold text-[var(--ink-strong)]">$14.20</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Schema change</div><div className="font-serif text-lg font-semibold text-[var(--ink-strong)]">8-min lock</div></div>
        </div>
      </div>
      <div className="research-card p-6 border-l-4" style={{ ...cardStyle, borderLeftColor: '#b8975c' }}>
        <div className="eyebrow" style={{ color: '#b8975c' }}>After · Open Data Infrastructure</div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-[var(--ink-strong)]">5 hops · 1 copy of the bytes</h3>
        <pre className="font-mono text-[10.5px] leading-relaxed mt-4 p-3 rounded-sm overflow-x-auto" style={{ background: '#faf3e1', color: '#7a5e2d', border: '1px solid #ebd9a3' }}>{`Source → Fivetran CDC → Iceberg bronze
       → dbt → Iceberg silver
       → dbt → Iceberg gold
       ↳ Athena · Snowflake · DuckDB · Trino · Spark
         (all reading the same bytes, no copies)`}</pre>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[var(--ink-soft)] text-xs">Copies of the data</div><div className="font-serif text-2xl font-semibold" style={{ color: '#b8975c' }}>1</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Avg end-to-end latency</div><div className="font-serif text-2xl font-semibold" style={{ color: '#b8975c' }}>6 min</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Daily run-rate</div><div className="font-serif text-2xl font-semibold" style={{ color: '#b8975c' }}>$4.69</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Schema change</div><div className="font-serif text-lg font-semibold" style={{ color: '#b8975c' }}>milliseconds</div></div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// LineagePanel — pick any gold model, see its upstream silver + bronze.
// dbt's killer feature, surfaced as an interactive trace.
// =============================================================================
type LineageEdge = { from: string; to: string; tests?: string[] };

const LINEAGE_MAP: Record<string, { silver: string[]; bronze: string[]; edges: LineageEdge[]; story: string }> = {
  'gold.fct_carrier_risk_signal': {
    silver: ['silver.int_carrier_exposure', 'silver.int_claim_lifecycle', 'silver.int_cat_event_impact'],
    bronze: ['bronze.naic__carrier_filings', 'bronze.atlas__claim_events', 'bronze.noaa__storm_events'],
    story:  'Carrier risk signal blends NAIC filing metrics with Verity\'s own claim lifecycle and weighted cat-event exposure. Drives the Underwriting Copilot and the broker-tier risk feed.',
    edges: [
      { from: 'bronze.naic__carrier_filings', to: 'silver.int_carrier_exposure', tests: ['unique naic_code'] },
      { from: 'bronze.atlas__claim_events',   to: 'silver.int_claim_lifecycle',  tests: ['not-null claim_id'] },
      { from: 'bronze.noaa__storm_events',    to: 'silver.int_cat_event_impact', tests: ['streaming · 18 s p99'] },
      { from: 'silver.int_carrier_exposure',  to: 'gold.fct_carrier_risk_signal' },
      { from: 'silver.int_claim_lifecycle',   to: 'gold.fct_carrier_risk_signal' },
      { from: 'silver.int_cat_event_impact',  to: 'gold.fct_carrier_risk_signal' },
    ],
  },
  'gold.fct_cat_exposure': {
    silver: ['silver.int_policy_exposure_spine', 'silver.int_peril_state_grid', 'silver.int_cat_event_impact'],
    bronze: ['bronze.verity__policies', 'bronze.noaa__storm_events'],
    story:  'Cat exposure facts join in-force policies to peril/state grids and live NOAA storm events. Used by the Cat Exposure dashboard and reinsurance treaty planning.',
    edges: [
      { from: 'bronze.verity__policies',       to: 'silver.int_policy_exposure_spine' },
      { from: 'bronze.verity__policies',       to: 'silver.int_peril_state_grid' },
      { from: 'bronze.noaa__storm_events',     to: 'silver.int_cat_event_impact', tests: ['streaming · 18 s p99'] },
      { from: 'silver.int_policy_exposure_spine', to: 'gold.fct_cat_exposure' },
      { from: 'silver.int_peril_state_grid',     to: 'gold.fct_cat_exposure' },
      { from: 'silver.int_cat_event_impact',     to: 'gold.fct_cat_exposure' },
    ],
  },
  'gold.fct_loss_development': {
    silver: ['silver.int_claim_lifecycle'],
    bronze: ['bronze.atlas__claim_events', 'bronze.atlas__claim_payments'],
    story:  'Loss-development triangles by accident quarter and line. Powers the reserve-adequacy dashboard.',
    edges: [
      { from: 'bronze.atlas__claim_events',   to: 'silver.int_claim_lifecycle' },
      { from: 'bronze.atlas__claim_payments', to: 'silver.int_claim_lifecycle' },
      { from: 'silver.int_claim_lifecycle',   to: 'gold.fct_loss_development' },
    ],
  },
  'gold.fct_denied_claims': {
    silver: ['silver.int_claim_lifecycle'],
    bronze: ['bronze.atlas__claim_events', 'bronze.atlas__claim_adjusters'],
    story:  'Denied-claim signal joined to adjuster + line metadata. Drives the Claims Radar denial-pattern view.',
    edges: [
      { from: 'bronze.atlas__claim_events',     to: 'silver.int_claim_lifecycle' },
      { from: 'bronze.atlas__claim_adjusters',  to: 'silver.int_claim_lifecycle' },
      { from: 'silver.int_claim_lifecycle',     to: 'gold.fct_denied_claims' },
    ],
  },
};

function LineagePanel() {
  const goldOptions = Object.keys(LINEAGE_MAP);
  const [selected, setSelected] = useState<string>(goldOptions[0]);
  const lin = LINEAGE_MAP[selected];

  // Bronze on the left (x=20), Silver middle (x=320), Gold right (x=620).
  const BX = 20, MX = 320, RX = 620;
  const COL_W = 280;
  const ROW_H = 38, ROW_GAP = 8;
  const maxRows = Math.max(lin.bronze.length, lin.silver.length, 1);
  const HEIGHT = Math.max(maxRows * (ROW_H + ROW_GAP) + 40, 240);

  const bronzeY = (i: number) => 30 + i * (ROW_H + ROW_GAP);
  const silverY = (i: number) => 30 + i * (ROW_H + ROW_GAP);
  const goldY = (HEIGHT - ROW_H) / 2;

  const nodeOf = (name: string): { x: number; y: number; w: number; h: number } | null => {
    const bi = lin.bronze.indexOf(name);
    if (bi >= 0) return { x: BX, y: bronzeY(bi), w: COL_W, h: ROW_H };
    const si = lin.silver.indexOf(name);
    if (si >= 0) return { x: MX, y: silverY(si), w: COL_W, h: ROW_H };
    if (name === selected) return { x: RX, y: goldY, w: COL_W, h: ROW_H };
    return null;
  };

  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header" style={cardHeaderStyle}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow" style={{ color: '#FF694A' }}>dbt · Column-level lineage</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
              Pick any gold model. See exactly where its bytes come from.
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
              dbt emits lineage as a side-effect of build. Every join, every transformation, every test
              is documented automatically. Click a gold model below to trace upstream &mdash; bronze
              landings to silver intermediates to the gold mart.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#FF694A' }}>
            dbt Labs
          </div>
        </div>
      </header>

      {/* Gold model picker */}
      <div className="px-5 pt-4 flex flex-wrap gap-2">
        {goldOptions.map((g) => (
          <button
            key={g}
            onClick={() => setSelected(g)}
            className="px-3 py-2 rounded-sm text-[11.5px] font-mono border transition-all"
            style={
              selected === g
                ? { background: '#b8975c', borderColor: '#b8975c', color: '#fff' }
                : { background: '#fff', borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }
            }
          >
            {g}
          </button>
        ))}
      </div>

      <div className="p-5">
        <p className="text-sm text-[var(--ink)] mb-4 italic">{lin.story}</p>

        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${RX + COL_W + 20} ${HEIGHT}`} className="w-full" style={{ minWidth: 880, maxHeight: 360 }}>
            <defs>
              <marker id="lin-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#FF694A" />
              </marker>
            </defs>

            {/* Column eyebrows */}
            <text x={BX}        y={18} fontSize="10" fontWeight="700" fill="#826b3f" letterSpacing="1.6">BRONZE · raw</text>
            <text x={MX}        y={18} fontSize="10" fontWeight="700" fill="#374151" letterSpacing="1.6">SILVER · conformed</text>
            <text x={RX}        y={18} fontSize="10" fontWeight="700" fill="#7a5e2d" letterSpacing="1.6">GOLD · selected</text>

            {/* Edges first so cards sit on top */}
            {lin.edges.map((e, i) => {
              const a = nodeOf(e.from);
              const b = nodeOf(e.to);
              if (!a || !b) return null;
              const x1 = a.x + a.w, y1 = a.y + a.h / 2;
              const x2 = b.x,         y2 = b.y + b.h / 2;
              const mid = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#FF694A" strokeWidth="1.6" strokeLinecap="round" markerEnd="url(#lin-arrow)" opacity="0.75" />
                  {/* Particle traveling along the curve */}
                  <circle r="2.5" fill="#FF694A">
                    <animateMotion dur={`${2.0 + i * 0.18}s`} repeatCount="indefinite" path={d} />
                    <animate attributeName="opacity" values="0;1;1;0" dur={`${2.0 + i * 0.18}s`} repeatCount="indefinite" />
                  </circle>
                  {e.tests && (
                    <g transform={`translate(${mid - 38}, ${(y1 + y2) / 2 - 8})`}>
                      <rect width="76" height="14" rx="3" fill="#FF694A" />
                      <text x="38" y="10" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" letterSpacing="0.4">
                        {e.tests[0]}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Bronze nodes */}
            {lin.bronze.map((t, i) => (
              <g key={t} transform={`translate(${BX}, ${bronzeY(i)})`}>
                <rect width={COL_W} height={ROW_H} rx="4" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
                <text x="12" y="14" fontSize="9" fontWeight="800" fill="#826b3f" letterSpacing="1.4">BRONZE</text>
                <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{t}</text>
              </g>
            ))}

            {/* Silver nodes */}
            {lin.silver.map((t, i) => (
              <g key={t} transform={`translate(${MX}, ${silverY(i)})`}>
                <rect width={COL_W} height={ROW_H} rx="4" fill="#f3f4f6" stroke="#6b7280" strokeWidth="1" />
                <text x="12" y="14" fontSize="9" fontWeight="800" fill="#374151" letterSpacing="1.4">SILVER</text>
                <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{t}</text>
              </g>
            ))}

            {/* Gold node (selected) */}
            <g transform={`translate(${RX}, ${goldY})`}>
              <rect width={COL_W} height={ROW_H} rx="4" fill="#faf3e1" stroke="#b8975c" strokeWidth="2" filter="url(#alive-glow)" />
              <text x="12" y="14" fontSize="9" fontWeight="800" fill="#7a5e2d" letterSpacing="1.4">GOLD</text>
              <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{selected}</text>
            </g>
          </svg>
        </div>

        <div className="mt-4 flex items-center gap-4 text-[11px] text-[var(--ink-soft)] flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ background: '#FF694A' }} /> dbt transformation (auto-emitted)</span>
          <span>•</span>
          <span><strong className="text-[var(--ink-strong)]">{lin.edges.length}</strong> column-level edges traced</span>
          <span>•</span>
          <span><strong className="text-[var(--ink-strong)]">{lin.bronze.length + lin.silver.length + 1}</strong> dbt models in the lineage graph</span>
          <span>•</span>
          <span>Lineage runs at every build · zero manual upkeep</span>
        </div>
      </div>
    </section>
  );
}
