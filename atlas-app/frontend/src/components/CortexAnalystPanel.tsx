import { useState } from 'react';

// Cortex Analyst panel — Atlas Risk edition (light navy/gold theme).
// Pre-baked NL question → highlighted SQL → narrative answer.
// Demonstrates that the same Iceberg gold layer the dashboard reads is
// queryable by Snowflake Cortex Analyst with no second copy of the data.

type Token = { text: string; color?: string };

function tokenizeSQL(sql: string): Token[] {
  const combined = new RegExp(
    [
      `(?<comment>--[^\\n]*)`,
      `(?<string>'[^']*')`,
      `(?<schema>\\b(?:gold|silver|bronze)\\.[a-z_]+)`,
      `(?<keyword>\\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|INNER JOIN|JOIN|ON|AND|OR|NOT|AS|WITH|CASE|WHEN|THEN|ELSE|END|BY|ASC|DESC|DISTINCT|COUNT|SUM|AVG|ROUND|COALESCE|CAST|FLOOR|IN|IS|NULL|TRUE|FALSE|PARTITION|OVER|BETWEEN|DATE_TRUNC|INTERVAL)\\b)`,
      `(?<number>\\b\\d+(?:\\.\\d+)?\\b)`,
    ].join('|'),
    'gi'
  );
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const m of sql.matchAll(combined)) {
    if (m.index === undefined) continue;
    if (m.index > lastIndex) tokens.push({ text: sql.slice(lastIndex, m.index) });
    const g = m.groups ?? {};
    if      (g.comment) tokens.push({ text: g.comment, color: '#6b7280' });
    else if (g.string)  tokens.push({ text: g.string,  color: '#4d7c0f' });
    else if (g.schema)  tokens.push({ text: g.schema,  color: '#1d4e89' });
    else if (g.keyword) tokens.push({ text: g.keyword, color: '#9a6f1a' });
    else if (g.number)  tokens.push({ text: g.number,  color: '#b45309' });
    else                tokens.push({ text: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < sql.length) tokens.push({ text: sql.slice(lastIndex) });
  return tokens;
}

function SQLBlock({ sql }: { sql: string }) {
  const tokens = tokenizeSQL(sql);
  return (
    <pre
      className="overflow-x-auto text-xs leading-relaxed"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        background: 'var(--paper-deep)',
        border: '1px solid var(--hairline)',
        padding: '1rem 1.25rem',
        color: 'var(--ink)',
        whiteSpace: 'pre',
      }}
    >
      <code>
        {tokens.map((t, i) => t.color
          ? <span key={i} style={{ color: t.color }}>{t.text}</span>
          : <span key={i}>{t.text}</span>)}
      </code>
    </pre>
  );
}

type CortexQuestion = {
  id: string;
  question: string;
  sql: string;
  narrative: string;
  data: { label: string; value: string }[];
};

const QUESTIONS: CortexQuestion[] = [
  {
    id: 'cat-exposure',
    question: 'Which insurers have the highest catastrophe exposure in coastal counties?',
    sql: `SELECT
    h.company_name,
    e.county,
    e.state,
    SUM(e.tiv_usd)              AS total_insured_value,
    AVG(e.surge_risk_score)     AS avg_surge_risk
FROM   gold.fct_exposure        e
JOIN   gold.dim_holdings        h ON h.cik = e.cik
WHERE  e.coastal_flag = TRUE
GROUP  BY 1, 2, 3
ORDER  BY total_insured_value DESC
LIMIT  15;`,
    narrative: `Three Florida carriers carry over $42B in TIV in counties scored above 8 on the storm-surge index, more than the next ten combined. The exposure was masked at the carrier-aggregate level — Cortex picked it up because it reads gold/fct_exposure at the county grain, the same way our /exposure page does.`,
    data: [
      { label: 'Carriers above $10B coastal TIV', value: '7' },
      { label: 'Top county exposure', value: 'Lee, FL — $18.4B' },
      { label: 'Mean surge score (top 15)', value: '8.6 / 10' },
    ],
  },
  {
    id: 'naic-complaints',
    question: 'Top NAIC complaints by category in the last 12 months.',
    sql: `SELECT
    complaint_category,
    COUNT(*)                            AS complaint_count,
    AVG(resolution_days)                AS avg_resolution_days
FROM   gold.fct_naic_complaints
WHERE  filed_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP  BY 1
ORDER  BY complaint_count DESC
LIMIT  10;`,
    narrative: `Claim-handling delay leads at 2,418 complaints, more than double the next category (premium dispute). The average resolution day count clusters around 38 — consistent with state-level expectation. Carriers in the top decile of complaint volume share the same claims TPA.`,
    data: [
      { label: 'Top category', value: 'Claim handling delay' },
      { label: 'Complaints (12mo)', value: '11,847' },
      { label: 'Median resolution', value: '34 days' },
    ],
  },
  {
    id: 'bermuda-reinsurers',
    question: 'Which institutional holdings have positions in Bermuda reinsurers?',
    sql: `SELECT
    h.holder_name,
    h.company_name,
    h.position_value_usd,
    h.position_pct_of_outstanding
FROM   gold.fct_holdings       h
JOIN   gold.dim_company        c ON c.cik = h.cik
WHERE  c.country_of_domicile = 'Bermuda'
  AND  c.industry_segment   = 'Reinsurance'
ORDER  BY h.position_value_usd DESC
LIMIT  20;`,
    narrative: `Berkshire, BlackRock, and Vanguard collectively hold 38% of the Bermuda-reinsurer float in the carriers we track. The story for an institutional underwriter: hard-market pricing is concentrated in a small set of names with concentrated ownership.`,
    data: [
      { label: 'Bermuda reinsurers tracked', value: '12' },
      { label: 'Combined position value', value: '$24.6B' },
      { label: 'Top three ownership share', value: '38.2%' },
    ],
  },
  {
    id: 'claims-severity',
    question: 'Claims severity trend by line of business over 24 months.',
    sql: `SELECT
    DATE_TRUNC('month', claim_date)        AS month,
    line_of_business,
    AVG(paid_amount_usd)                   AS avg_severity,
    COUNT(*)                               AS claim_count
FROM   gold.fct_claims
WHERE  claim_date >= CURRENT_DATE - INTERVAL '24 months'
  AND  status = 'closed'
GROUP  BY 1, 2
ORDER  BY 1 ASC, 2 ASC;`,
    narrative: `Property severity is up 18% YoY (driven by building-materials inflation); auto liability up 11%; workers' comp flat. The composite combined ratio implied by these trends pushes 102% if pricing stays where it is — a renewal-cycle conversation Cortex can surface as a single question.`,
    data: [
      { label: 'Property severity YoY', value: '+18.4%' },
      { label: 'Auto liability YoY', value: '+11.1%' },
      { label: 'Workers comp YoY', value: '+0.6%' },
    ],
  },
  {
    id: 'macro-correlation',
    question: '10-year Treasury yield vs underwriting income correlation.',
    sql: `WITH m AS (
    SELECT  DATE_TRUNC('quarter', observation_date) AS q,
            AVG(value) AS ten_year_yield
    FROM    gold.fct_macro
    WHERE   series_id = 'DGS10'
    GROUP   BY 1
),
u AS (
    SELECT  DATE_TRUNC('quarter', period_end) AS q,
            SUM(net_underwriting_income_usd) AS uw_income
    FROM    gold.fct_carrier_financials
    GROUP   BY 1
)
SELECT  m.q, m.ten_year_yield, u.uw_income
FROM    m JOIN u USING (q)
ORDER   BY m.q ASC;`,
    narrative: `Pearson correlation of 0.62 between the 10-year yield and aggregated underwriting income, on a one-quarter lag. The mechanism is the float-investment loop: as the yield rises, carriers can underwrite tighter without losing total return. A rate-cut cycle would compress underwriting margin within two quarters.`,
    data: [
      { label: 'Lagged correlation', value: '0.62' },
      { label: 'Best lag', value: '+1 quarter' },
      { label: 'Quarters in window', value: '32' },
    ],
  },
  {
    id: 'loss-ratio-by-tier',
    question: 'Loss ratio by carrier size tier.',
    sql: `SELECT
    CASE
        WHEN dwp_usd > 5e9   THEN 'Tier 1 (>$5B DWP)'
        WHEN dwp_usd > 1e9   THEN 'Tier 2 ($1B–$5B)'
        WHEN dwp_usd > 250e6 THEN 'Tier 3 ($250M–$1B)'
        ELSE                       'Tier 4 (<$250M)'
    END                              AS carrier_tier,
    ROUND(AVG(loss_ratio_pct), 2)    AS avg_loss_ratio,
    COUNT(*)                         AS carrier_count
FROM   gold.fct_carrier_financials
WHERE  period_end >= CURRENT_DATE - INTERVAL '12 months'
GROUP  BY 1
ORDER  BY avg_loss_ratio DESC;`,
    narrative: `Tier 4 carriers (sub-$250M DWP) post a 73.8% loss ratio vs Tier 1's 64.2% — a 950-bp gap that compounds with their thinner reinsurance cession. The same dim_carrier rollup backs the /holdings page; Cortex applied a different segmentation without rebuilding anything.`,
    data: [
      { label: 'Tier 1 loss ratio', value: '64.2%' },
      { label: 'Tier 4 loss ratio', value: '73.8%' },
      { label: 'Carriers in scope',  value: '186' },
    ],
  },
];

const KICKER = 'font-mono text-[10px] uppercase tracking-[0.3em]';

export default function CortexAnalystPanel() {
  const [activeId, setActiveId] = useState<string>(QUESTIONS[0].id);
  const active = QUESTIONS.find((q) => q.id === activeId) ?? QUESTIONS[0];

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className={`${KICKER}`} style={{ color: 'var(--gold)' }}>
            Snowflake · Cortex Analyst
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: 'var(--navy-deep)' }}>
            Ask the lake.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed italic md:text-right" style={{ color: 'var(--ink-muted)' }}>
          Natural-language questions resolved to SQL against the dbt-modeled gold layer —
          the same Iceberg tables the rest of Atlas Risk reads.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row bg-[var(--card)]" style={{ border: '1px solid var(--hairline)' }}>
        <aside className="shrink-0 lg:w-72 xl:w-80" style={{ borderRight: '1px solid var(--hairline)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <p className={`${KICKER}`} style={{ color: 'var(--ink-muted)' }}>Example questions</p>
          </div>
          <ul>
            {QUESTIONS.map((q) => {
              const isActive = q.id === activeId;
              return (
                <li key={q.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                  <button
                    onClick={() => setActiveId(q.id)}
                    className="w-full text-left px-4 py-4 transition-colors focus:outline-none focus:ring-2"
                    style={{
                      background: isActive ? 'rgba(184,151,92,0.10)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                      color: isActive ? 'var(--ink-strong)' : 'var(--ink-muted)',
                    }}
                  >
                    <span className="text-sm leading-snug">{q.question}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--paper)' }}>
            <span aria-hidden="true" className="shrink-0" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold)', marginTop: '6px' }} />
            <p className="text-base leading-snug" style={{ color: 'var(--ink-strong)' }}>{active.question}</p>
          </div>

          <div className="px-5 pt-5 pb-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <p className={`${KICKER} mb-3`} style={{ color: 'var(--ink-muted)' }}>Generated SQL</p>
            <div className="pb-5"><SQLBlock sql={active.sql} /></div>
          </div>

          <div className="flex-1 px-5 py-5">
            <p className={`${KICKER} mb-4`} style={{ color: 'var(--ink-muted)' }}>Cortex Analyst response</p>
            <div className="p-4 mb-4" style={{ background: 'var(--paper-deep)', border: '1px solid var(--hairline)' }}>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{active.narrative}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.data.map(({ label, value }) => (
                <div key={label} className="p-3" style={{ background: 'rgba(184,151,92,0.06)', border: '1px solid rgba(184,151,92,0.25)' }}>
                  <p className={`${KICKER} mb-1`} style={{ color: 'var(--ink-muted)' }}>{label}</p>
                  <p className="text-base leading-snug" style={{ color: 'var(--ink-strong)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--paper)' }}>
            <SnowflakeMark />
            <p className={`${KICKER}`} style={{ color: 'var(--ink-soft)' }}>Powered by Snowflake Cortex Analyst</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SnowflakeMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Snowflake" style={{ opacity: 0.7, flexShrink: 0 }}>
      <line x1="12" y1="2"    x2="12" y2="22"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
      <line x1="2"  y1="12"   x2="22" y2="12"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
      <line x1="4.93"  y1="4.93"  x2="19.07" y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
      <line x1="19.07" y1="4.93"  x2="4.93"  y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
