// Hand-rolled canvas traces and SVG result charts. No chart library.
import type { Sample } from '../core/types';
import type { SweepResult } from '../core/analysis';

export interface Span { a: number; b: number }

/** Scrolling strip chart. Invalid spans are hatched: that data is excluded. */
export class TraceCanvas {
  private ctx: CanvasRenderingContext2D;
  constructor(private cv: HTMLCanvasElement, private color: string, private windowS = 20) {
    this.ctx = cv.getContext('2d')!;
  }

  draw(data: Sample[], tNow: number, opts: { ghost?: Sample[]; invalid?: Span[]; frozen?: boolean; label?: string } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) {
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const t0 = tNow - this.windowS;
    const x = (t: number) => ((t - t0) / this.windowS) * w;

    // excluded spans
    for (const s of opts.invalid ?? []) {
      if (s.b < t0) continue;
      const xa = Math.max(0, x(s.a)), xb = Math.min(w, x(s.b));
      c.fillStyle = 'rgba(231,185,95,0.10)';
      c.fillRect(xa, 0, xb - xa, h);
      c.strokeStyle = 'rgba(231,185,95,0.22)';
      c.lineWidth = 1;
      for (let k = xa - h; k < xb; k += 8) {
        c.beginPath(); c.moveTo(Math.max(xa, k), Math.min(h, h - (Math.max(xa, k) - k))); c.lineTo(Math.min(xb, k + h), Math.max(0, h - (Math.min(xb, k + h) - k))); c.stroke();
      }
    }

    const vis = data.filter((s) => s.t >= t0 && s.t <= tNow);
    const plot = (pts: Sample[], color: string, width: number, minmax?: [number, number]) => {
      if (pts.length < 2) return;
      let mn = Infinity, mx = -Infinity;
      if (minmax) [mn, mx] = minmax;
      else for (const p of pts) { if (p.v < mn) mn = p.v; if (p.v > mx) mx = p.v; }
      const pad = (mx - mn) * 0.12 || 1;
      const y = (v: number) => h - ((v - mn + pad) / (mx - mn + 2 * pad)) * h;
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round';
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(x(p.t), y(p.v)) : c.moveTo(x(p.t), y(p.v))));
      c.stroke();
    };
    if (opts.ghost) plot(opts.ghost.filter((s) => s.t >= t0 && s.t <= tNow), 'rgba(141,150,163,0.45)', 1.5, [0, 1]);
    plot(vis, opts.frozen ? 'rgba(141,150,163,0.6)' : this.color, 2);

    if (opts.frozen || opts.label) {
      c.fillStyle = 'rgba(14,17,22,0.75)';
      c.fillRect(w / 2 - 70, h / 2 - 14, 140, 28);
      c.fillStyle = '#e7b95f';
      c.font = '600 13px "Segoe UI", system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(opts.label ?? 'Signal lost', w / 2, h / 2);
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

/** Response curve: pace (x) vs heart-rhythm swing (y). Excluded paces drawn hollow on the axis. */
export function measuredChart(r: SweepResult): string {
  const W = 560, H = 260, L = 48, R = 16, T = 18, B = 40;
  const paces = r.points.map((p) => p.bpm);
  const xmin = Math.min(...paces) - 0.25, xmax = Math.max(...paces) + 0.25;
  const coupling = r.mode === 'coupling';
  const vals = r.points.map((p) => (coupling ? p.amplitude : p.score)).filter((v): v is number => v !== null && Number.isFinite(v));
  // the y axis always starts at 0 bpm, so a small spread looks small; part ranges are included in the scale
  const partVals = coupling ? r.points.flatMap((p) => (p.status === 'ok' ? p.blocks.filter(Number.isFinite) : [])) : [];
  const ymax = coupling ? Math.max(2, Math.ceil(Math.max(...vals, ...partVals) * 1.15)) : Math.max(1, ...vals) * 1.15;
  const x = (v: number) => L + ((v - xmin) / (xmax - xmin)) * (W - L - R);
  const y = (v: number) => H - B - (v / ymax) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Response curve">`;
  s += `<line class="axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/><line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>`;
  for (const p of paces) s += `<text x="${x(p)}" y="${H - B + 16}" text-anchor="middle">${p.toFixed(1)}</text>`;
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">breaths per minute</text>`;
  const yl = coupling ? 'swing (bpm)' : 'score';
  s += `<text x="12" y="${(T + H - B) / 2}" transform="rotate(-90 12 ${(T + H - B) / 2})" text-anchor="middle">${yl}</text>`;
  for (let k = 0; k <= 4; k++) {
    const v = (ymax / 4) * k;
    s += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(coupling ? 1 : 2)}</text>`;
  }
  const ok = r.points.filter((p) => p.status === 'ok' && (coupling ? p.amplitude : p.score) !== null).sort((a, b) => a.bpm - b.bpm);
  if (ok.length > 1) s += `<polyline class="curve" points="${ok.map((p) => `${x(p.bpm)},${y((coupling ? p.amplitude : p.score)!)}`).join(' ')}"/>`;
  // range of the three 30 s parts of each pace: how much the measure wobbled within that pace
  if (coupling) for (const p of r.points) {
    const b = p.blocks.filter(Number.isFinite);
    if (p.status !== 'ok' || b.length < 2) continue;
    const lo = Math.min(...b), hi = Math.max(...b), cx = x(p.bpm);
    s += `<g class="bar-range"><line x1="${cx}" y1="${y(lo)}" x2="${cx}" y2="${y(hi)}"/><line x1="${cx - 5}" y1="${y(lo)}" x2="${cx + 5}" y2="${y(lo)}"/><line x1="${cx - 5}" y1="${y(hi)}" x2="${cx + 5}" y2="${y(hi)}"/><title>${p.bpm}/min, three 30-second parts: ${b.map((v) => v.toFixed(1)).join(', ')} bpm</title></g>`;
  }
  for (const p of r.points) {
    const v = coupling ? p.amplitude : p.score;
    if (p.status === 'ok' && v !== null) s += `<circle class="pt" cx="${x(p.bpm)}" cy="${y(v)}" r="5"><title>${p.bpm}/min: ${v.toFixed(2)}</title></circle>`;
    else s += `<circle class="pt excl" cx="${x(p.bpm)}" cy="${H - B}" r="6"><title>${p.bpm}/min not read: ${esc(p.reason ?? '')}</title></circle><text x="${x(p.bpm)}" y="${H - B - 12}" text-anchor="middle">not read</text>`;
  }
  if (r.bestPace !== null && r.certainty !== 'flat' && r.certainty !== 'insufficient') {
    s += `<line class="best" x1="${x(r.bestPace)}" y1="${T}" x2="${x(r.bestPace)}" y2="${H - B}"/><text class="bestlbl" x="${x(r.bestPace)}" y="${T + 2}" text-anchor="middle">best ≈ ${r.bestPace}</text>`;
  }
  return s + '</svg>';
}

/** Felt-ease bars, same x axis. */
export function feltChart(r: SweepResult): string {
  const W = 340, H = 260, L = 30, R = 10, T = 18, B = 40;
  const pts = [...r.points].sort((a, b) => a.bpm - b.bpm);
  const bw = (W - L - R) / pts.length;
  const y = (v: number) => H - B - (v / 5) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Felt ease">`;
  s += `<line class="axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>`;
  for (let k = 1; k <= 5; k++) s += `<text x="${L - 8}" y="${y(k) + 4}" text-anchor="end">${k}</text>`;
  pts.forEach((p, i) => {
    const cx = L + bw * i + bw / 2;
    if (p.felt) s += `<rect class="bar${p.status === 'ok' ? '' : ' excl'}" x="${cx - bw * 0.3}" y="${y(p.felt)}" width="${bw * 0.6}" height="${H - B - y(p.felt)}" rx="4"/>`;
    s += `<text x="${cx}" y="${H - B + 16}" text-anchor="middle">${p.bpm.toFixed(1)}</text>`;
  });
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">1 hard · 5 easy</text>`;
  return s + '</svg>';
}
