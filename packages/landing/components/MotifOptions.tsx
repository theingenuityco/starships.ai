'use client';

import { useEffect, useRef } from 'react';

// ---- Option A: Geometric SVG ----

function RingsMotif() {
  return (
    <svg viewBox="0 0 200 200" fill="none" className="w-full aspect-square text-(--color-fg-subtle)" aria-hidden>
      <circle cx="100" cy="100" r="10" fill="currentColor" opacity="0.8" />
      <circle cx="100" cy="100" r="38" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <circle cx="100" cy="100" r="68" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="1" opacity="0.12" />
    </svg>
  );
}

function GridMotif() {
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const hi = r === 2 && c === 2;
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={15 + c * 36}
          y={15 + r * 36}
          width={28}
          height={28}
          rx="3"
          fill={hi ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1"
          opacity={hi ? 0.65 : 0.2}
        />
      );
    }
  }
  return (
    <svg viewBox="0 0 200 200" fill="none" className="w-full aspect-square text-(--color-fg-subtle)" aria-hidden>
      {cells}
    </svg>
  );
}

function ArcMotif() {
  const points: [number, number][] = [[20, 175], [60, 138], [100, 100], [145, 62], [180, 28]];
  return (
    <svg viewBox="0 0 200 200" fill="none" className="w-full aspect-square text-(--color-fg-subtle)" aria-hidden>
      <path d="M 20 175 Q 75 145 100 100 Q 130 58 180 28" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 7 : 4} fill="currentColor" opacity={0.3 + i * 0.14} />
      ))}
    </svg>
  );
}

// ---- Option B: Animated canvas ----

// Marketing: radar ping — rings spawn at the center and expand outward,
// fading as they grow, like a sonar/radar pulse.
function BroadcastCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const CX = 100, CY = 100;
    const MAX_R = 95;
    const SPEED = 0.3; // px per frame
    type Ring = { r: number };
    // Pre-seed rings at evenly spaced radii so it looks alive immediately
    const rings: Ring[] = [0, 0.25, 0.5, 0.75].map(t => ({ r: t * MAX_R }));
    // Radar blips — fixed targets within range that echo when a pulse sweeps
    // past them. One is a "converted" target (green); the rest ping blue-gray.
    type Blip = { dist: number; angle: number; green: boolean; lit: number; echo: number };
    const blips: Blip[] = [
      { dist: 44, angle: -1.0, green: true, lit: 0, echo: -1 },
      { dist: 70, angle: 2.4, green: false, lit: 0, echo: -1 },
      { dist: 56, angle: 1.15, green: false, lit: 0, echo: -1 },
    ];
    const MAX_ECHO = 16;
    let tick = 0, raf: number;
    const SPAWN_INTERVAL = Math.round(MAX_R / SPEED / rings.length); // keeps spacing even
    const draw = () => {
      ctx.clearRect(0, 0, 200, 200);
      // Spawn a new ring at the origin on a fixed cadence
      if (tick > 0 && tick % SPAWN_INTERVAL === 0) rings.push({ r: 0 });
      // Expand and draw rings
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].r += SPEED;
        if (rings[i].r > MAX_R) { rings.splice(i, 1); continue; }
        const progress = rings[i].r / MAX_R; // 0 → 1
        const opacity = (1 - progress) * 0.65;
        ctx.beginPath();
        ctx.arc(CX, CY, rings[i].r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(170,175,210,${opacity.toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // Blips — a pulse crossing a blip's radius triggers a fresh echo
      for (const b of blips) {
        for (const ring of rings) {
          if (ring.r >= b.dist && ring.r - SPEED < b.dist) {
            b.lit = 1;
            b.echo = 0;
          }
        }
        const bx = CX + Math.cos(b.angle) * b.dist;
        const by = CY + Math.sin(b.angle) * b.dist;
        const rgb = b.green ? '100,220,160' : '170,175,210';
        // Echo ring radiating out from the blip itself
        if (b.echo >= 0) {
          b.echo += 0.5;
          const eo = (1 - b.echo / MAX_ECHO) * 0.5;
          if (eo > 0) {
            ctx.beginPath();
            ctx.arc(bx, by, b.echo, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${rgb},${eo.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          if (b.echo > MAX_ECHO) b.echo = -1;
        }
        // Blip dot — flares when freshly pinged, then settles back
        b.lit = Math.max(0, b.lit - 0.012);
        const alpha = (b.green ? 0.4 : 0.32) + b.lit * 0.55;
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        ctx.fill();
      }
      // Center dot — solid anchor point
      ctx.beginPath();
      ctx.arc(CX, CY, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(170,175,210,0.9)';
      ctx.fill();
      tick++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={200} height={200} className="w-full aspect-square" aria-hidden />;
}

// Engineering: code scanner — thin indented lines that look like real source code,
// with a vertical cursor sweeping across and highlighting each line ok/flagged.
function CodeScanCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Each entry is an indented "code line": indent level (0–2), token widths, status.
    // Tokens are the coloured blobs that make up a line — keyword, identifier, value, etc.
    const lines: { indent: number; tokens: number[]; status: 'ok' | 'flag' | 'neutral'; lit: number }[] = [
      { indent: 0, tokens: [22, 6, 38],          status: 'neutral', lit: 0 },
      { indent: 1, tokens: [28, 8, 24, 6, 18],   status: 'ok',      lit: 0 },
      { indent: 1, tokens: [18, 6, 42],           status: 'ok',      lit: 0 },
      { indent: 2, tokens: [30, 8, 16, 6, 12],   status: 'flag',    lit: 0 },
      { indent: 2, tokens: [22, 6, 28],           status: 'flag',    lit: 0 },
      { indent: 1, tokens: [16, 6, 20],           status: 'ok',      lit: 0 },
      { indent: 0, tokens: [10],                   status: 'neutral', lit: 0 },
      { indent: 1, tokens: [26, 8, 32, 6, 14],   status: 'ok',      lit: 0 },
      { indent: 1, tokens: [20, 6, 18, 6, 26],   status: 'ok',      lit: 0 },
      { indent: 0, tokens: [10],                   status: 'neutral', lit: 0 },
    ];
    const LINE_H = 16;   // vertical spacing between lines
    const TOP = 16;      // y start
    const INDENT = 12;   // pixels per indent level
    const TOKEN_GAP = 4; // gap between tokens on the same line
    const LINE_NUM_W = 22; // left gutter for line numbers
    // Compute x ranges for the scanner to use
    const lineRanges = lines.map(ln => {
      const x0 = LINE_NUM_W + ln.indent * INDENT;
      const totalW = ln.tokens.reduce((s, w) => s + w + TOKEN_GAP, 0) - TOKEN_GAP;
      return { x0, x1: x0 + totalW };
    });
    let scanX = LINE_NUM_W, raf: number;
    const maxX = Math.max(...lineRanges.map(r => r.x1)) + 8;
    const draw = () => {
      ctx.clearRect(0, 0, 200, 200);
      scanX += 0.7;
      if (scanX > maxX) scanX = LINE_NUM_W;
      // Update lit values
      lines.forEach((ln, i) => {
        const { x0, x1 } = lineRanges[i];
        if (scanX >= x0 && scanX <= x1) {
          ln.lit = 1;
        } else {
          ln.lit = Math.max(0, ln.lit - 0.025);
        }
      });
      lines.forEach((ln, i) => {
        const y = TOP + i * LINE_H;
        const indent = LINE_NUM_W + ln.indent * INDENT;
        // Line number in gutter
        ctx.fillStyle = `rgba(170,175,210,0.18)`;
        ctx.font = '7px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1), LINE_NUM_W - 4, y + 8);
        // Thin vertical indent guides
        for (let d = 0; d < ln.indent; d++) {
          ctx.beginPath();
          ctx.moveTo(LINE_NUM_W + d * INDENT + 4, y + 1);
          ctx.lineTo(LINE_NUM_W + d * INDENT + 4, y + LINE_H - 2);
          ctx.strokeStyle = 'rgba(170,175,210,0.1)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        // Token blobs
        let tx = indent;
        ln.tokens.forEach((tw, ti) => {
          // Alternate token opacity slightly to suggest keyword vs identifier
          const baseAlpha = ti % 2 === 0 ? 0.22 : 0.15;
          ctx.fillStyle = `rgba(170,175,210,${baseAlpha})`;
          ctx.beginPath();
          ctx.rect(tx, y + 2, tw, 3);
          ctx.fill();
          // Highlight overlay when scanner passes
          if (ln.lit > 0) {
            const color = ln.status === 'flag'
              ? `rgba(255,160,100,${(ln.lit * 0.7).toFixed(3)})`
              : `rgba(100,220,160,${(ln.lit * 0.6).toFixed(3)})`;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.rect(tx, y + 2, tw, 3);
            ctx.fill();
          }
          tx += tw + TOKEN_GAP;
        });
      });
      // Scanner cursor — thin vertical line
      ctx.beginPath();
      ctx.moveTo(scanX, TOP - 4);
      ctx.lineTo(scanX, TOP + lines.length * LINE_H + 4);
      ctx.strokeStyle = 'rgba(170,175,210,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={200} height={200} className="w-full aspect-square" aria-hidden />;
}

// Sales: deal pipeline — dots (leads) enter from the left and travel through
// three stage columns toward close; some drop out at each stage.
function PipelineCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const STAGES = [
      { label: 'Prospect', x: 33 },
      { label: 'Qualify',  x: 100 },
      { label: 'Close',    x: 167 },
    ];
    // fading: true once the dot is being evicted to make room for a new win
    type Deal = { x: number; y: number; targetX: number; stage: number; dropped: boolean; opacity: number; fading: boolean };
    const deals: Deal[] = [];
    let tick = 0, raf: number;
    const MAX_WINS = 3;
    const spawnDeal = () => {
      deals.push({ x: 33, y: 30 + Math.random() * 140, targetX: 33, stage: 0, dropped: false, opacity: 1, fading: false });
    };
    const draw = () => {
      ctx.clearRect(0, 0, 200, 200);
      // Stage dividers
      ctx.strokeStyle = 'rgba(170,175,210,0.12)';
      ctx.lineWidth = 1;
      [66, 133].forEach(x => {
        ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, 190); ctx.stroke();
      });
      // Stage labels
      ctx.fillStyle = 'rgba(170,175,210,0.3)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      STAGES.forEach(s => ctx.fillText(s.label, s.x, 15));
      // Spawn a new deal every 110 frames
      if (tick % 110 === 0) spawnDeal();
      // Advance deals every 140 frames
      if (tick % 140 === 0) {
        for (const d of deals) {
          if (d.dropped || d.fading || d.stage >= 2) continue;
          if (Math.random() < 0.35) {
            d.dropped = true;
          } else {
            d.stage++;
            d.targetX = STAGES[d.stage].x;
            // If this new win exceeds the cap, evict the oldest non-fading win
            if (d.stage === 2) {
              const wins = deals.filter(w => w.stage === 2 && !w.fading);
              if (wins.length > MAX_WINS) wins[0].fading = true;
            }
          }
        }
      }
      // Update + draw deals
      for (let i = deals.length - 1; i >= 0; i--) {
        const d = deals[i];
        d.x += (d.targetX - d.x) * 0.04;
        if (d.dropped) {
          d.y += 0.6;
          d.opacity -= 0.008;
          if (d.opacity <= 0) { deals.splice(i, 1); continue; }
        }
        if (d.fading) {
          d.opacity -= 0.012;
          if (d.opacity <= 0) { deals.splice(i, 1); continue; }
        }
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3.5, 0, Math.PI * 2);
        const alpha = (d.dropped || d.fading ? d.opacity * 0.4 : 0.75).toFixed(3);
        ctx.fillStyle = d.stage === 2 ? `rgba(100,220,160,${alpha})` : `rgba(170,175,210,${alpha})`;
        ctx.fill();
      }
      tick++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={200} height={200} className="w-full aspect-square" aria-hidden />;
}

// ---- Option C: SVG line illustration ----

function BubblesIllust() {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" className="w-full aspect-square text-(--color-fg-subtle)" aria-hidden>
      <rect x="15" y="22" width="72" height="46" rx="10" strokeWidth="1.5" opacity="0.55" />
      <path d="M 25 68 L 15 85 L 52 68" strokeWidth="1.5" opacity="0.55" />
      <rect x="112" y="22" width="72" height="46" rx="10" strokeWidth="1.5" opacity="0.55" />
      <path d="M 162 68 L 185 85 L 172 68" strokeWidth="1.5" opacity="0.55" />
      <rect x="64" y="112" width="72" height="46" rx="10" strokeWidth="1.5" opacity="0.55" />
      <path d="M 100 112 L 93 97 L 107 97" strokeWidth="1.5" opacity="0.55" />
      <line x1="87" y1="45" x2="112" y2="45" strokeWidth="1" opacity="0.35" />
      <polyline points="109,40 113,45 109,50" strokeWidth="1" opacity="0.35" />
    </svg>
  );
}

function GitIllust() {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" className="w-full aspect-square text-(--color-fg-subtle)" aria-hidden>
      <line x1="100" y1="18" x2="100" y2="185" strokeWidth="1.5" opacity="0.35" />
      <line x1="100" y1="62" x2="152" y2="98" strokeWidth="1.5" opacity="0.5" />
      <line x1="100" y1="118" x2="152" y2="98" strokeWidth="1.5" opacity="0.5" />
      <line x1="100" y1="105" x2="50" y2="138" strokeWidth="1.5" opacity="0.5" />
      <line x1="100" y1="155" x2="50" y2="138" strokeWidth="1.5" opacity="0.5" />
      {([[100,18],[100,62],[100,118],[100,155],[100,185],[152,98],[50,138]] as [number,number][]).map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="5" fill="currentColor" strokeWidth="1.5" opacity="0.6" />
      ))}
    </svg>
  );
}

function FunnelIllust() {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full aspect-square text-(--color-fg-subtle)" aria-hidden>
      <path d="M 22 32 L 178 32 L 148 78 L 52 78 Z" opacity="0.55" />
      <path d="M 52 88 L 148 88 L 122 132 L 78 132 Z" opacity="0.45" />
      <path d="M 78 142 L 122 142 L 108 182 L 92 182 Z" opacity="0.35" />
      <text x="100" y="61" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none" opacity="0.55" fontFamily="monospace">LEADS</text>
      <text x="100" y="115" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none" opacity="0.45" fontFamily="monospace">PIPELINE</text>
      <text x="100" y="166" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none" opacity="0.35" fontFamily="monospace">CLOSED</text>
    </svg>
  );
}

// ---- Option D: Typographic ----

function TypoMarketing() {
  return (
    <div className="relative h-48 overflow-hidden select-none font-brand uppercase tracking-wider text-(--color-fg-subtle)" aria-hidden>
      <span className="absolute top-0 left-0 text-5xl font-bold opacity-[0.08]">DRAFT</span>
      <span className="absolute top-7 left-20 text-lg opacity-20">SEND</span>
      <span className="absolute top-14 left-1 text-2xl opacity-[0.12]">PLAN</span>
      <span className="absolute top-20 left-8 text-4xl font-bold opacity-[0.07]">REPORT</span>
      <span className="absolute bottom-5 left-0 text-3xl opacity-[0.11]">WRITE</span>
      <span className="absolute top-5 right-2 text-xl opacity-[0.14]">BRAND</span>
      <span className="absolute bottom-1 right-3 text-lg opacity-20">PUBLISH</span>
      <span className="absolute top-28 right-0 text-2xl opacity-[0.09]">CONTENT</span>
    </div>
  );
}

function TypoEngineering() {
  return (
    <div className="relative h-48 overflow-hidden select-none font-brand uppercase tracking-wider text-(--color-fg-subtle)" aria-hidden>
      <span className="absolute top-0 left-0 text-5xl font-bold opacity-[0.08]">REVIEW</span>
      <span className="absolute top-7 left-24 text-lg opacity-20">TEST</span>
      <span className="absolute top-14 left-2 text-3xl opacity-[0.12]">SHIP</span>
      <span className="absolute top-20 left-8 text-4xl font-bold opacity-[0.07]">SCAN</span>
      <span className="absolute bottom-5 left-0 text-2xl opacity-[0.11]">BUILD</span>
      <span className="absolute top-5 right-2 text-xl opacity-[0.14]">PATCH</span>
      <span className="absolute bottom-1 right-3 text-2xl opacity-20">MERGE</span>
      <span className="absolute top-28 right-0 text-lg opacity-[0.09]">DEPLOY</span>
    </div>
  );
}

function TypoSales() {
  return (
    <div className="relative h-48 overflow-hidden select-none font-brand uppercase tracking-wider text-(--color-fg-subtle)" aria-hidden>
      <span className="absolute top-0 left-0 text-4xl font-bold opacity-[0.08]">RESEARCH</span>
      <span className="absolute top-7 left-20 text-lg opacity-20">CRM</span>
      <span className="absolute top-14 left-1 text-2xl opacity-[0.12]">FOLLOW UP</span>
      <span className="absolute top-20 left-6 text-4xl font-bold opacity-[0.07]">CLOSE</span>
      <span className="absolute bottom-5 left-0 text-3xl opacity-[0.11]">PIPELINE</span>
      <span className="absolute top-5 right-2 text-xl opacity-[0.14]">QUALIFY</span>
      <span className="absolute bottom-1 right-3 text-lg opacity-20">ENRICH</span>
      <span className="absolute top-28 right-0 text-2xl opacity-[0.09]">PITCH</span>
    </div>
  );
}

// ---- Export ----

const options = [
  {
    label: 'A',
    name: 'Geometric',
    desc: 'Static SVG shapes composed per room. Radiating rings, precision grid, climbing arc.',
    visuals: [
      { room: 'Marketing', el: <RingsMotif /> },
      { room: 'Engineering', el: <GridMotif /> },
      { room: 'Sales', el: <ArcMotif /> },
    ],
  },
  {
    label: 'B',
    name: 'Generative / animated',
    desc: 'Canvas motifs like BurnMotif. Broadcast pulse, code scanner, deal pipeline.',
    visuals: [
      { room: 'Marketing', el: <BroadcastCanvas /> },
      { room: 'Engineering', el: <CodeScanCanvas /> },
      { room: 'Sales', el: <PipelineCanvas /> },
    ],
  },
  {
    label: 'C',
    name: 'Line illustration',
    desc: 'Single-weight SVG stroke drawings. Speech bubbles, git branch tree, sales funnel.',
    visuals: [
      { room: 'Marketing', el: <BubblesIllust /> },
      { room: 'Engineering', el: <GitIllust /> },
      { room: 'Sales', el: <FunnelIllust /> },
    ],
  },
  {
    label: 'D',
    name: 'Typographic',
    desc: 'Domain words layered at varying sizes and opacities using the brand font.',
    visuals: [
      { room: 'Marketing', el: <TypoMarketing /> },
      { room: 'Engineering', el: <TypoEngineering /> },
      { room: 'Sales', el: <TypoSales /> },
    ],
  },
];

export function MotifOptions() {
  return (
    <div className="space-y-16">
      {options.map((opt) => (
        <div key={opt.label}>
          <div className="mb-5 flex items-start gap-3">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-(--color-border) text-xs font-semibold text-(--color-fg)">
              {opt.label}
            </span>
            <div>
              <p className="text-base font-semibold text-(--color-fg)">{opt.name}</p>
              <p className="mt-0.5 text-sm text-(--color-fg-subtle)">{opt.desc}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {opt.visuals.map((v) => (
              <div key={v.room} className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-4">
                <p className="mb-3 text-[10px] font-brand uppercase tracking-widest text-(--color-fg-subtle)">{v.room}</p>
                {v.el}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Named exports for use in production sections
export { BroadcastCanvas as MarketingMotif };
export { CodeScanCanvas as EngineeringMotif };
export { PipelineCanvas as SalesMotif };
