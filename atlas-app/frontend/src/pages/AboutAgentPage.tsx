import { useNavigate } from 'react-router-dom';

const INTENTS = [
  {
    name: 'rising_claims',
    label: 'Rising claims',
    pattern: '/(rising|increas|jump|spike).+(claim|nfip)/i',
    example: 'Carriers with rising claims',
    body: 'Ranks carriers by claim velocity. Elevated flow is a leading indicator of adverse development and reserve strengthening.',
  },
  {
    name: 'premium_growth',
    label: 'Premium growth',
    pattern: '/(growth|premium|prem|grow)/i',
    example: 'Top 10 by direct written premium growth',
    body: 'Sorts the carrier universe by trailing-twelve-month direct written premium growth YoY. Highest-momentum books rise to the top.',
  },
  {
    name: 'cat_exposure',
    label: 'Catastrophe exposure',
    pattern: '/(cat|storm|hurricane|flood|wildfire)/i',
    example: 'Property carriers with high cat exposure',
    body: 'Filters to property/wind/flood lines and sorts by composite risk score — the carriers most exposed to a 1-in-100 wind or flood event.',
  },
  {
    name: 'reinsurance_events',
    label: 'Reinsurance treaty cadence',
    pattern: '/(treaty|reinsurance|cession|cede)/i',
    example: 'Carriers with most treaty filings',
    body: 'Ranks by NAIC reinsurance filing count over the trailing twelve months. Heavy cession activity often signals book restructuring.',
  },
  {
    name: 'risk_score',
    label: 'Composite risk score',
    pattern: '/(risk|highest.+risk|risky|loss ratio)/i',
    example: 'Highest risk score in commercial property',
    body: 'Ranks the universe by Verity Insurance\'s composite risk score, blending loss-ratio trend, claim velocity, cat-event proximity, and reserve adequacy.',
  },
  {
    name: 'line_filter',
    label: 'Line-of-business filter',
    pattern: 'Matches any LoB name',
    example: 'Show me Commercial Auto carriers',
    body: 'Detects a line-of-business reference (Property, Commercial Auto, Workers Comp, etc.) and returns members sorted by direct written premium.',
  },
];

export default function AboutAgentPage() {
  const navigate = useNavigate();
  return (
    <div>
      <section className="bg-[var(--navy-deep)] text-white border-b-4 border-[var(--gold)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14">
          <div className="inline-flex items-center gap-2 rounded-sm bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: 'var(--gold-bright)' }}>
            Underwriting Copilot
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
            Skip the BI tool. Ask the book.
          </h1>
          <p className="mt-5 text-lg text-white/75 max-w-2xl leading-relaxed">
            A natural-language layer on top of the same gold-layer tables the rest of the demo uses.
            Type a question — get back a ranked table, a short summary, and clickable rows that open
            the carrier file.
          </p>
          <button
            onClick={() => navigate('/agent')}
            className="mt-8 inline-flex items-center gap-2 rounded-sm px-6 py-3 text-base font-semibold shadow-lg"
            style={{ background: 'var(--gold)', color: 'var(--navy-deep)' }}
          >
            Open the agent <span aria-hidden>→</span>
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mb-3">How it works</h2>
        <div className="space-y-4 text-[var(--ink)] leading-relaxed">
          <p>
            The agent runs entirely client-side over the published JSON snapshot of the gold-layer
            Iceberg tables. A small intent classifier recognizes six patterns over the question, then
            executes the matching aggregation in your browser.
          </p>
          <p>
            No backend, no API key required for the rules tier. Flip the <em>Ask Claude</em> toggle and
            paste a key for richer reasoning over the same snapshot summary — Claude sees only the
            aggregated JSON, never raw rows.
          </p>
        </div>

        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mt-12 mb-4">The six rule-based intents</h2>
        <div className="space-y-3">
          {INTENTS.map((it) => (
            <article key={it.name} className="research-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-semibold text-[var(--ink-strong)]">{it.label}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{it.body}</p>
                </div>
                <span className="layer-chip gold shrink-0">{it.name}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)] mb-1">Pattern</div>
                  <code className="font-mono text-[11px] bg-[var(--paper-deep)] px-2 py-1 rounded border border-[var(--hairline)] inline-block">{it.pattern}</code>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)] mb-1">Try</div>
                  <button
                    onClick={() => navigate(`/agent?q=${encodeURIComponent(it.example)}`)}
                    className="text-[var(--gold-dim)] hover:text-[var(--ink-strong)] font-medium"
                  >
                    "{it.example}" →
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mt-12 mb-3">Claude mode</h2>
        <p className="text-[var(--ink)] leading-relaxed">
          When enabled, questions are sent to Claude with a structured summary of the snapshot
          (totals by sector, market-cap aggregates, risk-bucket histogram). The system prompt
          casts Claude as a senior Verity Insurance underwriter — measured tone, no hype, no invented numbers.
          The API key lives only in your browser's localStorage under{' '}
          <code className="font-mono text-xs bg-[var(--paper-deep)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">verity-odi:anthropic-api-key</code>.
        </p>
      </section>
    </div>
  );
}
