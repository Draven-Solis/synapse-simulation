import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────
   STAGE DATA
   Biologically accurate 5-stage model:
   1. Resting        – vesicles docked, Ca channels closed
   2. Action Potential – electrical wave travels down axon → terminal
   3. Ca²⁺ Influx    – channels on SIDES of terminal open, Ca²⁺ enters
                        and collides with docked vesicles
   4. Exocytosis     – vesicle membrane FUSES with pre-synaptic membrane
                        (omega-shape pore), NTs released through pore
   5. Receptor Binding + new AP wave on post-synaptic dendrite
───────────────────────────────────────────────────────────────── */
const STAGES = [
  { id: 1, name: 'Resting State',           color: '#818cf8', accent: '#6366f1',
    desc: 'Neuron is at rest (≈ −70 mV). Synaptic vesicles packed with neurotransmitters are docked at the active zone. Voltage-gated Ca²⁺ channels on the terminal walls are closed.' },
  { id: 2, name: 'Action Potential',         color: '#fbbf24', accent: '#f59e0b',
    desc: 'A depolarisation wave (the action potential) travels down the axon as a cascade of yellow ion-wave particles, reaching the pre-synaptic terminal.' },
  { id: 3, name: 'Ca²⁺ Influx',             color: '#34d399', accent: '#10b981',
    desc: 'Depolarisation opens voltage-gated Ca²⁺ channels in the SIDES of the terminal. Ca²⁺ ions stream in and diffuse toward the docked vesicles, triggering the fusion machinery (SNAREs).' },
  { id: 4, name: 'Exocytosis',              color: '#60a5fa', accent: '#3b82f6',
    desc: 'Vesicle membrane merges with the pre-synaptic membrane. The contact point dissolves into an omega-shaped (Ω) pore, releasing neurotransmitters into the synaptic cleft.' },
  { id: 5, name: 'Receptor Binding & New Stimulus', color: '#f472b6', accent: '#ec4899',
    desc: 'Neurotransmitters bind post-synaptic receptors, opening ion channels. A new electrical stimulus propagates along the post-synaptic dendrite.' },
];

/* ─── coordinate constants ─────────────────────────────────────── */
// ViewBox 480 × 640 – microscopic close-up
const CX = 240;           // horizontal center

// Pre-synaptic terminal: one continuous organic path
// Axon section: y 0→120, width ≈ 54 px (CX ± 27)
// Bouton widens: y 120→320, max half-width ≈ 138 px
// Pre-synaptic active zone (membrane): y ≈ 325

// Vesicle positions along the active zone curve
const DOCKED = [
  { id: 'd0', cx: 148, cy: 318, r: 13 },
  { id: 'd1', cx: 188, cy: 328, r: 13 },
  { id: 'd2', cx: 240, cy: 332, r: 13 },
  { id: 'd3', cx: 292, cy: 328, r: 13 },
  { id: 'd4', cx: 332, cy: 318, r: 13 },
];

const RESERVE = [
  { id: 'rv0', cx: 180, cy: 265, r: 10 },
  { id: 'rv1', cx: 218, cy: 248, r: 10 },
  { id: 'rv2', cx: 260, cy: 255, r: 10 },
  { id: 'rv3', cx: 300, cy: 265, r: 10 },
  { id: 'rv4', cx: 155, cy: 295, r:  9 },
  { id: 'rv5', cx: 325, cy: 290, r:  9 },
];

// Ca²⁺ channels: 3 on each SIDE of the terminal (not the bottom)
const CA_CHANNELS_L = [
  { id: 'cl0', x: 104, y: 210 },
  { id: 'cl1', x: 102, y: 250 },
  { id: 'cl2', x: 106, y: 290 },
];
const CA_CHANNELS_R = [
  { id: 'cr0', x: 376, y: 210 },
  { id: 'cr1', x: 378, y: 250 },
  { id: 'cr2', x: 374, y: 290 },
];

// Ca²⁺ ion travel paths: from channel → nearest vesicle
const CA_IONS = [
  { id: 'ci0', sx: 118, sy: 218, ex: 175, ey: 316 },
  { id: 'ci1', sx: 116, sy: 255, ex: 215, ey: 327 },
  { id: 'ci2', sx: 120, sy: 292, ex: 240, ey: 332 },
  { id: 'ci3', sx: 362, sy: 218, ex: 305, ey: 316 },
  { id: 'ci4', sx: 364, sy: 255, ex: 265, ey: 327 },
  { id: 'ci5', sx: 360, sy: 292, ex: 240, ey: 332 },
];

// Post-synaptic receptors — memY is the y-coordinate on the membrane curve
// Membrane path: M 70,445 Q 240,430 410,445  →  y(cx) ≈ 445 - 30t + 30t²  where t=(cx-70)/340
const RECEPTORS = [
  { id: 'r0', cx: 158, memY: 439 },
  { id: 'r1', cx: 198, memY: 438 },
  { id: 'r2', cx: 240, memY: 437 },
  { id: 'r3', cx: 282, memY: 438 },
  { id: 'r4', cx: 322, memY: 439 },
];

// NT molecules: two-phase journey
//   Phase 1 (stage 4): pore → centre of synaptic cleft  (sx,sy) → (mx,my)
//   Phase 2 (stage 5): cleft centre → assigned receptor  (mx,my) → (ex,ey)
const NT_MOLS = DOCKED.flatMap((v, vi) =>
  [0, 1, 2].map((k) => ({
    id: `nt-${vi}-${k}`,
    sx: v.cx + (k - 1) * 6,
    sy: 350,
    mx: v.cx + (k - 1) * 22 + (vi - 2) * 7,
    my: 403,
    ex: RECEPTORS[vi].cx + (k - 1) * 3,
    ey: RECEPTORS[vi].memY - 2,
    delay1: vi * 0.07 + k * 0.03,
    delay2: vi * 0.10 + k * 0.04,
  }))
);

const STAGE_DURATION = 3200; // ms per stage

function eio(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

/* ─────────────────────────────────────────────────────────────────
   WAVE PARTICLE HOOK
   Generates animated "ion wave" particles along a vertical axis.
   Particles travel from y=startY to y=endY, oscillating in x.
───────────────────────────────────────────────────────────────── */
interface WaveParticle { id: number; phase: number; speed: number }

function useWaveParticles(count: number, active: boolean) {
  const [offsets, setOffsets] = useState<number[]>(() => Array.from({ length: count }, (_, i) => i / count));
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!active) { cancelAnimationFrame(rafRef.current); return; }
    const tick = (now: number) => {
      const dt = now - (lastRef.current || now);
      lastRef.current = now;
      setOffsets((prev) => prev.map((v) => (v + dt / 900) % 1));
      rafRef.current = requestAnimationFrame(tick);
    };
    lastRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return offsets;
}

/* ─────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────── */
export function SynapseViz() {
  const [si, setSi] = useState(0);           // stage index 0-4
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed]     = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [prog, setProg] = useState(0);       // 0-1 within stage
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const siRef  = useRef(si);
  siRef.current = si;

  const stage = STAGES[si];
  const stageNum = si + 1;
  const p = Math.min(prog, 1);
  const ep = eio(p);

  // Wave particles
  const apActive   = stageNum === 2 || (stageNum === 2 && ep < 1);
  const postActive = stageNum === 5;
  const axonWave   = useWaveParticles(7, stageNum >= 2 && stageNum <= 2);
  const termWave   = useWaveParticles(5, stageNum === 2 && ep > 0.5);
  const postWave   = useWaveParticles(7, stageNum === 5 && ep > 0.4);

  // RAF loop
  const tick = useCallback((now: number) => {
    if (!lastRef.current) lastRef.current = now;
    const dt = now - lastRef.current;
    lastRef.current = now;
    setProg((prev) => {
      const next = prev + (dt * speedRef.current) / STAGE_DURATION;
      if (next >= 1) {
        const cur = siRef.current;
        if (cur < STAGES.length - 1) { setSi(cur + 1); lastRef.current = 0; return 0; }
        else { setPlaying(false); return 1; }
      }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (playing) { lastRef.current = 0; rafRef.current = requestAnimationFrame(tick); }
    else cancelAnimationFrame(rafRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, tick]);

  /* ── Keyboard shortcuts ────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setPlaying((x) => !x);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSi((cur) => { const next = Math.min(cur + 1, STAGES.length - 1); setProg(0); lastRef.current = 0; setPlaying(false); return next; });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSi((cur) => { const prev = Math.max(cur - 1, 0); setProg(0); lastRef.current = 0; setPlaying(false); return prev; });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function goTo(idx: number) { setPlaying(false); setSi(idx); setProg(0); lastRef.current = 0; }

  /* ── derived animation values ─────────────────────────────── */
  // Stage 2: AP wave traveling down axon (0→1 = top of axon → terminal base)
  const apFront    = stageNum === 2 ? ep : stageNum > 2 ? 1 : 0;
  // Stage 3: Ca2+ channels open, ions travel
  const caOpen     = stageNum >= 3 ? (stageNum === 3 ? ep : 1) : 0;
  const caIonProg  = stageNum === 3 ? clamp01((ep - 0.2) / 0.8) : stageNum > 3 ? 1 : 0;
  // Stage 4: vesicle fusion omega progress (0=circle, 1=fully open pore)
  const fuseProg   = stageNum === 4 ? ep : stageNum > 4 ? 1 : 0;
  const visiVesicle= stageNum < 4 ? 1 : stageNum === 4 ? lerp(1, 0, clamp01(ep * 2)) : 0;
  // Stage 4: NT molecules release → travel to cleft centre
  const ntProg       = stageNum === 4 ? clamp01((ep - 0.35) / 0.65) : stageNum >= 5 ? 1 : 0;
  const ntOpacity    = stageNum === 4 ? clamp01((ep - 0.35) * 5) : stageNum === 5 ? 1 : 0;
  // Stage 5: NTs travel from cleft centre → bind receptors
  const ntPhase2Prog = stageNum === 5 ? ep : 0;
  // Stage 5: receptors bind progressively, post-synaptic wave
  const recBound   = stageNum === 5 ? ep : 0;
  const postWaveProg = stageNum === 5 ? clamp01((ep - 0.3) / 0.7) : 0;

  /* ── helper: vesicle arc path (omega pore) ─────────────────── */
  // openDeg: how many degrees at the BOTTOM are "open" (0=full circle, 90=half open)
  function vesicleArcPath(cx: number, cy: number, r: number, openDeg: number): string {
    if (openDeg <= 0.5) {
      return `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r} Z`;
    }
    const half = openDeg * (Math.PI / 180);
    // Arc goes from (startAngle) to (endAngle) measured from top
    // We draw from bottom-right edge around the top to bottom-left edge
    const startAngle = Math.PI / 2 + half;   // right opening edge (in standard coords)
    const endAngle   = Math.PI / 2 - half;   // left opening edge

    const sx = cx + r * Math.cos(startAngle);
    const sy = cy + r * Math.sin(startAngle);
    const ex = cx + r * Math.cos(endAngle);
    const ey = cy + r * Math.sin(endAngle);
    // large arc flag: always take the long way around (over the top)
    return `M ${sx.toFixed(2)},${sy.toFixed(2)} A ${r},${r} 0 1,1 ${ex.toFixed(2)},${ey.toFixed(2)}`;
  }

  const openDeg = lerp(0, 82, fuseProg);

  /* ── wave particle renderer ────────────────────────────────── */
  // Axon wave: travels y=10→130 along the axon, oscillates ±8px in x
  function renderAxonWave(offsets: number[]) {
    return offsets.map((off, i) => {
      const y = lerp(15, 128, off);
      const x = CX + 9 * Math.sin(y / 22 + i * 1.3);
      const alpha = Math.sin(off * Math.PI);
      return (
        <circle key={`aw-${i}`} cx={x} cy={y} r={4.5}
          fill="#fbbf24" opacity={alpha * 0.92}
          filter="url(#glow-y)" />
      );
    });
  }

  // Terminal arrival wave: ripple through the bouton as AP arrives
  function renderTerminalWave(offsets: number[], waveFront: number) {
    if (waveFront < 0.5) return null;
    const tFade = clamp01((waveFront - 0.5) * 6);
    return offsets.map((off, i) => {
      const angle = (off + i / offsets.length) * 2 * Math.PI;
      const rad = lerp(40, 120, off);
      const x = CX + rad * Math.cos(angle);
      const y = 240 + rad * 0.55 * Math.sin(angle);
      return (
        <circle key={`tw-${i}`} cx={x} cy={y} r={3.5}
          fill="#fbbf24" opacity={tFade * 0.7 * Math.sin(off * Math.PI)}
          filter="url(#glow-y)" />
      );
    });
  }

  // Post-synaptic wave: travels y=460→560 along post-synaptic dendrite
  function renderPostWave(offsets: number[], waveFront: number) {
    if (waveFront <= 0) return null;
    return offsets.map((off, i) => {
      const y = lerp(462, 560, off);
      const x = CX + 10 * Math.sin(y / 20 + i * 1.4);
      const alpha = Math.sin(off * Math.PI) * clamp01(waveFront * 3);
      return (
        <circle key={`pw-${i}`} cx={x} cy={y} r={4.5}
          fill="#fbbf24" opacity={alpha * 0.9}
          filter="url(#glow-y)" />
      );
    });
  }

  /* ── render ────────────────────────────────────────────────── */
  return (
    <div className="w-full flex overflow-hidden"
      style={{ height: '100dvh', background: 'radial-gradient(ellipse at 30% 20%, #0c1428 0%, #050810 70%)', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── LEFT: SVG ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* subtle dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        <svg viewBox="0 0 480 640" style={{ width: '100%', maxWidth: 500, height: 'auto' }}>
          <defs>
            <filter id="glow-y" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-g" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-b" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-p" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="7" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>

            {/* ONE continuous gradient for entire pre-synaptic structure */}
            <radialGradient id="preGrad" cx="50%" cy="52%" r="54%">
              <stop offset="0%"   stopColor="#1a2e5a"/>
              <stop offset="75%"  stopColor="#0d1b36"/>
              <stop offset="100%" stopColor="#060e20"/>
            </radialGradient>

            <radialGradient id="postGrad" cx="50%" cy="40%" r="58%">
              <stop offset="0%"   stopColor="#0d2a20"/>
              <stop offset="100%" stopColor="#040e12"/>
            </radialGradient>

            <radialGradient id="vesGrad" cx="35%" cy="32%" r="68%">
              <stop offset="0%"   stopColor="#a5b4fc"/>
              <stop offset="100%" stopColor="#4338ca"/>
            </radialGradient>

            <radialGradient id="ntGrad" cx="35%" cy="32%" r="68%">
              <stop offset="0%"   stopColor="#93c5fd"/>
              <stop offset="100%" stopColor="#1d4ed8"/>
            </radialGradient>

            <radialGradient id="caGrad" cx="40%" cy="35%" r="65%">
              <stop offset="0%"   stopColor="#6ee7b7"/>
              <stop offset="100%" stopColor="#059669"/>
            </radialGradient>

            {/* Clip path per docked vesicle for omega effect */}
            {DOCKED.map((v) => (
              <clipPath key={`clip-${v.id}`} id={`clip-${v.id}`}>
                <rect x={v.cx - v.r - 2} y={v.cy - v.r - 2} width={(v.r + 2) * 2} height={v.r * 2 + 2} />
              </clipPath>
            ))}
          </defs>

          {/* ═══════════════════════════════════════════════════
              PRE-SYNAPTIC STRUCTURE — ONE continuous path
              Axon tapers into the terminal bouton organically.
          ═══════════════════════════════════════════════════ */}
          {/* Main fill */}
          <path
            d={`
              M 213,0
              C 210,65  116,148  104,245
              C  98,292 128,348  240,362
              C 352,348 382,292  376,245
              C 364,148  270,65  267,0
              Z
            `}
            fill="url(#preGrad)"
            stroke={
              stageNum === 2 ? `rgba(251,191,36,${lerp(0.18, 0.55, apFront)})` :
              stageNum === 5 ? `rgba(99,102,241,0.2)` :
              'rgba(99,102,241,0.18)'
            }
            strokeWidth="1.8"
          />

          {/* Subtle inner highlight — gives 3-D depth */}
          <path
            d={`
              M 226,4
              C 223,55 158,135 152,225
              C 149,268 165,305 240,315
              C 315,305 331,268 328,225
              C 322,135 257,55 254,4
              Z
            `}
            fill="none"
            stroke="rgba(147,197,253,0.07)"
            strokeWidth="1"
          />

          {/* "Pre-synaptic Terminal" label */}
          <text x={CX} y="200" textAnchor="middle" fontSize="8.5"
            fill="rgba(165,180,252,0.38)" fontFamily="Inter">Pre-synaptic Bouton</text>
          <text x={CX} y="175" textAnchor="middle" fontSize="7.5"
            fill="rgba(165,180,252,0.25)" fontFamily="Inter">Axon Terminal</text>

          {/* ── Axon label (upper narrow section) ── */}
          <text x={CX} y="42" textAnchor="middle" fontSize="8"
            fill="rgba(147,197,253,0.4)" fontFamily="Inter">Axon</text>

          {/* ═══════════════════════════════════════════════════
              STAGE 2 — Action Potential wave down axon
          ═══════════════════════════════════════════════════ */}
          {stageNum === 2 && renderAxonWave(axonWave)}
          {stageNum === 2 && renderTerminalWave(termWave, apFront)}

          {/* ═══════════════════════════════════════════════════
              Ca²⁺ CHANNELS on the SIDES of terminal
              (NOT on the active zone at the bottom)
          ═══════════════════════════════════════════════════ */}
          {/* ── LEFT Ca²⁺ channels — gate-protein embedded in lateral wall ── */}
          {CA_CHANNELS_L.map((ch, i) => {
            const isOpen = stageNum >= 3 && caOpen > i * 0.28;
            const gapPx  = isOpen ? lerp(0, 5, clamp01((caOpen - i * 0.28) / 0.72)) : 0;
            return (
              <g key={ch.id}>
                {/* Membrane embedding slot — shows channel is part of wall */}
                <rect x={ch.x - 4} y={ch.y - 13} width={5} height={26} rx={2}
                  fill={isOpen ? 'rgba(52,211,153,0.28)' : 'rgba(99,102,241,0.18)'}
                  stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.32)'}
                  strokeWidth="0.8"
                />
                {/* Upper gate subunit — slides up as channel opens */}
                <rect x={ch.x} y={ch.y - gapPx - 9} width={16} height={9} rx={3}
                  fill={isOpen ? 'rgba(52,211,153,0.2)' : 'rgba(99,102,241,0.1)'}
                  stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.38)'}
                  strokeWidth="1.3"
                  filter={isOpen ? 'url(#glow-g)' : undefined}
                />
                {/* Upper subunit TM-helix accent */}
                <rect x={ch.x + 5} y={ch.y - gapPx - 9} width={4} height={9} rx={2}
                  fill={isOpen ? 'rgba(52,211,153,0.5)' : 'rgba(99,102,241,0.3)'}
                />
                {/* Lower gate subunit — slides down as channel opens */}
                <rect x={ch.x} y={ch.y + gapPx} width={16} height={9} rx={3}
                  fill={isOpen ? 'rgba(52,211,153,0.2)' : 'rgba(99,102,241,0.1)'}
                  stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.38)'}
                  strokeWidth="1.3"
                  filter={isOpen ? 'url(#glow-g)' : undefined}
                />
                {/* Lower subunit TM-helix accent */}
                <rect x={ch.x + 5} y={ch.y + gapPx} width={4} height={9} rx={2}
                  fill={isOpen ? 'rgba(52,211,153,0.5)' : 'rgba(99,102,241,0.3)'}
                />
                {/* Pore glow when open */}
                {isOpen && gapPx > 1 && (
                  <ellipse cx={ch.x + 8} cy={ch.y} rx={4.5} ry={gapPx + 1}
                    fill="rgba(52,211,153,0.55)" filter="url(#glow-g)" />
                )}
                {isOpen && (
                  <text x={ch.x + 20} y={ch.y + 3} fontSize="5.5"
                    fill="#6ee7b7" fontFamily="Inter" fontWeight="700">Ca²⁺</text>
                )}
              </g>
            );
          })}

          {/* ── RIGHT Ca²⁺ channels — mirrored ── */}
          {CA_CHANNELS_R.map((ch, i) => {
            const isOpen = stageNum >= 3 && caOpen > i * 0.28;
            const gapPx  = isOpen ? lerp(0, 5, clamp01((caOpen - i * 0.28) / 0.72)) : 0;
            return (
              <g key={ch.id}>
                {/* Membrane embedding slot */}
                <rect x={ch.x - 1} y={ch.y - 13} width={5} height={26} rx={2}
                  fill={isOpen ? 'rgba(52,211,153,0.28)' : 'rgba(99,102,241,0.18)'}
                  stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.32)'}
                  strokeWidth="0.8"
                />
                {/* Upper gate subunit (extends LEFT — inner side) */}
                <rect x={ch.x - 16} y={ch.y - gapPx - 9} width={16} height={9} rx={3}
                  fill={isOpen ? 'rgba(52,211,153,0.2)' : 'rgba(99,102,241,0.1)'}
                  stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.38)'}
                  strokeWidth="1.3"
                  filter={isOpen ? 'url(#glow-g)' : undefined}
                />
                <rect x={ch.x - 9} y={ch.y - gapPx - 9} width={4} height={9} rx={2}
                  fill={isOpen ? 'rgba(52,211,153,0.5)' : 'rgba(99,102,241,0.3)'}
                />
                {/* Lower gate subunit */}
                <rect x={ch.x - 16} y={ch.y + gapPx} width={16} height={9} rx={3}
                  fill={isOpen ? 'rgba(52,211,153,0.2)' : 'rgba(99,102,241,0.1)'}
                  stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.38)'}
                  strokeWidth="1.3"
                  filter={isOpen ? 'url(#glow-g)' : undefined}
                />
                <rect x={ch.x - 9} y={ch.y + gapPx} width={4} height={9} rx={2}
                  fill={isOpen ? 'rgba(52,211,153,0.5)' : 'rgba(99,102,241,0.3)'}
                />
                {isOpen && gapPx > 1 && (
                  <ellipse cx={ch.x - 8} cy={ch.y} rx={4.5} ry={gapPx + 1}
                    fill="rgba(52,211,153,0.55)" filter="url(#glow-g)" />
                )}
                {isOpen && (
                  <text x={ch.x - 20} y={ch.y + 3} textAnchor="end" fontSize="5.5"
                    fill="#6ee7b7" fontFamily="Inter" fontWeight="700">Ca²⁺</text>
                )}
              </g>
            );
          })}

          {/* Ca²⁺ channel label — stage 3 */}
          {stageNum === 3 && caOpen > 0.5 && (
            <g opacity={clamp01((caOpen - 0.5) * 4)}>
              <line x1="98" y1="250" x2="60" y2="240" stroke="rgba(52,211,153,0.4)" strokeWidth="1" strokeDasharray="3 2"/>
              <text x="58" y="237" textAnchor="end" fontSize="7.5" fill="rgba(52,211,153,0.7)" fontFamily="Inter">Ca²⁺ channels</text>
              <text x="58" y="247" textAnchor="end" fontSize="7" fill="rgba(52,211,153,0.5)" fontFamily="Inter">(lateral walls)</text>
            </g>
          )}

          {/* ═══════════════════════════════════════════════════
              Ca²⁺ ION PARTICLES — enter from sides, travel to vesicles
          ═══════════════════════════════════════════════════ */}
          {CA_IONS.map((ion, i) => {
            const delay = i * 0.1;
            const t = clamp01((caIonProg - delay) / (1 - delay * 0.5));
            if (t <= 0) return null;
            const cx = lerp(ion.sx, ion.ex, t);
            const cy = lerp(ion.sy, ion.ey, t);
            // slightly wavy path
            const wobble = Math.sin(t * Math.PI * 2.5 + i) * 5;
            return (
              <g key={ion.id} opacity={stageNum === 3 ? clamp01(t * 4) : 0}>
                <circle cx={cx + wobble} cy={cy} r={6} fill="url(#caGrad)" filter="url(#glow-g)"/>
                <circle cx={cx + wobble - 2} cy={cy - 2} r={2} fill="rgba(255,255,255,0.45)"/>
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              RESERVE VESICLES (inside terminal, not at membrane)
          ═══════════════════════════════════════════════════ */}
          {RESERVE.map((v) => (
            <g key={v.id} opacity={stageNum >= 4 ? lerp(0.7, 0.1, ep) : 0.65}>
              <circle cx={v.cx} cy={v.cy} r={v.r} fill="url(#vesGrad)" opacity="0.65"/>
              <circle cx={v.cx - v.r * 0.35} cy={v.cy - v.r * 0.35} r={v.r * 0.3} fill="rgba(255,255,255,0.28)"/>
            </g>
          ))}

          {/* ═══════════════════════════════════════════════════
              DOCKED VESICLES — at active zone
              Stage 4: omega-shape fusion → membrane pore
          ═══════════════════════════════════════════════════ */}
          {DOCKED.map((v, vi) => {
            const vFuse  = stageNum === 4 ? clamp01((fuseProg - vi * 0.12) / 0.6) : fuseProg > 0 ? 1 : 0;
            const thisOpen = vFuse > 0 ? lerp(0, 82, vFuse) : 0;
            const thisVis  = stageNum < 4 ? 1 : stageNum === 4 ? lerp(1, 0.05, vFuse) : 0;
            if (thisVis <= 0.02) return null;
            return (
              <g key={v.id} opacity={thisVis}>
                {/* Vesicle body as partial arc (omega when fusing) */}
                <path
                  d={vesicleArcPath(v.cx, v.cy, v.r, thisOpen)}
                  fill="url(#vesGrad)"
                  stroke="rgba(165,180,252,0.5)"
                  strokeWidth="1"
                  filter="url(#glow-b)"
                />
                {/* Highlight spot */}
                <circle cx={v.cx - 4} cy={v.cy - 4} r={3.5} fill="rgba(255,255,255,0.3)"/>
                {/* Inner NT dots */}
                {[0, 72, 144, 216, 288].map((ang) => (
                  <circle key={ang}
                    cx={v.cx + 6 * Math.cos((ang * Math.PI) / 180)}
                    cy={v.cy + 6 * Math.sin((ang * Math.PI) / 180)}
                    r={1.5} fill="rgba(147,197,253,0.7)"
                  />
                ))}
              </g>
            );
          })}

          {/* Stage 4: Fusion pore at membrane (omega opening) */}
          {stageNum === 4 && DOCKED.map((v, vi) => {
            const vFuse = clamp01((fuseProg - vi * 0.12) / 0.6);
            if (vFuse < 0.15) return null;
            const poreW = lerp(0, v.r * 1.4, vFuse);
            return (
              <g key={`pore-${v.id}`} opacity={vFuse}>
                {/* pore opening in membrane — bright glow */}
                <ellipse cx={v.cx} cy={v.cy + v.r - 2} rx={poreW} ry={4}
                  fill="rgba(99,102,241,0.6)" filter="url(#glow-b)"/>
                <ellipse cx={v.cx} cy={v.cy + v.r - 2} rx={poreW * 0.6} ry={2.5}
                  fill="rgba(196,181,253,0.8)"/>
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              PRE-SYNAPTIC ACTIVE ZONE (membrane line)
          ═══════════════════════════════════════════════════ */}
          <path
            d="M 104,355 Q 240,372 376,355"
            fill="none"
            stroke={
              stageNum === 4 ? `rgba(99,102,241,${0.4 + fuseProg * 0.4})` :
              stageNum === 5 ? 'rgba(99,102,241,0.4)' :
              'rgba(99,102,241,0.35)'
            }
            strokeWidth="2.8"
            strokeLinecap="round"
          />

          {/* ═══════════════════════════════════════════════════
              SYNAPTIC CLEFT
          ═══════════════════════════════════════════════════ */}
          <rect x="70" y="365" width="340" height="80" fill="rgba(4,28,50,0.55)"/>
          <text x={CX} y="385" textAnchor="middle" fontSize="7"
            fill="rgba(148,163,184,0.3)" fontFamily="Inter">Synaptic Cleft (~20 nm)</text>

          {/* NT molecules — Phase 1: float to cleft centre (stage 4)
                          Phase 2: navigate to receptors   (stage 5) */}
          {NT_MOLS.map((nt) => {
            let ntCx: number, ntCy: number, ntOpac: number;
            if (stageNum === 4) {
              const t = clamp01((ntProg - nt.delay1) / Math.max(0.01, 1 - nt.delay1));
              if (t <= 0) return null;
              ntCx  = lerp(nt.sx, nt.mx, t);
              ntCy  = lerp(nt.sy, nt.my, t);
              ntOpac = ntOpacity * clamp01(t * 6);
            } else if (stageNum === 5) {
              const t2 = clamp01((ntPhase2Prog - nt.delay2 * 0.6) / Math.max(0.01, 1 - nt.delay2 * 0.6));
              ntCx  = lerp(nt.mx, nt.ex, eio(t2));
              ntCy  = lerp(nt.my, nt.ey, eio(t2));
              // Dissolve into receptor on arrival
              ntOpac = lerp(1, 0, clamp01((t2 - 0.8) / 0.2));
            } else {
              return null;
            }
            return (
              <g key={nt.id} opacity={ntOpac}>
                <circle cx={ntCx} cy={ntCy} r={4.5} fill="url(#ntGrad)" filter="url(#glow-b)"/>
                <circle cx={ntCx - 1.3} cy={ntCy - 1.3} r={1.5} fill="rgba(255,255,255,0.5)"/>
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              POST-SYNAPTIC MEMBRANE — bilayer (outer + inner leaflet)
          ═══════════════════════════════════════════════════ */}
          {/* Outer leaflet */}
          <path
            d="M 70,445 Q 240,430 410,445"
            fill="none"
            stroke={stageNum === 5 ? `rgba(244,114,182,${0.38 + recBound * 0.48})` : 'rgba(52,211,153,0.42)'}
            strokeWidth="3.5"
            strokeLinecap="round"
            filter={stageNum === 5 && recBound > 0.3 ? 'url(#glow-p)' : undefined}
          />
          {/* Inner leaflet */}
          <path
            d="M 78,452 Q 240,438 402,452"
            fill="none"
            stroke={stageNum === 5 ? `rgba(244,114,182,${0.18 + recBound * 0.28})` : 'rgba(52,211,153,0.22)'}
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* ═══════════════════════════════════════════════════
              RECEPTORS — ligand-gated ion channels embedded in
              post-synaptic membrane with extracellular binding
              domain + TM helices + intracellular domain
          ═══════════════════════════════════════════════════ */}
          {RECEPTORS.map((rec, ri) => {
            const bound = stageNum === 5 && recBound > ri * 0.14;
            const bindT = bound ? clamp01((recBound - ri * 0.14) / 0.55) : 0;
            const my    = rec.memY;
            const colS  = bound ? '#f472b6' : 'rgba(52,211,153,0.72)';
            const colF  = bound ? `rgba(244,114,182,${0.45 + bindT * 0.4})` : 'rgba(52,211,153,0.3)';
            return (
              <g key={rec.id} filter={bound && bindT > 0.4 ? 'url(#glow-p)' : undefined}>
                {/* ── Extracellular domain: two arms + binding pocket arc ── */}
                {/* Left arm sweeps up-outward then inward */}
                <path d={`M ${rec.cx-7},${my-3} C ${rec.cx-11},${my-10} ${rec.cx-10},${my-16} ${rec.cx-4},${my-20}`}
                  stroke={colS} strokeWidth="2" fill="none" strokeLinecap="round"/>
                {/* Right arm */}
                <path d={`M ${rec.cx+7},${my-3} C ${rec.cx+11},${my-10} ${rec.cx+10},${my-16} ${rec.cx+4},${my-20}`}
                  stroke={colS} strokeWidth="2" fill="none" strokeLinecap="round"/>
                {/* Binding-pocket top arc */}
                <path d={`M ${rec.cx-4},${my-20} Q ${rec.cx},${my-24} ${rec.cx+4},${my-20}`}
                  stroke={colS} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                {/* Binding pocket fill (glows when NT bound) */}
                {bound && (
                  <ellipse cx={rec.cx} cy={my - 18} rx={4} ry={3}
                    fill={`rgba(244,114,182,${0.4 * bindT})`} filter="url(#glow-p)"/>
                )}

                {/* ── Transmembrane domain: left + right helix blocks ── */}
                <rect x={rec.cx - 10} y={my - 4} width={8} height={13} rx={3}
                  fill={colF} stroke={colS} strokeWidth="1.2"/>
                <rect x={rec.cx +  2} y={my - 4} width={8} height={13} rx={3}
                  fill={colF} stroke={colS} strokeWidth="1.2"/>

                {/* Central ion-channel pore */}
                <rect x={rec.cx - 2} y={my - 2} width={4} height={9} rx={2}
                  fill={bound ? `rgba(244,114,182,${0.35 + bindT * 0.5})` : 'rgba(2,10,25,0.85)'}
                  filter={bound && bindT > 0.5 ? 'url(#glow-p)' : undefined}
                />

                {/* ── Intracellular domain: small stubs into dendrite ── */}
                <rect x={rec.cx - 9} y={my + 9} width={6} height={7} rx={2}
                  fill={bound ? 'rgba(244,114,182,0.32)' : 'rgba(52,211,153,0.18)'}
                  stroke={bound ? 'rgba(244,114,182,0.5)' : 'rgba(52,211,153,0.35)'}
                  strokeWidth="0.8"
                />
                <rect x={rec.cx + 3} y={my + 9} width={6} height={7} rx={2}
                  fill={bound ? 'rgba(244,114,182,0.32)' : 'rgba(52,211,153,0.18)'}
                  stroke={bound ? 'rgba(244,114,182,0.5)' : 'rgba(52,211,153,0.35)'}
                  strokeWidth="0.8"
                />

                {/* Binding flash when NT first arrives */}
                {bound && bindT < 0.45 && (
                  <ellipse cx={rec.cx} cy={my - 18}
                    rx={lerp(2, 10, clamp01(bindT / 0.25))}
                    ry={lerp(2, 10, clamp01(bindT / 0.25))}
                    fill="rgba(244,114,182,0.7)" filter="url(#glow-p)"
                    opacity={lerp(1, 0, bindT / 0.45)}
                  />
                )}
              </g>
            );
          })}

          {/* POST-SYNAPTIC DENDRITE BODY */}
          <ellipse cx={CX} cy={530} rx={157} ry={84}
            fill="url(#postGrad)"
            stroke={stageNum === 5 ? `rgba(244,114,182,${recBound * 0.42})` : 'rgba(52,211,153,0.18)'}
            strokeWidth="1.5"
          />
          <text x={CX} y="538" textAnchor="middle" fontSize="8.5"
            fill="rgba(110,231,183,0.38)" fontFamily="Inter">Post-synaptic Dendrite</text>

          {/* ═══════════════════════════════════════════════════
              STAGE 5 — post-synaptic AP wave (yellow particles)
          ═══════════════════════════════════════════════════ */}
          {renderPostWave(postWave, postWaveProg)}

          {/* Post-synaptic ripple ring when AP fires */}
          {stageNum === 5 && recBound > 0.5 && (
            <ellipse cx={CX} cy={540}
              rx={lerp(12, 130, clamp01((recBound - 0.5) / 0.5))}
              ry={lerp(4,  32, clamp01((recBound - 0.5) / 0.5))}
              fill="none"
              stroke="rgba(244,114,182,0.55)"
              strokeWidth="2"
              opacity={lerp(1, 0.05, clamp01((recBound - 0.5) / 0.5))}
              filter="url(#glow-p)"
            />
          )}

          {/* Stage 5 annotation */}
          {stageNum === 5 && recBound > 0.5 && (
            <g opacity={clamp01((recBound - 0.5) * 4)}>
              <line x1="395" y1="540" x2="425" y2="525" stroke="rgba(251,191,36,0.4)" strokeWidth="1" strokeDasharray="3 2"/>
              <text x="428" y="523" fontSize="7.5" fill="rgba(251,191,36,0.75)" fontFamily="Inter">New AP</text>
            </g>
          )}
        </svg>
      </div>

      {/* ── RIGHT: Info + Controls panel ──────────────────────── */}
      <div className="flex flex-col min-h-0 overflow-hidden"
        style={{ width: 330, minWidth: 330, background: 'rgba(255,255,255,0.022)', borderLeft: '1px solid rgba(255,255,255,0.055)' }}>

        {/* Scrollable top section */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px 16px' }}>
          <div className="text-xs font-semibold tracking-widest uppercase mb-1 transition-colors duration-500"
            style={{ color: stage.color }}>Neuroscience · Microscopic</div>
          <h1 className="text-xl font-bold text-white/90 leading-snug mb-6">
            Synaptic<br />Transmission
          </h1>

          {/* Stage list */}
          <div className="flex flex-col gap-1 mb-6">
            {STAGES.map((s, i) => {
              const active = i === si;
              const done   = i < si;
              return (
                <button key={s.id} onClick={() => goTo(i)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                  style={{
                    background: active ? `${s.color}16` : 'transparent',
                    border: active ? `1px solid ${s.color}40` : '1px solid transparent',
                  }}>
                  <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                    style={{
                      background: active ? s.color : done ? `${s.color}35` : 'rgba(255,255,255,0.06)',
                      color: active ? '#fff' : done ? s.color : 'rgba(255,255,255,0.3)',
                    }}>
                    {s.id}
                  </div>
                  <span className="text-sm font-medium transition-colors duration-200"
                    style={{ color: active ? 'rgba(255,255,255,0.9)' : done ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.3)' }}>
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Description card */}
          <div className="rounded-xl p-4 transition-all duration-500"
            style={{ background: `${stage.color}0c`, border: `1px solid ${stage.color}26` }}>
            <div className="text-xs font-semibold mb-1.5 transition-colors duration-500" style={{ color: stage.color }}>
              Stage {stageNum} of {STAGES.length}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {stage.desc}
            </p>
            {/* progress bar */}
            <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="h-full rounded-full transition-none"
                style={{ width: `${p * 100}%`, background: stage.color, boxShadow: `0 0 8px ${stage.color}88` }}/>
            </div>
          </div>
        </div>

        {/* Playback controls — pinned to bottom, never cropped */}
        <div className="flex-shrink-0" style={{ padding: '16px 24px 24px', borderTop: '1px solid rgba(255,255,255,0.055)' }}>
          {/* Keyboard hint */}
          <div className="flex items-center justify-center gap-3 mb-3">
            {[['Space', 'Play/Pause'], ['←→', 'Step']].map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.22)' }}>
                <kbd className="px-1.5 py-0.5 rounded text-xs font-mono"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.35)' }}>
                  {key}
                </kbd>
                {label}
              </span>
            ))}
          </div>
          {/* Speed selector */}
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs mr-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Speed</span>
            {([0.5, 1, 1.5, 2] as const).map((s) => (
              <button key={s} onClick={() => setSpeed(s)}
                className="flex-1 h-7 rounded-lg text-xs font-semibold transition-all duration-200"
                style={{
                  background: speed === s ? `${stage.color}28` : 'rgba(255,255,255,0.04)',
                  border: speed === s ? `1px solid ${stage.color}60` : '1px solid rgba(255,255,255,0.07)',
                  color: speed === s ? stage.color : 'rgba(255,255,255,0.35)',
                }}>
                {s}×
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.28)' }}>{si + 1} / {STAGES.length}</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.28)' }}>{Math.round(p * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => goTo(0)}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <RotateCcw size={13} style={{ color: 'rgba(255,255,255,0.45)' }}/>
            </button>
            <button onClick={() => si > 0 && goTo(si - 1)} disabled={si === 0}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-25"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <ChevronLeft size={16} style={{ color: 'rgba(255,255,255,0.55)' }}/>
            </button>
            <button onClick={() => setPlaying((x) => !x)}
              className="flex-1 h-10 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all duration-300"
              style={{ background: `linear-gradient(135deg, ${stage.accent}, ${stage.color})`, color: '#fff', boxShadow: `0 4px 18px ${stage.color}50` }}>
              {playing ? <Pause size={15}/> : <Play size={15} className="ml-0.5"/>}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button onClick={() => si < STAGES.length - 1 && goTo(si + 1)} disabled={si === STAGES.length - 1}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-25"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.55)' }}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
