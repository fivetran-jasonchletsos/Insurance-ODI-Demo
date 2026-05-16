// Catastrophe Exposure & Loss Geography
// CRO/CUO surface for the Atlas Risk demo.
//
// What this view answers, in priority order:
//   1) Where is our TIV book concentrated, and against what peril?
//   2) Is the 1-in-100 modeled PML in any one zone above appetite?
//   3) How is YTD loss ratio trending vs. plan and vs. peer cohort?
//   4) Are reinsurance attachment points still cost-efficient at the cat stack?
//
// We deliberately do NOT use real polygon shapefiles — those weigh ~30MB
// and the demo target is static snapshot mode. Instead each region is
// rendered as a colored radius-based heatmap circle whose area is proportional
// to TIV and whose color encodes the modeled loss ratio. Click-through
// surfaces the underwriting and reinsurance detail panel on the right.

import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { formatCurrencyShort, formatNumber, formatPercent } from '../api/queries';
import Sparkline from '../components/Sparkline';

// Default leaflet icons (kept for parity with other map pages in the app).
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Data model ─────────────────────────────────────────────────────────────

type Peril = 'hurricane' | 'flood' | 'wildfire' | 'earthquake' | 'severe-convective' | 'winter-storm';

interface Claim {
  id: string;
  peril: Peril;
  paid_usd: number;
  status: 'open' | 'closed' | 'reserved';
  reported: string;
}

interface CatRegion {
  region_id: string;
  zip: string;
  city: string;
  state: string;
  county: string;
  hu3_zone: string;          // hurricane Cat 3 surge zone label (synthetic but plausible)
  lat: number;
  lng: number;
  tiv_usd: number;           // total insured value
  policies_in_force: number;
  new_business_pif: number;  // NB policies issued YTD
  premium_written_usd: number;
  claims_paid_ytd_usd: number;
  loss_ratio: number;        // claims paid / premium written
  loss_ratio_target: number; // book target
  pml_1in100_usd: number;    // 1-in-100 modeled probable maximum loss
  attachment_usd: number;    // reinsurance attachment point at the regional level
  agents: number;            // appointed agents in region
  perils: { peril: Peril; share: number; modeled_pml_usd: number }[];
  recent_claims: Claim[];
}

// Deterministic pseudo-random for synthetic data — no Math.random().
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// Twelve regions across the US — heavy weight on coastal hurricane (FL/TX)
// and California EQ/wildfire, with a few inland convective and one
// nor'easter winter-storm zone. ZIP codes are real (so they geocode mentally)
// but all $ values are synthetic.
const REGIONS_SEED: Omit<
  CatRegion,
  | 'loss_ratio'
  | 'perils'
  | 'recent_claims'
  | 'pml_1in100_usd'
  | 'attachment_usd'
  | 'loss_ratio_target'
>[] = [
  { region_id: 'FL-MIA', zip: '33139', city: 'Miami Beach', state: 'FL', county: 'Miami-Dade', hu3_zone: 'HU3-A · Atlantic surge',  lat: 25.79, lng: -80.13, tiv_usd: 4_820_000_000, policies_in_force: 18_400, new_business_pif: 1_240, premium_written_usd: 78_400_000, claims_paid_ytd_usd: 41_200_000, agents: 142 },
  { region_id: 'FL-TPA', zip: '33606', city: 'Tampa',       state: 'FL', county: 'Hillsborough', hu3_zone: 'HU3-B · Gulf surge',     lat: 27.94, lng: -82.46, tiv_usd: 3_120_000_000, policies_in_force: 14_900, new_business_pif: 980,   premium_written_usd: 52_800_000, claims_paid_ytd_usd: 28_900_000, agents: 118 },
  { region_id: 'FL-JAX', zip: '32202', city: 'Jacksonville',state: 'FL', county: 'Duval',        hu3_zone: 'HU3-C · NE FL surge',    lat: 30.33, lng: -81.65, tiv_usd: 1_860_000_000, policies_in_force: 9_800,  new_business_pif: 720,   premium_written_usd: 27_400_000, claims_paid_ytd_usd: 10_900_000, agents:  82 },
  { region_id: 'TX-HOU', zip: '77002', city: 'Houston',     state: 'TX', county: 'Harris',       hu3_zone: 'HU3-D · TX coastal',     lat: 29.76, lng: -95.36, tiv_usd: 3_640_000_000, policies_in_force: 16_200, new_business_pif: 1_180, premium_written_usd: 61_800_000, claims_paid_ytd_usd: 33_400_000, agents: 134 },
  { region_id: 'TX-CRP', zip: '78401', city: 'Corpus Christi', state: 'TX', county: 'Nueces',    hu3_zone: 'HU3-E · S. TX coastal',  lat: 27.80, lng: -97.40, tiv_usd:   980_000_000, policies_in_force: 5_400,  new_business_pif: 410,   premium_written_usd: 17_200_000, claims_paid_ytd_usd:  9_800_000, agents:  46 },
  { region_id: 'LA-NOL', zip: '70112', city: 'New Orleans', state: 'LA', county: 'Orleans',      hu3_zone: 'HU3-F · LA delta',       lat: 29.95, lng: -90.07, tiv_usd: 1_420_000_000, policies_in_force: 7_100,  new_business_pif: 410,   premium_written_usd: 22_600_000, claims_paid_ytd_usd: 14_900_000, agents:  61 },
  { region_id: 'NC-OBX', zip: '27954', city: 'Outer Banks', state: 'NC', county: 'Dare',         hu3_zone: 'HU3-G · NC barrier',     lat: 35.92, lng: -75.67, tiv_usd:   620_000_000, policies_in_force: 3_200,  new_business_pif: 220,   premium_written_usd: 10_800_000, claims_paid_ytd_usd:  4_900_000, agents:  28 },
  { region_id: 'CA-LAX', zip: '90049', city: 'Los Angeles', state: 'CA', county: 'Los Angeles',  hu3_zone: 'EQ-1 · LA basin',        lat: 34.07, lng: -118.47, tiv_usd: 5_240_000_000, policies_in_force: 19_800, new_business_pif: 1_310, premium_written_usd: 84_200_000, claims_paid_ytd_usd: 30_200_000, agents: 156 },
  { region_id: 'CA-SFO', zip: '94109', city: 'San Francisco',state: 'CA', county: 'San Francisco',hu3_zone: 'EQ-2 · Bay Area',       lat: 37.79, lng: -122.42, tiv_usd: 3_980_000_000, policies_in_force: 14_200, new_business_pif: 980,   premium_written_usd: 64_400_000, claims_paid_ytd_usd: 19_800_000, agents: 121 },
  { region_id: 'CA-PAR', zip: '93215', city: 'Paradise',    state: 'CA', county: 'Butte',        hu3_zone: 'WF-1 · Sierra foothills', lat: 39.76, lng: -121.62, tiv_usd:   420_000_000, policies_in_force: 2_100,  new_business_pif:  90,   premium_written_usd:  7_400_000, claims_paid_ytd_usd:  6_900_000, agents:  19 },
  { region_id: 'OK-OKC', zip: '73102', city: 'Oklahoma City',state: 'OK', county: 'Oklahoma',    hu3_zone: 'SC-1 · Tornado alley',   lat: 35.47, lng: -97.52, tiv_usd:   880_000_000, policies_in_force: 5_800,  new_business_pif: 470,   premium_written_usd: 15_400_000, claims_paid_ytd_usd:  8_200_000, agents:  41 },
  { region_id: 'MA-BOS', zip: '02108', city: 'Boston',      state: 'MA', county: 'Suffolk',      hu3_zone: 'WS-1 · NE coastal',      lat: 42.36, lng: -71.06, tiv_usd: 2_180_000_000, policies_in_force: 11_400, new_business_pif: 810,   premium_written_usd: 34_800_000, claims_paid_ytd_usd: 10_400_000, agents:  94 },
];

// State → dominant peril, used to seed the peril mix realistically.
const STATE_DOMINANT_PERIL: Record<string, Peril> = {
  FL: 'hurricane',
  TX: 'hurricane',
  LA: 'hurricane',
  NC: 'hurricane',
  CA: 'earthquake',
  OK: 'severe-convective',
  MA: 'winter-storm',
};

const PERIL_LABEL: Record<Peril, string> = {
  hurricane: 'Hurricane / wind',
  flood: 'Flood / storm surge',
  wildfire: 'Wildfire',
  earthquake: 'Earthquake',
  'severe-convective': 'Severe convective (hail / tornado)',
  'winter-storm': 'Winter storm',
};

const PERIL_COLOR: Record<Peril, string> = {
  hurricane: '#0369a1',
  flood: '#0891b2',
  wildfire: '#c2410c',
  earthquake: '#7c2d12',
  'severe-convective': '#a16207',
  'winter-storm': '#475569',
};

function buildPerilMix(seed: string, dominant: Peril): { peril: Peril; share: number; modeled_pml_usd: number }[] {
  // Dominant ~ 0.55 share, then complementary perils filling the rest.
  const others: Peril[] = (['hurricane', 'flood', 'wildfire', 'earthquake', 'severe-convective', 'winter-storm'] as Peril[]).filter(
    (p) => p !== dominant,
  );
  // For coastal hurricane states, flood is always #2.
  let ordered: Peril[];
  if (dominant === 'hurricane') {
    ordered = [dominant, 'flood', 'severe-convective', 'winter-storm', 'wildfire'];
  } else if (dominant === 'earthquake') {
    ordered = [dominant, 'wildfire', 'severe-convective', 'flood', 'winter-storm'];
  } else {
    ordered = [dominant, ...others];
  }
  ordered = ordered.slice(0, 5);
  const baseShares = [0.55, 0.22, 0.12, 0.07, 0.04];
  return ordered.map((peril, i) => {
    const jitter = (hashStr(seed + peril) - 0.5) * 0.03;
    const share = Math.max(0.01, baseShares[i] + jitter);
    return { peril, share, modeled_pml_usd: 0 }; // PML filled in below
  });
}

function buildRecentClaims(seed: string, perils: Peril[]): Claim[] {
  const STATUSES: Claim['status'][] = ['open', 'closed', 'reserved'];
  return Array.from({ length: 5 }).map((_, i) => {
    const h = hashStr(seed + 'c' + i);
    const peril = perils[Math.floor(h * perils.length)];
    const paid = Math.round(60_000 + h * 1_840_000);
    const status = STATUSES[Math.floor(hashStr(seed + 'cs' + i) * 3)];
    // Synthetic but plausible dates in the last 90 days.
    const daysBack = Math.floor(hashStr(seed + 'cd' + i) * 90);
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    const reported = d.toISOString().slice(0, 10);
    return {
      id: `CLM-${seed}-${(i + 1).toString().padStart(3, '0')}`,
      peril,
      paid_usd: paid,
      status,
      reported,
    };
  });
}

// Build the enriched region rows once. Memo-safe at module scope (data is static).
const REGIONS: CatRegion[] = REGIONS_SEED.map((r) => {
  const dominant = STATE_DOMINANT_PERIL[r.state] ?? 'severe-convective';
  const mix = buildPerilMix(r.region_id, dominant);
  // 1-in-100 PML scales with TIV; coastal hurricanes peak higher than CA EQ
  // (frequency × severity skew). Multiplier band 0.045 – 0.085 of TIV.
  const pmlBase = dominant === 'hurricane' ? 0.078 : dominant === 'earthquake' ? 0.062 : dominant === 'wildfire' ? 0.085 : 0.048;
  const pmlJitter = (hashStr('pml:' + r.region_id) - 0.5) * 0.012;
  const pml = Math.round(r.tiv_usd * (pmlBase + pmlJitter));
  // Each peril's modeled PML is a share of the total PML (gross, before
  // diversification credit — internally we'd net these but for the demo
  // gross PML is the easier-to-explain story).
  const perils = mix.map((m) => ({ ...m, modeled_pml_usd: Math.round(pml * m.share) }));
  const loss_ratio = r.claims_paid_ytd_usd / r.premium_written_usd;
  // Loss-ratio target is industry standard 62% combined ex-LAE; for high-CAT
  // markets reinsurance lowers it but original target stays the same.
  const loss_ratio_target = 0.62;
  // Reinsurance attachment is set at ~3.5× expected annual loss
  // (a typical CAT XOL attachment); for high-risk hurricane it sits lower
  // since we cede more of the curve.
  const attachMul = dominant === 'hurricane' ? 0.42 : dominant === 'earthquake' ? 0.55 : 0.6;
  const attachment_usd = Math.round(pml * attachMul);
  return {
    ...r,
    perils,
    loss_ratio,
    loss_ratio_target,
    pml_1in100_usd: pml,
    attachment_usd,
    recent_claims: buildRecentClaims(r.region_id, perils.map((p) => p.peril)),
  };
});

// ─── Mode (what the heatmap encodes) ────────────────────────────────────────

type Mode = 'tiv' | 'loss-ratio' | 'pml';

const MODE_META: Record<Mode, { short: string; label: string; pick: (r: CatRegion) => number }> = {
  tiv:           { short: 'TIV',         label: 'Total Insured Value', pick: (r) => r.tiv_usd },
  'loss-ratio':  { short: 'Loss ratio',  label: 'Loss ratio YTD',      pick: (r) => r.loss_ratio },
  pml:           { short: 'PML 1:100',   label: 'PML 1-in-100',        pick: (r) => r.pml_1in100_usd },
};

// Cooler at low concentrations, hotter at high. Avoid pure red unless
// the metric truly warrants it (loss ratio > target).
const RAMP = ['#dbeafe', '#bfdbfe', '#fde68a', '#fb923c', '#b91c1c'];

function quantile(vals: number[], q: number): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

// ─── Page component ─────────────────────────────────────────────────────────

export default function CatastropheExposurePage() {
  const [mode, setMode] = useState<Mode>('tiv');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const tiv = REGIONS.reduce((s, r) => s + r.tiv_usd, 0);
    const premium = REGIONS.reduce((s, r) => s + r.premium_written_usd, 0);
    const claims = REGIONS.reduce((s, r) => s + r.claims_paid_ytd_usd, 0);
    const pml = REGIONS.reduce((s, r) => s + r.pml_1in100_usd, 0);
    const pif = REGIONS.reduce((s, r) => s + r.policies_in_force, 0);
    const newBiz = REGIONS.reduce((s, r) => s + r.new_business_pif, 0);
    const reinsRecovery = REGIONS.reduce((s, r) => s + Math.max(0, r.claims_paid_ytd_usd - r.attachment_usd * 0.4), 0);
    return { tiv, premium, claims, pml, pif, newBiz, lossRatio: claims / premium, reinsRecovery };
  }, []);

  const breakpoints = useMemo(() => {
    const vals = REGIONS.map(MODE_META[mode].pick);
    return [0.2, 0.4, 0.6, 0.8].map((q) => quantile(vals, q));
  }, [mode]);

  const bucketIndex = (v: number) =>
    v < breakpoints[0] ? 0 : v < breakpoints[1] ? 1 : v < breakpoints[2] ? 2 : v < breakpoints[3] ? 3 : 4;

  const colorFor = (r: CatRegion) => RAMP[bucketIndex(MODE_META[mode].pick(r))];

  // Radius is always scaled by TIV — the "size = value at stake" intuition
  // shouldn't change with the mode (color does the lifting instead).
  const maxTiv = Math.max(1, ...REGIONS.map((r) => r.tiv_usd));
  const radiusFor = (r: CatRegion) => 18 + 46 * Math.sqrt(r.tiv_usd / maxTiv);

  const selected = selectedId ? REGIONS.find((r) => r.region_id === selectedId) ?? null : null;

  // For peer percentile inside the panel: where does this region rank?
  const selectedPercentile = useMemo(() => {
    if (!selected) return 0;
    const v = MODE_META[mode].pick(selected);
    const below = REGIONS.filter((r) => MODE_META[mode].pick(r) < v).length;
    return Math.round((below / REGIONS.length) * 100);
  }, [selected, mode]);

  // The narrative: top concentration region as % of book TIV.
  const topByTiv = useMemo(() => [...REGIONS].sort((a, b) => b.tiv_usd - a.tiv_usd)[0], []);
  const flConcentration = useMemo(() => {
    const flTiv = REGIONS.filter((r) => r.state === 'FL').reduce((s, r) => s + r.tiv_usd, 0);
    return flTiv / totals.tiv;
  }, [totals.tiv]);

  // Net reinsurance recovery upside the CRO can quote.
  const reinsLever = useMemo(() => {
    // Simple lever: a 3% increase in CAT XOL cession lowers PML retained by 3%.
    return totals.pml * 0.03;
  }, [totals.pml]);

  return (
    <div className="bg-[var(--paper-deep)] min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="eyebrow mb-1">Catastrophe Exposure · Loss Geography</div>
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-[var(--ink-strong)] tracking-tight">
              Where the book is &mdash; and what could break it
            </h1>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-2xl">
              {REGIONS.length} regions across hurricane, EQ, wildfire, and severe-convective zones.
              Click any region to drill into its peril mix, modeled PML, and reinsurance attachment.
            </p>
          </div>
          <ModePills mode={mode} setMode={setMode} />
        </div>

        {/* Cortex narrative */}
        <NarrativeCard
          eyebrow="Cortex · concentration brief"
          story={
            <>
              Coastal Florida TIV is{' '}
              <span className="font-mono tabular text-[var(--bear)]">
                {(flConcentration * 100).toFixed(0)}%
              </span>{' '}
              of the book vs. an 8% appetite ceiling. Largest single exposure:{' '}
              <span className="font-mono">{topByTiv.city}, {topByTiv.state}</span> ({formatCurrencyShort(topByTiv.tiv_usd)} TIV,
              1-in-100 PML{' '}
              <span className="font-mono tabular text-[var(--bear)]">{formatCurrencyShort(topByTiv.pml_1in100_usd)}</span>).
              A 3-point increase in CAT XOL cession would lower retained PML by{' '}
              <span className="font-mono tabular text-[var(--bull)]">{formatCurrencyShort(reinsLever)}</span>.
            </>
          }
          highlight={{ label: 'Cession lever · retained PML cut', value: formatCurrencyShort(reinsLever) }}
        />

        {/* KPI strip — 4 tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="TIV book"
            value={formatCurrencyShort(totals.tiv)}
            sub={`${formatNumber(totals.pif)} policies · ${REGIONS.length} regions`}
            peerPosition={62}
            peerBenchmark="Median $24.6B · Top Q $42.0B"
            dollarLever="Each 5% TIV growth lifts NWP by ≈ $9.4M at current rate"
          />
          <KpiTile
            label="Annual PML · 1-in-100"
            value={formatCurrencyShort(totals.pml)}
            sub={`${((totals.pml / totals.tiv) * 100).toFixed(1)}% of TIV gross`}
            peerPosition={38}
            peerBenchmark="Median 5.4% · Top Q 3.8%"
            tone="bear"
            dollarLever="Above appetite ceiling of 5.0% of TIV — cede more to lower"
          />
          <KpiTile
            label="Loss ratio YTD"
            value={(totals.lossRatio * 100).toFixed(1) + '%'}
            sub={`Target 62.0% · ${totals.lossRatio > 0.62 ? 'over' : 'under'}`}
            peerPosition={totals.lossRatio > 0.62 ? 28 : 71}
            peerBenchmark="Median 63.4% · Top Q 54.2%"
            tone={totals.lossRatio > 0.62 ? 'bear' : 'bull'}
            dollarLever="Every 1 pt of loss ratio = $3.6M underwriting income"
          />
          <KpiTile
            label="Reinsurance recovery"
            value={formatCurrencyShort(totals.reinsRecovery)}
            sub="ceded losses recouped YTD"
            peerPosition={74}
            peerBenchmark="Median 14% of paid · Top Q 28%"
            tone="bull"
            highlight
            dollarLever="CAT XOL + quota share — 2.4× expected recovery vs. plan"
          />
        </div>

        {/* 60/40 layout: heatmap + intelligence panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* LEFT — heatmap (60%) */}
          <div className="lg:col-span-3 research-card overflow-hidden">
            <header className="research-card-header flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="eyebrow">Peril intensity heatmap</div>
                <div className="font-serif text-base font-semibold text-[var(--ink-strong)]">
                  {selected ? (
                    <>{selected.city}, {selected.state}{' '}
                      <span className="text-[var(--ink-soft)] font-normal text-sm">· {selected.hu3_zone}</span>
                    </>
                  ) : (
                    <>National book{' '}
                      <span className="text-[var(--ink-soft)] font-normal text-sm">· {MODE_META[mode].label}</span>
                    </>
                  )}
                </div>
              </div>
              {selected && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="rounded-sm border border-[var(--hairline)] bg-white hover:bg-[var(--paper-deep)] text-[var(--ink)] text-xs font-medium px-3 py-1.5"
                >
                  ← Back to all regions
                </button>
              )}
            </header>

            <div className="relative" style={{ height: 480 }}>
              <MapContainer
                center={[37.5, -96]}
                zoom={4}
                minZoom={3}
                scrollWheelZoom
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={18}
                />
                <FitOnEnter selected={selected} />

                {REGIONS.map((r) => {
                  // Soft outer "heat halo" — gives the radius-based intensity feel
                  // without the weight of a real density raster.
                  return (
                    <CircleMarker
                      key={r.region_id + '-halo'}
                      center={[r.lat, r.lng]}
                      radius={radiusFor(r) + 8}
                      pathOptions={{
                        color: 'transparent',
                        weight: 0,
                        fillColor: colorFor(r),
                        fillOpacity: 0.18,
                      }}
                      interactive={false}
                    >
                      {/* Halo is non-interactive; click handler lives on the inner circle */}
                    </CircleMarker>
                  );
                })}

                {REGIONS.map((r) => {
                  const isSel = selectedId === r.region_id;
                  return (
                    <CircleMarker
                      key={r.region_id}
                      center={[r.lat, r.lng]}
                      radius={radiusFor(r)}
                      pathOptions={{
                        color: isSel ? '#0b1220' : '#0b2545',
                        weight: isSel ? 1.6 : 0.6,
                        fillColor: colorFor(r),
                        fillOpacity: isSel ? 0.92 : 0.72,
                      }}
                      eventHandlers={{ click: () => setSelectedId(r.region_id) }}
                    >
                      <Tooltip
                        direction="top"
                        offset={[0, -radiusFor(r) - 2]}
                        opacity={1}
                        className="cat-region-tooltip"
                      >
                        <div className="text-[11px] leading-tight">
                          <div className="font-mono text-[var(--ink-soft)]">{r.zip} · {r.hu3_zone}</div>
                          <div className="font-serif font-semibold text-[var(--ink-strong)]">{r.city}, {r.state}</div>
                          <div className="mt-1 tabular">
                            <span className="text-[var(--ink-muted)]">TIV </span>
                            <span className="font-semibold text-[var(--ink-strong)]">{formatCurrencyShort(r.tiv_usd)}</span>
                            <span className="text-[var(--ink-muted)]"> · PML </span>
                            <span className="font-semibold text-[var(--ink-strong)]">{formatCurrencyShort(r.pml_1in100_usd)}</span>
                          </div>
                          <div className="tabular text-[var(--ink-muted)]">
                            Loss ratio{' '}
                            <span className="font-semibold" style={{ color: r.loss_ratio > r.loss_ratio_target ? 'var(--bear)' : 'var(--bull)' }}>
                              {(r.loss_ratio * 100).toFixed(1)}%
                            </span>{' '}
                            vs. target {(r.loss_ratio_target * 100).toFixed(0)}%
                          </div>
                          <div className="mt-1 text-[10px] text-[var(--gold-dim)] font-semibold">Click to drill in →</div>
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              <style>{`
                .leaflet-tooltip.cat-region-tooltip {
                  background: #ffffff;
                  border: 1px solid var(--hairline);
                  box-shadow: 0 6px 24px rgba(11, 37, 69, 0.08);
                  border-radius: 4px;
                  padding: 8px 10px;
                  color: var(--ink-strong);
                  white-space: normal;
                  max-width: 240px;
                }
                .leaflet-tooltip.cat-region-tooltip:before { display: none; }
              `}</style>
            </div>

            {/* Color ramp legend */}
            <div className="px-4 py-3 border-t border-[var(--hairline-soft)] bg-[var(--paper-deep)]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">
                  {MODE_META[mode].label} · quintile bands
                </div>
                <div className="text-[10px] text-[var(--ink-soft)] tabular">
                  Bubble size = TIV · color = {MODE_META[mode].short.toLowerCase()}
                </div>
              </div>
              <div className="flex items-stretch gap-0.5 text-[10px] tabular">
                {RAMP.map((color, i) => {
                  const lo = i === 0 ? null : breakpoints[i - 1];
                  const hi = i === 4 ? null : breakpoints[i];
                  const fmt = (v: number) =>
                    mode === 'loss-ratio'
                      ? `${(v * 100).toFixed(0)}%`
                      : formatCurrencyShort(v);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-stretch">
                      <div className="h-3 rounded-sm" style={{ background: color }} />
                      <div className="mt-1 text-center text-[var(--ink-muted)] tabular">
                        {lo === null ? '< ' : `${fmt(lo)} – `}
                        {hi === null ? `${fmt(breakpoints[3])}+` : fmt(hi)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT — intelligence panel (40%) */}
          <div className="lg:col-span-2">
            {selected ? (
              <RegionDetailPanel
                region={selected}
                percentile={selectedPercentile}
                mode={mode}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <RegionLeaderboard
                regions={REGIONS}
                mode={mode}
                onPick={(id) => setSelectedId(id)}
              />
            )}
          </div>
        </div>

        {/* Cat Stack — layered reinsurance towers */}
        <CatStackPanel totals={totals} />

        {/* Provenance strip */}
        <ProvenanceStrip />
      </div>
    </div>
  );
}

// ─── KPI tile (local, matches Atlas Risk design system) ─────────────────────

function KpiTile({
  label,
  value,
  sub,
  peerPosition,
  peerBenchmark,
  dollarLever,
  tone,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  peerPosition: number;
  peerBenchmark: string;
  dollarLever: string;
  tone?: 'bull' | 'bear';
  highlight?: boolean;
}) {
  const valueColor = tone === 'bear' ? 'var(--bear)' : tone === 'bull' ? 'var(--bull)' : 'var(--ink-strong)';
  return (
    <div
      className="research-card p-4 sm:p-5 relative overflow-hidden"
      style={
        highlight
          ? { borderColor: 'var(--gold)', background: 'linear-gradient(180deg, #ffffff 0%, var(--gold-bg) 240%)' }
          : undefined
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-soft)] leading-tight">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <div className="font-serif text-[30px] sm:text-[34px] font-semibold leading-none tabular" style={{ color: valueColor }}>
          {value}
        </div>
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--ink-soft)] tabular">{sub}</div>}
      <div className="mt-3.5">
        <PeerBand position={peerPosition} />
        <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular">
          <span>Bottom Q</span>
          <span className="font-mono">{peerBenchmark}</span>
          <span>Top Q</span>
        </div>
      </div>
      <div className="mt-3 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 px-4 sm:px-5 py-2.5 border-t border-[var(--hairline-soft)] bg-[var(--paper-deep)] text-[11px] leading-snug text-[var(--ink-muted)]">
        <span className="font-semibold text-[var(--gold-dim)]">$ Lever ·</span> {dollarLever}
      </div>
    </div>
  );
}

// ─── Peer percentile band ───────────────────────────────────────────────────

function PeerBand({ position }: { position: number }) {
  const p = Math.max(0, Math.min(100, position));
  return (
    <div className="relative" style={{ height: 20 }}>
      <div className="absolute left-0 right-0 rounded-full overflow-hidden border border-[var(--hairline)] flex" style={{ top: 6, height: 8 }}>
        <div style={{ flex: 25, background: 'var(--bear-bg)' }} />
        <div style={{ flex: 50, background: 'var(--caution-bg)' }} />
        <div style={{ flex: 25, background: 'var(--bull-bg)' }} />
      </div>
      <div className="absolute" style={{ left: `calc(${p}% - 6px)`, top: 0, width: 12, height: 20 }}>
        <div className="absolute left-1/2 -translate-x-1/2 rounded-sm" style={{ top: 2, width: 3, height: 16, background: 'var(--ink-strong)' }} />
      </div>
    </div>
  );
}

// ─── Narrative card (Cortex auto-summary) ───────────────────────────────────

function NarrativeCard({ eyebrow, story, highlight }: { eyebrow: string; story: React.ReactNode; highlight?: { label: string; value: string } }) {
  return (
    <div
      className="rounded-md border p-5 sm:p-6 relative overflow-hidden"
      style={{ borderColor: 'var(--gold)', background: 'linear-gradient(135deg, #ffffff 0%, var(--gold-bg) 180%)' }}
    >
      <div className="absolute right-4 top-4 text-[10px] font-mono uppercase tracking-wider text-[var(--gold-dim)] flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--gold)] animate-pulse" />
        Cortex narrative · auto
      </div>
      <div className="eyebrow mb-2">{eyebrow}</div>
      <div className="font-serif text-lg sm:text-xl leading-snug text-[var(--ink-strong)] max-w-3xl">{story}</div>
      {highlight && (
        <div className="mt-4 inline-flex items-baseline gap-2.5 rounded-md border border-[var(--hairline)] bg-white px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">{highlight.label}</span>
          <span className="font-serif text-2xl font-semibold tabular" style={{ color: 'var(--bull)' }}>{highlight.value}</span>
        </div>
      )}
    </div>
  );
}

// ─── Region detail panel (right side, when a region is selected) ────────────

function RegionDetailPanel({
  region,
  percentile,
  mode,
  onClose,
}: {
  region: CatRegion;
  percentile: number;
  mode: Mode;
  onClose: () => void;
}) {
  const overTarget = region.loss_ratio > region.loss_ratio_target;
  const attachmentBreached = region.claims_paid_ytd_usd > region.attachment_usd;
  return (
    <div className="research-card overflow-hidden">
      <header className="research-card-header flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Region intelligence</div>
          <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-[var(--ink-soft)] text-xs">{region.zip}</span>
            <span className="font-serif text-xl font-semibold text-[var(--ink-strong)] tracking-tight">
              {region.city}, {region.state}
            </span>
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5">{region.hu3_zone} · {region.county} County</div>
        </div>
        <button onClick={onClose} className="text-[var(--ink-soft)] hover:text-[var(--ink-strong)] text-lg leading-none p-1" aria-label="Close panel">
          ×
        </button>
      </header>

      <div className="p-5 space-y-5">
        {/* Mini stats */}
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="TIV" value={formatCurrencyShort(region.tiv_usd)} />
          <MiniStat label="Policies in force" value={formatNumber(region.policies_in_force)} />
          <MiniStat
            label="Loss ratio YTD"
            value={`${(region.loss_ratio * 100).toFixed(1)}%`}
            tone={overTarget ? 'bear' : 'bull'}
          />
          <MiniStat
            label="PML 1-in-100"
            value={formatCurrencyShort(region.pml_1in100_usd)}
            tone="bear"
          />
        </div>

        {/* Peer percentile */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">
              Vs. other regions · {MODE_META[mode].label}
            </div>
            <div className="text-[11px] font-mono tabular text-[var(--ink-strong)] font-semibold">p{percentile}</div>
          </div>
          <PeerBand position={percentile} />
          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular">
            <span>Lower quartile</span>
            <span>Median</span>
            <span>Top quartile</span>
          </div>
        </div>

        {/* Top 5 perils */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-2">
            Top perils · modeled PML mix
          </div>
          <ul className="space-y-1.5">
            {region.perils.map((p, i) => {
              const max = region.perils[0].share;
              const pct = max === 0 ? 0 : p.share / max;
              return (
                <li key={p.peril} className="text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--ink-strong)] truncate">
                      <span className="font-mono text-[var(--ink-soft)] mr-1.5">{i + 1}.</span>
                      {PERIL_LABEL[p.peril]}
                    </span>
                    <span className="font-mono tabular text-[var(--ink-muted)] shrink-0">
                      {(p.share * 100).toFixed(0)}% · {formatCurrencyShort(p.modeled_pml_usd)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-[var(--paper-deep)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: PERIL_COLOR[p.peril], opacity: 0.85 }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Reinsurance attachment */}
        <div
          className="rounded-md border px-3.5 py-3"
          style={{
            borderColor: attachmentBreached ? 'var(--bear)' : 'var(--gold)',
            background: attachmentBreached ? 'var(--bear-bg)' : 'var(--gold-bg)',
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: attachmentBreached ? 'var(--bear)' : 'var(--gold-dim)' }}>
              CAT XOL attachment · regional
            </div>
            <div className="font-serif text-2xl font-semibold tabular" style={{ color: attachmentBreached ? 'var(--bear)' : 'var(--ink-strong)' }}>
              {formatCurrencyShort(region.attachment_usd)}
            </div>
          </div>
          <div className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">
            YTD paid {formatCurrencyShort(region.claims_paid_ytd_usd)} ·{' '}
            {attachmentBreached
              ? 'above attachment — recoverable from reinsurers'
              : `${formatCurrencyShort(region.attachment_usd - region.claims_paid_ytd_usd)} of retention remaining`}
          </div>
        </div>

        {/* Underwriting / distribution mini */}
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="New biz PIF" value={formatNumber(region.new_business_pif)} />
          <MiniStat label="Agents" value={formatNumber(region.agents)} />
          <MiniStat label="PIF / agent" value={(region.policies_in_force / region.agents).toFixed(0)} />
        </div>

        {/* Recent claims */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-2">
            Recent claims · trailing 90 days
          </div>
          <ul className="divide-y divide-[var(--hairline-soft)] border border-[var(--hairline-soft)] rounded-sm overflow-hidden bg-white">
            {region.recent_claims.map((c) => (
              <li key={c.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-mono text-[var(--ink-strong)]">{c.id}</div>
                  <div className="text-[var(--ink-soft)] text-[11px]">
                    {PERIL_LABEL[c.peril]} · {c.reported}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono tabular font-semibold text-[var(--ink-strong)]">{formatCurrencyShort(c.paid_usd)}</div>
                  <div className={`text-[10px] uppercase tracking-wider font-semibold ${c.status === 'open' ? 'text-[var(--bear)]' : c.status === 'reserved' ? 'text-[var(--caution)]' : 'text-[var(--bull)]'}`}>
                    {c.status}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'bull' | 'bear' | 'caution' }) {
  const color = tone === 'bear' ? 'var(--bear)' : tone === 'bull' ? 'var(--bull)' : tone === 'caution' ? 'var(--caution)' : 'var(--ink-strong)';
  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-white px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">{label}</div>
      <div className="mt-1 font-serif text-lg font-semibold tabular" style={{ color }}>{value}</div>
    </div>
  );
}

// ─── Leaderboard (default state, right panel) ───────────────────────────────

function RegionLeaderboard({ regions, mode, onPick }: { regions: CatRegion[]; mode: Mode; onPick: (id: string) => void }) {
  const items = useMemo(
    () => [...regions].sort((a, b) => MODE_META[mode].pick(b) - MODE_META[mode].pick(a)).slice(0, 6),
    [regions, mode],
  );
  const fmt = (r: CatRegion) =>
    mode === 'loss-ratio' ? `${(r.loss_ratio * 100).toFixed(1)}%` : formatCurrencyShort(MODE_META[mode].pick(r));
  const max = Math.max(1, ...items.map(MODE_META[mode].pick));

  // Sparkline = monthly TIV-weighted incurred (synthetic, deterministic).
  const trailingSpark = (id: string) => {
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      out.push(0.45 + (hashStr(id + 'spark' + i) - 0.5) * 0.3);
    }
    return out;
  };

  return (
    <div className="research-card overflow-hidden">
      <header className="research-card-header">
        <div className="eyebrow">Region intelligence · default</div>
        <div className="mt-0.5 font-serif text-lg font-semibold text-[var(--ink-strong)]">
          Top regions by {MODE_META[mode].short.toLowerCase()}
        </div>
        <div className="text-xs text-[var(--ink-muted)] mt-0.5">
          Click any row, or any region on the map, to open underwriting + reinsurance detail.
        </div>
      </header>
      <ol className="divide-y divide-[var(--hairline-soft)]">
        {items.map((r, i) => {
          const pct = MODE_META[mode].pick(r) / max;
          return (
            <li key={r.region_id}>
              <button onClick={() => onPick(r.region_id)} className="w-full text-left px-5 py-3.5 hover:bg-[var(--paper-deep)] transition-colors">
                <div className="flex items-baseline gap-3">
                  <div className="font-serif text-2xl text-[var(--ink-soft)] tabular leading-none w-6 text-right shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <div>
                        <span className="font-mono text-xs text-[var(--ink-soft)] mr-2">{r.zip}</span>
                        <span className="font-serif text-base font-semibold text-[var(--ink-strong)]">{r.city}, {r.state}</span>
                      </div>
                      <div className="font-mono tabular text-sm font-semibold text-[var(--ink-strong)]">{fmt(r)}</div>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[var(--paper-deep)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: 'var(--gold)', opacity: 0.85 }} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular gap-2">
                      <span>
                        TIV {formatCurrencyShort(r.tiv_usd)} · {formatNumber(r.policies_in_force)} PIF
                      </span>
                      <span className="flex items-center gap-2">
                        <Sparkline values={trailingSpark(r.region_id)} width={64} height={16} stroke="var(--gold-dim)" />
                        <span style={{ color: r.loss_ratio > r.loss_ratio_target ? 'var(--bear)' : 'var(--bull)' }}>
                          LR {(r.loss_ratio * 100).toFixed(0)}%
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Cat Stack — layered reinsurance towers ─────────────────────────────────
// Industry-standard visualization:
//   Net retention (bottom) → Quota share → CAT XOL layers → ILW (top).
// Each layer has limit + attachment; we annotate cost-on-line and where
// modeled PML lands within the stack.

interface CatLayer {
  name: string;
  attachment: number;
  limit: number;
  rol: number;          // rate-on-line as decimal, e.g. 0.072
  reinsurers: string;
  color: string;
}

function buildCatStack(totalPml: number, totalPremium: number): CatLayer[] {
  // Stack sized off PML so the layers tell a story across the whole book.
  const retention = Math.round(totalPremium * 0.20);                      // net retention
  const qsLimit   = Math.round(totalPremium * 0.30);                      // 30% quota share
  const xol1      = Math.round(totalPml * 0.25);
  const xol2      = Math.round(totalPml * 0.30);
  const xol3      = Math.round(totalPml * 0.20);
  const ilw       = Math.round(totalPml * 0.10);
  let stack = 0;
  const layers: CatLayer[] = [];
  layers.push({ name: 'Net retention', attachment: 0, limit: retention, rol: 0, reinsurers: 'Atlas Risk balance sheet', color: '#0b2545' });
  stack += retention;
  layers.push({ name: 'Quota share · 30%', attachment: stack, limit: qsLimit, rol: 0.048, reinsurers: 'Munich Re · Swiss Re · Hannover Re', color: '#1d4e89' });
  stack += qsLimit;
  layers.push({ name: 'CAT XOL · Layer 1', attachment: stack, limit: xol1, rol: 0.088, reinsurers: 'Lloyd\'s syndicates · Berkshire Hathaway Re', color: '#b8975c' });
  stack += xol1;
  layers.push({ name: 'CAT XOL · Layer 2', attachment: stack, limit: xol2, rol: 0.064, reinsurers: 'Renaissance Re · Everest · SCOR', color: '#d4af75' });
  stack += xol2;
  layers.push({ name: 'CAT XOL · Layer 3', attachment: stack, limit: xol3, rol: 0.042, reinsurers: 'Arch Capital · Lloyd\'s Cat consortium', color: '#dec176' });
  stack += xol3;
  layers.push({ name: 'Industry Loss Warrant', attachment: stack, limit: ilw, rol: 0.028, reinsurers: 'ILS funds · sidecar capacity', color: '#ebd9a3' });
  return layers;
}

function CatStackPanel({ totals }: { totals: { pml: number; premium: number; lossRatio: number } & Record<string, number> }) {
  const layers = useMemo(() => buildCatStack(totals.pml, totals.premium), [totals.pml, totals.premium]);
  const top = layers[layers.length - 1].attachment + layers[layers.length - 1].limit;
  // Where the modeled 1-in-100 PML sits inside the stack:
  const pmlPositionPct = Math.min(100, (totals.pml / top) * 100);
  const totalCost = layers.reduce((s, l) => s + l.rol * l.limit, 0);

  return (
    <div className="research-card overflow-hidden">
      <header className="research-card-header flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow">Cat stack · reinsurance towers</div>
          <div className="font-serif text-base font-semibold text-[var(--ink-strong)]">
            Layered protection vs. modeled 1-in-100 PML
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5">
            Each layer absorbs losses above its attachment point up to its limit. Cost-on-line shown by layer.
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">Total stack premium</div>
          <div className="font-serif text-2xl font-semibold text-[var(--ink-strong)] tabular">{formatCurrencyShort(totalCost)}</div>
          <div className="text-[11px] text-[var(--ink-muted)] tabular">{((totalCost / totals.premium) * 100).toFixed(1)}% of GWP</div>
        </div>
      </header>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tower visualization */}
        <div className="lg:col-span-5">
          <div className="relative h-[360px] flex flex-col-reverse rounded-sm overflow-hidden border border-[var(--hairline)] bg-[var(--paper)]">
            {layers.map((l, i) => {
              const heightPct = (l.limit / top) * 100;
              return (
                <div
                  key={l.name}
                  className="relative flex items-center justify-between gap-2 px-3 border-t border-white/40"
                  style={{ height: `${heightPct}%`, background: l.color, minHeight: 28 }}
                >
                  <div className="text-[11px] font-semibold text-white truncate" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                    {l.name}
                  </div>
                  <div className="text-[10px] font-mono text-white/90 tabular shrink-0" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                    {formatCurrencyShort(l.limit)}
                  </div>
                  {/* Layer index dot, left edge */}
                  <div className="absolute -left-0 top-1/2 -translate-y-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-white border-2 flex items-center justify-center text-[10px] font-bold" style={{ borderColor: l.color, color: l.color }}>
                    {i + 1}
                  </div>
                </div>
              );
            })}
            {/* 1-in-100 PML line */}
            <div
              className="absolute left-0 right-0 z-10 pointer-events-none"
              style={{ bottom: `${pmlPositionPct}%` }}
            >
              <div className="border-t-2 border-dashed border-[var(--bear)]" />
              <div className="absolute -top-5 right-1 text-[10px] font-mono font-semibold text-[var(--bear)] bg-white px-1.5 rounded-sm border border-[var(--bear)] tabular">
                1-in-100 PML · {formatCurrencyShort(totals.pml)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-[var(--ink-soft)] flex items-center justify-between tabular">
            <span>Stack base · $0</span>
            <span>Top · {formatCurrencyShort(top)}</span>
          </div>
        </div>

        {/* Layer detail table */}
        <div className="lg:col-span-7">
          <div className="rounded-sm border border-[var(--hairline)] bg-white overflow-hidden">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] px-3 py-2 bg-[var(--paper-deep)] border-b border-[var(--hairline)]">
              <div className="col-span-4">Layer</div>
              <div className="col-span-3 text-right">Attachment</div>
              <div className="col-span-2 text-right">Limit</div>
              <div className="col-span-2 text-right">RoL</div>
              <div className="col-span-1 text-right">Premium</div>
            </div>
            <ul className="divide-y divide-[var(--hairline-soft)]">
              {layers.map((l) => {
                const premium = l.rol * l.limit;
                const pmlBreachesThisLayer = totals.pml >= l.attachment && totals.pml < l.attachment + l.limit;
                return (
                  <li key={l.name} className={`grid grid-cols-12 items-center text-[11px] px-3 py-2 ${pmlBreachesThisLayer ? 'bg-[var(--bear-bg)]' : ''}`}>
                    <div className="col-span-4 min-w-0 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--ink-strong)] truncate">{l.name}</div>
                        <div className="text-[10px] text-[var(--ink-soft)] truncate">{l.reinsurers}</div>
                      </div>
                    </div>
                    <div className="col-span-3 text-right font-mono tabular">{formatCurrencyShort(l.attachment)}</div>
                    <div className="col-span-2 text-right font-mono tabular">{formatCurrencyShort(l.limit)}</div>
                    <div className="col-span-2 text-right font-mono tabular">{l.rol === 0 ? '—' : `${(l.rol * 100).toFixed(1)}%`}</div>
                    <div className="col-span-1 text-right font-mono tabular font-semibold">{premium === 0 ? '—' : formatCurrencyShort(premium)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-3 text-[11px] text-[var(--ink-muted)] leading-relaxed">
            Modeled 1-in-100 PML of <span className="font-mono font-semibold text-[var(--bear)]">{formatCurrencyShort(totals.pml)}</span>{' '}
            lands inside the CAT XOL stack — well above net retention and quota share, fully ceded to traditional and
            ILS markets. Top layer (Industry Loss Warrant) acts as the back-stop against a tail event.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Provenance strip ───────────────────────────────────────────────────────

function ProvenanceStrip() {
  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-white px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
      <div className="flex items-center gap-2 font-mono tabular">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--bull)] animate-pulse" />
        <span className="text-[var(--ink-soft)]">Iceberg gold · live</span>
        <span className="text-[var(--ink-strong)] font-semibold">6 min ago</span>
      </div>
      <span className="text-[var(--hairline)]">│</span>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-4 px-1 rounded text-[9px] font-bold text-white" style={{ background: '#0073FF' }}>F</span>
        <span className="text-[var(--ink-muted)]">NAIC · NOAA Storm Events · OpenFEMA NFIP · policy admin CDC</span>
      </div>
      <span className="text-[var(--hairline)]">│</span>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-4 px-1 rounded text-[9px] font-bold text-white" style={{ background: '#FF694A' }}>dbt</span>
        <span className="text-[var(--ink-muted)]">cat_exposure_region · gold layer · 12 regions · 1 PML rollup</span>
      </div>
      <span className="ml-auto text-[10px] text-[var(--ink-soft)] tabular">Synthetic demo data · plausible at current carrier mix</span>
    </div>
  );
}

// ─── Mode pills ─────────────────────────────────────────────────────────────

function ModePills({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-sm border border-[var(--hairline)] bg-white">
      {(Object.keys(MODE_META) as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${
              active ? 'text-white' : 'text-[var(--ink-muted)] hover:text-[var(--ink-strong)] hover:bg-[var(--paper-deep)]'
            }`}
            style={active ? { background: 'var(--navy-deep)' } : undefined}
            aria-pressed={active}
          >
            {MODE_META[m].short}
          </button>
        );
      })}
    </div>
  );
}

// ─── Map: fit-bounds on selected change ─────────────────────────────────────

function FitOnEnter({ selected }: { selected: CatRegion | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) {
      map.flyTo([selected.lat, selected.lng], 7, { duration: 0.8 });
    } else {
      const bounds = L.latLngBounds(REGIONS.map((r) => [r.lat, r.lng] as [number, number]));
      map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 5, duration: 0.8 });
    }
  }, [selected?.region_id, map]);
  return null;
}

// Quiet down unused-helper warnings during HMR — formatPercent is exposed
// for future use in narrative tweaks.
void formatPercent;
