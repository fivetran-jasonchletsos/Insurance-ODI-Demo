// Related-claims similarity engine — Verity Insurance
//
// Computes a top-K nearest-neighbor list for each claim using tag-vector
// overlap (Jaccard) with domain weights. Mirrors what an embedding
// pipeline would produce in production; the math runs locally so the static
// site can ship the network without a runtime API.
//
// Weight hierarchy (high to low):
//   LOB (product)       1.6   — line of business is the strongest signal
//   Peril (issue)       1.4   — peril type is nearly as strong
//   Geography (state)   0.8   — same state = shared regulatory / cat exposure
//   Severity band       0.6   — sub_product proxy for size / complexity
//   Fraud signals       1.0   — topic_cluster overlap (fraud/SIU tags)

import type { Complaint } from '../types';

export interface ClaimNeighbor {
  id: string;           // complaint_id
  claim: Complaint;
  score: number;        // 0..1 normalized
  why: string;          // human-readable reason
  sharedLob: string[];
  sharedPeril: string[];
  sharedFraud: string[];
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------
const W_LOB    = 1.6;
const W_PERIL  = 1.4;
const W_GEO    = 0.8;
const W_SEV    = 0.6;
const W_FRAUD  = 1.0;
const W_MAX    = W_LOB + W_PERIL + W_GEO + W_SEV + W_FRAUD; // 5.4

export const K = 8; // neighbors per claim

// ---------------------------------------------------------------------------
// Helpers — lift Complaint scalar fields into tag arrays for Jaccard
// ---------------------------------------------------------------------------

function lobTags(c: Complaint): string[] {
  return c.product ? [c.product] : [];
}

function perilTags(c: Complaint): string[] {
  const tags: string[] = [];
  if (c.issue) tags.push(c.issue);
  if (c.sub_issue) tags.push(c.sub_issue);
  return tags;
}

function geoTags(c: Complaint): string[] {
  return c.state ? [c.state] : [];
}

function sevTags(c: Complaint): string[] {
  // sub_product is the best severity-band / claimant-profile proxy available
  return c.sub_product ? [c.sub_product] : [];
}

function fraudTags(c: Complaint): string[] {
  // topic_cluster acts as the fraud-signal / SIU-referral tag
  return c.topic_cluster ? [c.topic_cluster] : [];
}

// ---------------------------------------------------------------------------
// Jaccard
// ---------------------------------------------------------------------------
function jaccard(a: string[], b: string[]): { score: number; shared: string[] } {
  if (a.length === 0 || b.length === 0) return { score: 0, shared: [] };
  const setA = new Set(a);
  const shared = b.filter((x) => setA.has(x));
  const union = new Set([...a, ...b]).size;
  return { score: shared.length / union, shared };
}

// ---------------------------------------------------------------------------
// Pairwise score
// ---------------------------------------------------------------------------
function pairScore(
  a: Complaint,
  b: Complaint,
): {
  score: number;
  sharedLob: string[];
  sharedPeril: string[];
  sharedFraud: string[];
  geoMatch: boolean;
  sevMatch: boolean;
} {
  const lob   = jaccard(lobTags(a),   lobTags(b));
  const peril = jaccard(perilTags(a), perilTags(b));
  const geo   = jaccard(geoTags(a),   geoTags(b));
  const sev   = jaccard(sevTags(a),   sevTags(b));
  const fraud = jaccard(fraudTags(a), fraudTags(b));

  const raw =
    W_LOB   * lob.score +
    W_PERIL * peril.score +
    W_GEO   * geo.score +
    W_SEV   * sev.score +
    W_FRAUD * fraud.score;

  return {
    score:       raw / W_MAX,
    sharedLob:   lob.shared,
    sharedPeril: peril.shared,
    sharedFraud: fraud.shared,
    geoMatch:    geo.score > 0,
    sevMatch:    sev.score > 0,
  };
}

// ---------------------------------------------------------------------------
// "Why related" copy
// ---------------------------------------------------------------------------
function whyCopy(
  s: { sharedLob: string[]; sharedPeril: string[]; sharedFraud: string[]; geoMatch: boolean; sevMatch: boolean },
  _a: Complaint,
  b: Complaint,
): string {
  if (s.sharedFraud.length > 0 && s.sharedLob.length > 0) {
    return `Same LOB + fraud signal: ${s.sharedFraud[0]}`;
  }
  if (s.sharedPeril.length >= 2) {
    return `Shared peril: ${s.sharedPeril.slice(0, 2).join(', ')}`;
  }
  if (s.sharedPeril.length === 1) {
    return `Same peril: ${s.sharedPeril[0]}`;
  }
  if (s.sharedLob.length > 0 && s.geoMatch) {
    return `Same LOB and state (${b.state ?? 'unknown'})`;
  }
  if (s.sharedLob.length > 0) {
    return `Same line of business: ${s.sharedLob[0]}`;
  }
  if (s.geoMatch && s.sevMatch) {
    return `Same state and severity band`;
  }
  if (s.geoMatch) {
    return `Same geography (${b.state ?? 'unknown'})`;
  }
  if (s.sharedFraud.length > 0) {
    return `Shared fraud signal: ${s.sharedFraud[0]}`;
  }
  return 'Adjacent risk profile';
}

// ---------------------------------------------------------------------------
// Top-K cache
// ---------------------------------------------------------------------------
let _cache: Map<string, ClaimNeighbor[]> | null = null;
let _claims: Complaint[] | null = null;

function build(claims: Complaint[]): Map<string, ClaimNeighbor[]> {
  const result = new Map<string, ClaimNeighbor[]>();

  for (let i = 0; i < claims.length; i++) {
    const a = claims[i];

    const scored: (ClaimNeighbor & { _raw: number })[] = [];

    for (let j = 0; j < claims.length; j++) {
      if (i === j) continue;
      const b = claims[j];
      const s = pairScore(a, b);
      if (s.score <= 0) continue;
      scored.push({
        id:          b.complaint_id,
        claim:       b,
        score:       s.score,
        why:         whyCopy(s, a, b),
        sharedLob:   s.sharedLob,
        sharedPeril: s.sharedPeril,
        sharedFraud: s.sharedFraud,
        _raw:        s.score,
      });
    }

    scored.sort((x, y) => y._raw - x._raw);

    const final: ClaimNeighbor[] = scored.slice(0, K).map((n) => ({
      id:          n.id,
      claim:       n.claim,
      score:       n.score,
      why:         n.why,
      sharedLob:   n.sharedLob,
      sharedPeril: n.sharedPeril,
      sharedFraud: n.sharedFraud,
    }));

    result.set(a.complaint_id, final);
  }

  return result;
}

export function primeCache(claims: Complaint[]): void {
  _claims = claims;
  _cache  = build(claims);
}

export function relatedFor(claimId: string): ClaimNeighbor[] {
  if (!_cache) return [];
  return _cache.get(claimId) ?? [];
}

export function allClaims(): Complaint[] {
  return _claims ?? [];
}

// ---------------------------------------------------------------------------
// Graph representation for force-directed viz
// ---------------------------------------------------------------------------
export interface GraphNode {
  id: string;     // complaint_id
  lob: string;    // product
  peril: string;  // issue
  state: string;
  fraud: string;  // topic_cluster
}

export interface GraphEdge {
  source: string;
  target: string;
  score: number;
}

export function buildGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (!_cache || !_claims) return { nodes: [], edges: [] };

  const nodes: GraphNode[] = _claims.map((c) => ({
    id:    c.complaint_id,
    lob:   c.product ?? '',
    peril: c.issue ?? '',
    state: c.state ?? '',
    fraud: c.topic_cluster ?? '',
  }));

  // Build undirected edges: union of all top-K lists, deduplicate by sorted pair
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const [srcId, neighbors] of _cache.entries()) {
    for (const nb of neighbors) {
      const key = [srcId, nb.id].sort().join('||');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: srcId, target: nb.id, score: nb.score });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Color by LOB for the canvas viz
// ---------------------------------------------------------------------------
const LOB_COLORS: Record<string, string> = {
  'Property':         '#0369a1', // sky blue
  'Personal Auto':    '#0f766e', // teal
  'Commercial Auto':  '#15803d', // green
  'Workers Comp':     '#b45309', // amber
  'Commercial Multi': '#7c3aed', // violet
  'Specialty':        '#b91c1c', // red
  'Life':             '#0b2545', // navy
  'Health':           '#065f46', // emerald
};

export function lobColor(lob: string): string {
  return LOB_COLORS[lob] ?? '#6b7280';
}
