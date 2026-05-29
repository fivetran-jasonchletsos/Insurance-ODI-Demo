/*
 * VerityScenarioPage — Scenario framing page for the dbt-wizard demo.
 *
 * Route: /scenario
 *
 * Shows the VP of Claims Analytics question, a T-minus countdown to the
 * Reserves Committee meeting, 4-tile KPI grid, upstream-model panel,
 * state-of-world detail, 6-step build path, and a CTA to launch the Live Build.
 *
 * Ported from Healthcare-EPIC-Snowflake-Demo/ClarityScenarioPage.tsx — Insurance-flavored.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { wizardDataUrl } from '../components/wizardTypes';

interface UpstreamModel {
  model: string;
  layer: string;
  grain: string;
  description: string;
}

interface ScenarioData {
  company: string;
  request_id: string;
  requested_by: string;
  timezone_label: string;
  question: string;
  metric_label: string;
  metric_code: string;
  sop_meeting_label: string;
  hospital_system: string;
  service_line: string;
  target_schema: string;
  target_model: string;
  target_grain: string;
  prior_crisis_id: string;
  upstream_models: UpstreamModel[];
  manual_time_days: string;
  build_room_seconds: number;
}

function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `T-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function VerityScenarioPage() {
  const [s, setS] = useState<ScenarioData | null>(null);
  const [tMinus, setTMinus] = useState('T-12:00:00');

  useEffect(() => {
    fetch(wizardDataUrl('scenario.json'))
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load scenario.json: ${r.status}`);
        return r.json();
      })
      .then(setS)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let remaining = 12 * 3600; // 12-hour countdown to Reserves Committee
    const id = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      setTMinus(formatCountdown(remaining));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!s) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 font-mono text-sm text-[var(--ink-muted)]">
        Loading scenario...
      </div>
    );
  }

  const LAYER_COLOR: Record<string, string> = {
    staging:    'var(--clinical-violet, #7c3aed)',
    intermediate: '#b45309',
    'marts/dim': '#7c3aed',
    gold:       'var(--clinical-teal, #0d9488)',
    gap:        'var(--color-danger, #dc2626)',
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span
            className="status-pill alert inline-flex items-center gap-1.5"
            style={{ fontSize: 12, padding: '4px 10px', fontWeight: 700 }}
          >
            <span className="h-2 w-2 rounded-full bg-[var(--gold)] animate-pulse" />
            Gap · Active
          </span>
          <span className="eyebrow">{s.request_id}</span>
          <span className="eyebrow">Follows {s.prior_crisis_id}</span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl font-semibold leading-[1.05] text-[var(--ink-strong)] tracking-tight">
          {s.timezone_label}.{' '}
          <span style={{ color: 'var(--gold-dim)' }}>{s.requested_by}.</span>
        </h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-lg text-[var(--ink-muted)]">
          No <span className="font-mono text-sm">gold.fct_cat_wind_severity_by_tier_region_daily</span> exists.
          The tier-2 commercial wind reserve gap is unresolved.
          Reserves Committee meets in 12 hours. Manual build ETA: {s.manual_time_days}.
          dbt-wizard ETA: {s.build_room_seconds} seconds.
        </p>

        {/* Question highlight */}
        <div
          className="mt-5 rounded-lg border border-[var(--hairline)] p-5"
          style={{ borderLeft: '4px solid var(--gold)', background: 'rgba(184,151,92,0.05)' }}
        >
          <div className="eyebrow mb-2" style={{ color: 'var(--gold-dim)' }}>The question</div>
          <p className="font-serif text-2xl font-semibold leading-tight text-[var(--ink-strong)]">
            "{s.question}"
          </p>
        </div>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <KpiTile
          label="Reserves Committee"
          value={tMinus}
          unit={s.sop_meeting_label}
          tone="var(--gold)"
        />
        <KpiTile
          label="Metric requested"
          value="NEW"
          unit={s.metric_label}
          tone="var(--gold)"
        />
        <KpiTile
          label="Manual ETA"
          value={s.manual_time_days}
          unit="data engineering"
          tone="var(--navy-deep)"
        />
        <KpiTile
          label="dbt-wizard ETA"
          value={`${s.build_room_seconds}s`}
          unit="four sub-agents"
          tone="var(--clinical-teal, #0d9488)"
        />
      </div>

      {/* Upstream models + state of world */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        <div className="lg:col-span-2 rounded-lg border border-[var(--hairline)] bg-white p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="eyebrow">Upstream models available</div>
              <div className="font-serif text-xl font-semibold mt-1 text-[var(--ink-strong)]">
                Four signals. Already in the lake.
              </div>
            </div>
            <span
              className="status-pill healthy inline-flex items-center gap-1.5"
              style={{ fontSize: 11 }}
            >
              4 of 4
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {s.upstream_models.map(u => (
              <div
                key={u.model}
                className="rounded-md border border-[var(--hairline)] bg-[var(--paper-deep)] p-4 relative"
              >
                <div
                  className="absolute top-0 left-0 h-full w-1 rounded-l-md"
                  style={{ background: LAYER_COLOR[u.layer] ?? '#0d9488' }}
                />
                <div className="font-mono text-xs pl-1" style={{ color: LAYER_COLOR[u.layer] ?? '#0d9488' }}>
                  {u.layer}
                </div>
                <div className="font-mono text-sm font-semibold mt-1 pl-1 text-[var(--ink-strong)]">{u.model}</div>
                <div className="font-mono text-[11px] mt-1 pl-1 text-[var(--ink-muted)]">grain · {u.grain}</div>
                <p className="text-xs mt-2 pl-1 leading-relaxed text-[var(--ink-muted)]">{u.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--hairline)] bg-white p-5 shadow-sm">
          <div className="eyebrow mb-3">State of the world</div>
          <dl className="space-y-3 text-sm">
            <Row k="Question requested by" v={s.requested_by} />
            <Row k="Requested at" v={<span className="font-mono">{s.timezone_label}</span>} />
            <Row k="Company" v={s.company} />
            <Row k="Exposure segment" v={s.service_line} />
            <Row k="Target schema" v={<span className="font-mono">{s.target_schema}</span>} />
            <Row k="Target model" v={<span className="font-mono text-xs">{s.target_model}</span>} />
            <Row k="Target grain" v={<span className="font-mono text-xs">{s.target_grain}</span>} />
            <Row k="Lookback window" v={<span className="font-mono">trailing 90 days</span>} />
            <Row k="Prior incident" v={<span className="font-mono">{s.prior_crisis_id}</span>} />
            <Row
              k="Committee next"
              v={
                <span className="font-mono" style={{ color: 'var(--gold-dim)' }}>
                  {s.sop_meeting_label}
                </span>
              }
            />
          </dl>
        </div>
      </div>

      {/* 6-step build path */}
      <div
        className="rounded-lg border border-[var(--hairline)] bg-white p-5 mb-8 shadow-sm"
        style={{ borderLeft: '4px solid var(--clinical-teal, #0d9488)' }}
      >
        <div className="eyebrow mb-2" style={{ color: 'var(--clinical-teal, #0d9488)' }}>The path through six steps</div>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="font-mono text-xs shrink-0 mt-0.5" style={{ color: step.color }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <div className="font-semibold text-[var(--ink-strong)]">{step.title}</div>
                <div className="text-xs font-mono text-[var(--ink-muted)]">
                  {step.who} · {step.tools}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between rounded-lg border border-[var(--hairline)] bg-white p-5 shadow-sm">
        <div>
          <div className="font-serif text-2xl font-semibold text-[var(--ink-strong)]">
            Ready to open the Live Build?
          </div>
          <div className="text-sm mt-1 text-[var(--ink-muted)]">
            Four sub-agents will be paged. The new model gets written character-by-character on screen.
          </div>
        </div>
        <Link
          to="/wizard-live"
          state={{ question: s.question }}
          className="inline-flex items-center gap-2 rounded-md text-white font-semibold px-6 py-4 whitespace-nowrap hover:opacity-95 transition-opacity"
          style={{ background: 'var(--clinical-teal, #0d9488)' }}
        >
          Open the Live Build
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

const STEPS = [
  { title: 'Discovery',             who: 'Explorer',     tools: 'status, search',        color: 'var(--clinical-teal, #0d9488)' },
  { title: 'Schema Understanding',  who: 'Summary',      tools: 'describe, lineage',     color: '#7c3aed' },
  { title: 'Data Inspection',       who: 'Worker',       tools: 'warehouse, dbt_show',   color: '#be185d' },
  { title: 'Model Creation',        who: 'Worker',       tools: 'file edits, model gen', color: '#be185d' },
  { title: 'Test Authoring',        who: 'Verification', tools: 'describe, dbt_show',    color: '#145e36' },
  { title: 'Materialization',       who: 'Worker + Ver', tools: 'dbt_run, lineage',      color: '#145e36' },
];

function KpiTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-lg border border-[var(--hairline)] bg-white p-5 shadow-sm relative overflow-hidden"
      style={{ borderLeft: `4px solid ${tone}` }}
    >
      <div className="eyebrow mb-2">{label}</div>
      <div
        className="font-serif text-3xl font-semibold tracking-tight tabular"
        style={{ color: tone }}
      >
        {value}
      </div>
      <div className="text-xs mt-2 font-mono text-[var(--ink-soft)]">{unit}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="font-mono text-xs text-[var(--ink-muted)]">{k}</dt>
      <dd className="text-right text-[var(--ink-strong)]">{v}</dd>
    </div>
  );
}

import React from 'react';
