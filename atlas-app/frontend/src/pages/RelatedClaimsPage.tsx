"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/queries';
import {
  primeCache,
  buildGraph,
  lobColor,
  relatedFor,
  type GraphNode,
  type GraphEdge,
} from '../lib/related';

// ---------------------------------------------------------------------------
// Force simulation — no external library
// ---------------------------------------------------------------------------
type Vec2 = { x: number; y: number };

function runSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  onTick: (positions: Vec2[], alpha: number) => void,
  onDone: (positions: Vec2[]) => void,
): () => void {
  const n = nodes.length;
  const pos: Vec2[] = nodes.map(() => ({
    x: width / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.5,
    y: height / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.5,
  }));
  const vel: Vec2[] = nodes.map(() => ({ x: 0, y: 0 }));

  const idToIdx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const adjMap = new Map<string, { target: number; score: number }[]>();
  for (const e of edges) {
    const si = idToIdx.get(e.source);
    const ti = idToIdx.get(e.target);
    if (si == null || ti == null) continue;
    if (!adjMap.has(e.source)) adjMap.set(e.source, []);
    if (!adjMap.has(e.target)) adjMap.set(e.target, []);
    adjMap.get(e.source)!.push({ target: ti, score: e.score });
    adjMap.get(e.target)!.push({ target: si, score: e.score });
  }

  const REPEL    = 3200;
  const SPRING_K = 0.04;
  const REST_LEN = 120;
  const CENTER_G = 0.009;
  const DAMP     = 0.82;

  let alpha = 1.0;
  let frame = 0;
  let rafId: number;

  function tick() {
    alpha *= 0.992;
    const cx = width / 2;
    const cy = height / 2;

    for (let i = 0; i < n; i++) {
      let fx = 0;
      let fy = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist2 = dx * dx + dy * dy + 1;
        const dist  = Math.sqrt(dist2);
        const str   = REPEL / dist2;
        fx += (dx / dist) * str;
        fy += (dy / dist) * str;
      }

      const nbrs = adjMap.get(nodes[i].id) ?? [];
      for (const { target: j, score } of nbrs) {
        const dx      = pos[j].x - pos[i].x;
        const dy      = pos[j].y - pos[i].y;
        const dist    = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const stretch = dist - REST_LEN * (1 - score * 0.3);
        fx += (dx / dist) * SPRING_K * stretch;
        fy += (dy / dist) * SPRING_K * stretch;
      }

      fx += (cx - pos[i].x) * CENTER_G;
      fy += (cy - pos[i].y) * CENTER_G;

      vel[i].x = (vel[i].x + fx * alpha) * DAMP;
      vel[i].y = (vel[i].y + fy * alpha) * DAMP;
      pos[i].x = Math.max(20, Math.min(width  - 20, pos[i].x + vel[i].x));
      pos[i].y = Math.max(20, Math.min(height - 20, pos[i].y + vel[i].y));
    }

    frame++;
    if (frame % 4 === 0) onTick([...pos.map((p) => ({ ...p }))], alpha);

    if (alpha > 0.01 && frame < 600) {
      rafId = requestAnimationFrame(tick);
    } else {
      onDone([...pos.map((p) => ({ ...p }))]);
    }
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

// ---------------------------------------------------------------------------
// Canvas renderer
// ---------------------------------------------------------------------------
const NODE_R     = 6;
const NODE_R_SEL = 11;
const NODE_R_HOV = 9;

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  positions: Vec2[],
  idToIdx: Map<string, number>,
  selectedId: string | null,
  hoveredId: string | null,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0b2545';
  ctx.fillRect(0, 0, W, H);

  // Edges
  for (const e of edges) {
    const si = idToIdx.get(e.source);
    const ti = idToIdx.get(e.target);
    if (si == null || ti == null) continue;
    const sp = positions[si];
    const tp = positions[ti];
    if (!sp || !tp) continue;

    const highlighted =
      e.source === selectedId || e.target === selectedId ||
      e.source === hoveredId  || e.target === hoveredId;

    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(tp.x, tp.y);
    if (highlighted) {
      ctx.strokeStyle = `rgba(212,175,117,${0.25 + e.score * 0.45})`;
      ctx.lineWidth   = 1 + e.score * 1.5;
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${0.02 + e.score * 0.06})`;
      ctx.lineWidth   = 0.4 + e.score * 0.7;
    }
    ctx.stroke();
  }

  const specialIds = new Set([selectedId, hoveredId].filter(Boolean));

  const drawNode = (node: GraphNode, i: number) => {
    const p = positions[i];
    if (!p) return;
    const isSel = node.id === selectedId;
    const isHov = node.id === hoveredId;
    const r     = isSel ? NODE_R_SEL : isHov ? NODE_R_HOV : NODE_R;
    const color = lobColor(node.lob);

    if (isSel) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(184,151,92,0.2)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = isSel
      ? '#d4af75'
      : isHov
      ? 'rgba(255,255,255,0.7)'
      : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.stroke();

    if (isSel || isHov) {
      const label = node.id.length > 16 ? node.id.slice(0, 14) + '…' : node.id;
      ctx.font      = `600 10px 'JetBrains Mono', monospace`;
      ctx.fillStyle = isSel ? '#d4af75' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(label, p.x, p.y + r + 13);
      ctx.font      = `9px 'JetBrains Mono', monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(node.lob, p.x, p.y + r + 24);
    }
  };

  nodes.forEach((node, i) => { if (!specialIds.has(node.id)) drawNode(node, i); });
  nodes.forEach((node, i) => { if (specialIds.has(node.id)) drawNode(node, i); });
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function RelatedClaimsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef    = useRef<Vec2[]>([]);
  const rafRef    = useRef<number>(0);

  const [positions, setPositions] = useState<Vec2[]>([]);
  const [simDone,   setSimDone]   = useState(false);
  const [ready,     setReady]     = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [transform,  setTransform]  = useState({ x: 0, y: 0, scale: 1 });
  const dragging = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);

  const [size, setSize] = useState({ w: 900, h: 640 });

  // Load claims and prime the cache
  useEffect(() => {
    api.getComplaints().then((r) => {
      primeCache(r.complaints);
      setReady(true);
    });
  }, []);

  const { nodes, edges } = useMemo(
    () => (ready ? buildGraph() : { nodes: [], edges: [] }),
    [ready],
  );
  const idToIdx = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);

  // Canvas resize
  useEffect(() => {
    function measure() {
      const el = canvasRef.current?.parentElement;
      if (el) setSize({ w: el.clientWidth, h: Math.min(el.clientWidth * 0.7, 660) });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Run simulation
  useEffect(() => {
    if (!ready || nodes.length === 0 || size.w < 100) return;
    setSimDone(false);
    const cleanup = runSimulation(
      nodes, edges, size.w, size.h,
      (pos) => { posRef.current = pos; setPositions([...pos]); },
      (pos) => { posRef.current = pos; setPositions([...pos]); setSimDone(true); },
    );
    return cleanup;
  }, [ready, nodes, edges, size.w, size.h]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || posRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    canvas.width         = size.w * dpr;
    canvas.height        = size.h * dpr;
    canvas.style.width   = `${size.w}px`;
    canvas.style.height  = `${size.h}px`;
    ctx.scale(dpr, dpr);

    cancelAnimationFrame(rafRef.current);

    function frame() {
      if (!ctx) return;
      const logW = canvas!.width  / dpr;
      const logH = canvas!.height / dpr;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0b2545';
      ctx.fillRect(0, 0, logW, logH);
      ctx.translate(transform.x + logW / 2, transform.y + logH / 2);
      ctx.scale(transform.scale, transform.scale);
      ctx.translate(-logW / 2, -logH / 2);
      drawGraph(ctx, nodes, edges, posRef.current, idToIdx, selectedId, hoveredId);
      ctx.restore();
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [positions, selectedId, hoveredId, transform, size, nodes, edges, idToIdx]);

  // Pointer helpers
  function toCanvas(clientX: number, clientY: number, canvas: HTMLCanvasElement): Vec2 {
    const rect = canvas.getBoundingClientRect();
    const lx   = clientX - rect.left;
    const ly   = clientY - rect.top;
    const cx   = size.w / 2;
    const cy   = size.h / 2;
    return {
      x: (lx - cx - transform.x) / transform.scale + cx,
      y: (ly - cy - transform.y) / transform.scale + cy,
    };
  }

  function nearestNode(cx: number, cy: number): GraphNode | null {
    let best: GraphNode | null = null;
    let bestDist = 22;
    posRef.current.forEach((p, i) => {
      if (!p) return;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bestDist) { bestDist = d; best = nodes[i]; }
    });
    return best;
  }

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging.current) {
      const dx = e.clientX - dragging.current.startX;
      const dy = e.clientY - dragging.current.startY;
      setTransform((t) => ({ ...t, x: dragging.current!.tx + dx, y: dragging.current!.ty + dy }));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = toCanvas(e.clientX, e.clientY, canvas);
    const node = nearestNode(x, y);
    setHoveredId(node?.id ?? null);
    canvas.style.cursor = node ? 'pointer' : 'grab';
  }, [transform, nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragging.current = { startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y };
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const moved = dragging.current
      ? Math.hypot(e.clientX - dragging.current.startX, e.clientY - dragging.current.startY) > 4
      : false;
    dragging.current = null;
    if (!moved) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x, y } = toCanvas(e.clientX, e.clientY, canvas);
      const node = nearestNode(x, y);
      setSelectedId(node?.id ?? null);
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(5, t.scale * factor)) }));
  }

  const selectedClaim    = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const selectedNeighbors = selectedId ? relatedFor(selectedId) : [];

  const LOB_LEGEND = Object.entries({
    'Property':         '#0369a1',
    'Personal Auto':    '#0f766e',
    'Commercial Auto':  '#15803d',
    'Workers Comp':     '#b45309',
    'Commercial Multi': '#7c3aed',
    'Specialty':        '#b91c1c',
    'Life':             '#0b2545',
    'Health':           '#065f46',
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-[var(--hairline)] pb-4">
        <div className="eyebrow mb-1">Claim Network</div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">
          Related Claims Network
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
          Force-directed graph of {nodes.length} claims, connected by Jaccard similarity across
          line of business, peril, geography, severity band, and fraud signals. Top-{8} neighbors
          per claim. Drag to pan, scroll to zoom, click any node to inspect.
        </p>
      </header>

      {!ready && (
        <div className="flex items-center justify-center h-64 text-sm text-[var(--ink-soft)]">
          Loading claim catalog…
        </div>
      )}

      {ready && (
        <div className="flex flex-col lg:flex-row gap-0 border border-[var(--hairline)] overflow-hidden rounded-sm">
          {/* Canvas area */}
          <div
            className="relative flex-1 min-w-0"
            style={{ background: '#0b2545', minHeight: `${size.h}px` }}
          >
            <canvas
              ref={canvasRef}
              onMouseMove={onMouseMove}
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { setHoveredId(null); dragging.current = null; }}
              onWheel={onWheel}
              style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
            />

            {!simDone && ready && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/30 animate-pulse">
                  Settling claim network…
                </p>
              </div>
            )}

            <div className="absolute bottom-3 left-3 text-[9px] text-white/30 font-mono uppercase tracking-wider">
              {nodes.length} claims · {edges.length} edges · {simDone ? 'settled' : 'settling'}
            </div>

            {/* LOB legend */}
            <div className="absolute top-3 left-3 flex flex-col gap-1">
              {LOB_LEGEND.map(([lob, color]) => (
                <span key={lob} className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 7, height: 7, background: color, flexShrink: 0 }}
                  />
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/40">
                    {lob}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Side panel */}
          <aside
            className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[var(--hairline)] flex-none overflow-y-auto bg-white"
            style={{ maxHeight: `${size.h + 80}px` }}
          >
            {selectedClaim ? (
              <div className="p-5">
                <div className="mb-3">
                  <div className="eyebrow mb-0.5">Selected claim</div>
                  <h2 className="font-mono text-sm font-semibold text-[var(--ink-strong)]">
                    {selectedClaim.id}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 border border-[var(--hairline)] text-[var(--ink-muted)] uppercase tracking-wide">
                      {selectedClaim.lob}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 border border-[var(--hairline)] text-[var(--ink-soft)] uppercase tracking-wide">
                      {selectedClaim.peril}
                    </span>
                    {selectedClaim.state && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 border border-[var(--hairline)] text-[var(--ink-soft)]">
                        {selectedClaim.state}
                      </span>
                    )}
                    {selectedClaim.fraud && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 border border-[var(--bear)]/30 text-[var(--bear)] uppercase tracking-wide">
                        {selectedClaim.fraud}
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  to={`/complaints`}
                  className="inline-block font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--gold-dim)] border border-[var(--gold-dim)]/40 px-2.5 py-1 hover:bg-[var(--gold-bg)] transition mb-5"
                >
                  Back to claims radar
                </Link>

                <div className="border-t border-[var(--hairline)] pt-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-soft)] mb-2">
                    Nearest neighbors (top {selectedNeighbors.length})
                  </p>
                  <ol className="space-y-1">
                    {selectedNeighbors.map((nb) => (
                      <li key={nb.id}>
                        <button
                          onClick={() => setSelectedId(nb.id)}
                          className="w-full text-left px-2 py-2 border-l-2 border-[var(--hairline)] hover:border-[var(--gold)] hover:bg-[var(--paper-deep)] transition"
                        >
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="font-mono text-xs font-semibold text-[var(--ink-strong)] truncate">
                              {nb.id}
                            </span>
                            <span className="font-mono text-[9px] text-[var(--gold-dim)] flex-none">
                              {Math.round(nb.score * 100)}%
                            </span>
                          </div>
                          <p className="font-mono text-[9px] text-[var(--ink-muted)] truncate mt-0.5">
                            {nb.claim.product} · {nb.claim.state ?? '—'}
                          </p>
                          <p className="font-mono text-[9px] text-[var(--ink-soft)] truncate mt-0.5">
                            {nb.why}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-6 border-t border-[var(--hairline)] pt-4">
                  <p className="text-[11px] leading-relaxed text-[var(--ink-soft)]">
                    Similarity computed from{' '}
                    <span className="text-[var(--gold-dim)] font-medium">Jaccard overlap</span>{' '}
                    across LOB, peril, geography, severity band, and fraud signals.
                    Weights: LOB 1.6, peril 1.4, fraud 1.0, geography 0.8, severity 0.6.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-soft)]">
                  Click any node to inspect
                </p>
                <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                  Each node is a claim. Edges connect the {8} most similar claims per
                  node, scored by line of business, peril type, geography, severity band,
                  and fraud-signal overlap. Clusters form naturally — workers comp in one
                  region, cat-event property claims in another, fraud-suspected clusters
                  bridging across LOBs.
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-soft)] mt-1">
                  {nodes.length} claims · {edges.length} similarity edges
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
