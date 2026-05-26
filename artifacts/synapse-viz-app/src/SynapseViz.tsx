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
  { id: 1, name: 'Resting State',            color: '#818cf8', accent: '#6366f1',
    desc: 'The neuron is at rest. Tiny sacs called synaptic vesicles, filled with chemical messengers (neurotransmitters), are lined up and ready at the end of the axon. The gated channels on the walls are shut.',
    fact: 'A single neuron can receive signals from up to 10,000 other neurons at the same time!' },
  { id: 2, name: 'Action Potential',          color: '#fbbf24', accent: '#f59e0b',
    desc: 'An electrical signal called an action potential travels like a wave down the axon toward the axon terminal. This is what scientists mean when they say a neuron is "firing".',
    fact: 'Nerve signals can travel at up to 120 metres per second — faster than a car on a motorway!' },
  { id: 3, name: 'Calcium Ions Enter',        color: '#34d399', accent: '#10b981',
    desc: 'The electrical signal forces open special gates called calcium ion channels in the axon wall. Calcium ions (Ca²⁺) rush inside and push the vesicles toward the membrane, getting ready for release.',
    fact: 'Calcium is the trigger — without it, no chemical signal can cross the synapse at all.' },
  { id: 4, name: 'Neurotransmitters Released', color: '#60a5fa', accent: '#3b82f6',
    desc: 'The vesicles merge with the axon membrane and burst open, releasing neurotransmitters into the synaptic cleft. The molecules drift across this tiny fluid-filled gap.',
    fact: 'The synaptic cleft is only 20 nanometres wide — about 5,000 times thinner than a human hair!' },
  { id: 5, name: 'Receptor Binding',          color: '#f472b6', accent: '#ec4899',
    desc: 'Neurotransmitters lock onto receptors on the receiving neuron — like a key fitting a lock. This opens the receptor\'s ion channel and starts a brand new electrical signal in that neuron.',
    fact: 'After binding, neurotransmitters are either broken down by enzymes or recycled back into the sending neuron.' },
];

/* ─── coordinate constants ─────────────────────────────────────── */
// ViewBox 480 × 640 – microscopic close-up
const CX = 240;           // horizontal center

// Pre-synaptic terminal: one continuous organic path
// Axon section: y 0→120, width ≈ 54 px (CX ± 27)
// Bouton widens: y 120→320, max half-width ≈ 138 px
// Pre-synaptic active zone (membrane): y ≈ 325

// Vesicle positions along the active zone curve
// Docked vesicles sit ~20 px away from the membrane so Ca²⁺ travel path is visible
const DOCKED = [
  { id: 'd0', cx: 148, cy: 298, r: 13 },
  { id: 'd1', cx: 188, cy: 308, r: 13 },
  { id: 'd2', cx: 240, cy: 312, r: 13 },
  { id: 'd3', cx: 292, cy: 308, r: 13 },
  { id: 'd4', cx: 332, cy: 298, r: 13 },
];

// Reserve vesicles — sitting in the cytoplasmic pool above the active zone.
// Slightly smaller and dimmer than docked; move toward active zone during exocytosis.
const RESERVE = [
  { id: 'rv0', cx: 168, cy: 258, r: 10 },
  { id: 'rv1', cx: 204, cy: 244, r: 10 },
  { id: 'rv2', cx: 276, cy: 244, r: 10 },
  { id: 'rv3', cx: 312, cy: 258, r: 10 },
  { id: 'rv4', cx: 148, cy: 279, r:  9 },
  { id: 'rv5', cx: 332, cy: 275, r:  9 },
];

// Ca²⁺ channels — 2 per side (4 total), positioned along the natural bouton wall contour
// ang = wall tangent angle from vertical (°); side determines inward direction
const CA_CHANNELS = [
  { id: 'cl2', cx: 114, cy: 210, ang:  28, side: 'L' as const },
  { id: 'cr2', cx: 366, cy: 210, ang: -28, side: 'R' as const },
];

// Ca²⁺ ions waiting OUTSIDE the terminal before channels open
const CA_IONS_OUTSIDE = [
  { id: 'co0', cx: 81,  cy: 200 }, { id: 'co1', cx: 69,  cy: 220 },
  { id: 'co2', cx: 73,  cy: 246 },
  { id: 'co6', cx: 399, cy: 200 }, { id: 'co7', cx: 411, cy: 220 },
  { id: 'co8', cx: 407, cy: 246 },
];

// Ca²⁺ ion travel paths: from OUTSIDE → through channel → nearest docked vesicle
const CA_IONS = [
  { id: 'ci0', sx: 81,  sy: 200, ex: 185, ey: 296 },
  { id: 'ci1', sx: 69,  sy: 246, ex: 215, ey: 306 },
  { id: 'ci3', sx: 399, sy: 200, ex: 295, ey: 296 },
  { id: 'ci4', sx: 411, sy: 246, ex: 265, ey: 306 },
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

// NT molecules: two-phase journey — 2 per vesicle (10 total), equally spaced
//   Phase 1 (stage 4): pore → cleft midpoint  (sx,sy) → (mx,my)
//   Phase 2 (stage 5): cleft midpoint → matching receptor  (mx,my) → (ex,ey)
const NT_MOLS = DOCKED.flatMap((v, vi) =>
  [0, 1].map((k) => {
    const side = k === 0 ? -1 : 1;           // -1 = left,  +1 = right
    return {
      id: `nt-${vi}-${k}`,
      sx: v.cx + side * 5,                   // release point: ±5 px — pairs stay close
      sy: 373,
      mx: v.cx + side * 6,                   // cleft pause: ±6 px — tight pairs, clear spacing between pairs
      my: 386,
      ex: RECEPTORS[vi].cx + side * 9,       // dock into Y-arm lobe tip (matches smaller receptor)
      ey: RECEPTORS[vi].memY - 22,
      delay1: vi * 0.09 + k * 0.05,
      delay2: vi * 0.12 + k * 0.06,
    };
  })
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

// Deterministic animation clock — feeds performance.now() through React state
// so renders are reproducible across concurrent-mode double-invocations
function useAnimTime() {
  const [t, setT] = useState(() => performance.now());
  const rafRef = useRef<number>(0);
  useEffect(() => {
    const tick = (now: number) => { setT(now); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
  return t;
}

// Particles that stream through open Ca²⁺ channel pores (Stage 3)
// Returns 5 staggered offsets (0→1 = outside→inside through pore)
function useCaStream(active: boolean) {
  const [offsets, setOffsets] = useState<number[]>(() =>
    Array.from({ length: 5 }, (_, i) => i / 5)
  );
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!active) { cancelAnimationFrame(rafRef.current); return; }
    const tick = (now: number) => {
      const dt = now - (lastRef.current || now);
      lastRef.current = now;
      setOffsets((prev) => prev.map((v) => (v + dt / 520) % 1));
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
  const [neuronTip, setNeuronTip] = useState<{ label: string; desc: string } | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const siRef  = useRef(si);
  siRef.current = si;

  const stage = STAGES[si];
  const stageNum = si + 1;
  const p = Math.min(prog, 1);
  const ep = eio(p);

  // Wave particles
  const postActive = stageNum === 5;
  const axonWave   = useWaveParticles(7, stageNum >= 2 && stageNum <= 2);
  const termWave   = useWaveParticles(5, stageNum === 2 && ep > 0.5);
  const postWave   = useWaveParticles(7, stageNum === 5 && ep > 0.4);
  // Ca²⁺ stream particles through open pores (Stage 3)
  // Note: caOpen is not yet defined here — gate visibility in render via gapPx instead
  const caStream   = useCaStream(stageNum === 3);
  // Deterministic time for pulse/wobble effects (replaces Date.now() in render)
  const animTime   = useAnimTime();

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

  /* ── helper: membrane Y at a given cx ──────────────────────── */
  // Active zone bezier: M 120,355 Q 240,372 360,355
  // x is linear in t → t = (cx-120)/240
  // y = 355 + 34·t·(1-t)
  function membraneY(cx: number): number {
    const t = (cx - 120) / 240;
    return 355 + 34 * t * (1 - t);
  }

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
          {/* Main fill — lower walls curve organically inward to the active zone
              at x=120 (left) and x=360 (right), giving the bouton a natural bulb shape */}
          <path
            d={`
              M 213,0
              C 210,65  116,148  104,245
              C  98,300  108,345  120,355
              Q 240,372 360,355
              C 372,345  382,300  376,245
              C 364,148  270,65  267,0
              Z
            `}
            fill="url(#preGrad)"
          />
          {/* Sides + top outline — curves match fill path, meeting the active-zone
              line at (120,355) left and (360,355) right for one seamless membrane */}
          <path
            d="M 120,355 C 108,345 98,300 104,245 C 116,148 210,65 213,0 L 267,0 C 270,65 364,148 376,245 C 382,300 372,345 360,355"
            fill="none"
            stroke={
              stageNum === 2 ? `rgba(251,191,36,${lerp(0.18, 0.55, apFront)})` :
              stageNum === 5 ? `rgba(99,102,241,0.2)` :
              'rgba(99,102,241,0.18)'
            }
            strokeWidth="1.8"
            strokeLinecap="round"
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

          {/* ── Single centred Mitochondrion — well inside the bouton ── */}
          {(() => {
            const MCX = 240, MCY = 162;
            const mitoGlow = stageNum >= 3 ? clamp01(caOpen * 1.6) : 0;
            return (
              <g opacity={0.84}>
                {/* Energy glow halo — brightens during Stage 3 */}
                {mitoGlow > 0.05 && (
                  <ellipse cx={MCX} cy={MCY} rx={34} ry={18}
                    fill={`rgba(245,158,11,${mitoGlow * 0.16})`}
                    filter="url(#glow-y)"/>
                )}
                {/* Outer membrane */}
                <ellipse cx={MCX} cy={MCY} rx={26} ry={13}
                  fill="rgba(245,158,11,0.09)"
                  stroke={mitoGlow > 0.1
                    ? `rgba(245,158,11,${0.52 + mitoGlow * 0.36})`
                    : 'rgba(245,158,11,0.52)'}
                  strokeWidth="1.4"
                  filter={mitoGlow > 0.4 ? 'url(#glow-y)' : undefined}/>
                {/* Intermembrane space ring */}
                <ellipse cx={MCX} cy={MCY} rx={22} ry={10.5}
                  fill="none"
                  stroke="rgba(251,191,36,0.09)" strokeWidth="3"/>
                {/* Matrix — dark fill */}
                <ellipse cx={MCX} cy={MCY} rx={19} ry={8.5}
                  fill="rgba(12,8,3,0.60)"/>
                {/* Inner membrane */}
                <ellipse cx={MCX} cy={MCY} rx={19} ry={8.5}
                  fill="none"
                  stroke="rgba(251,191,36,0.34)" strokeWidth="0.9"/>
                {/* Cristae — 4 alternating curved folds (top / bottom) */}
                <path d={`M ${MCX-9},${MCY-8.3} Q ${MCX-9},${MCY-2} ${MCX-6},${MCY+1}`}
                  stroke="rgba(251,191,36,0.44)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
                <path d={`M ${MCX-2},${MCY+8.3} Q ${MCX-2},${MCY+2} ${MCX+1},${MCY-1}`}
                  stroke="rgba(251,191,36,0.40)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
                <path d={`M ${MCX+5},${MCY-8.3} Q ${MCX+5},${MCY-2} ${MCX+8},${MCY+1}`}
                  stroke="rgba(251,191,36,0.44)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
                <path d={`M ${MCX+12},${MCY+8.3} Q ${MCX+12},${MCY+2} ${MCX+15},${MCY-1}`}
                  stroke="rgba(251,191,36,0.40)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
                {/* Label */}
                <text x={MCX} y={MCY + 22} textAnchor="middle"
                  fontSize="5.5" fontFamily="Inter"
                  fill={mitoGlow > 0.1
                    ? `rgba(251,191,36,${0.34 + mitoGlow * 0.44})`
                    : 'rgba(251,191,36,0.30)'}>
                  Mitochondrion
                </text>
              </g>
            );
          })()}

          {/* "Pre-synaptic Terminal" label */}
          <text x={CX} y="200" textAnchor="middle" fontSize="8.5"
            fill="rgba(165,180,252,0.38)" fontFamily="Inter">Pre-synaptic Bouton</text>
          <text x={CX} y="175" textAnchor="middle" fontSize="7.5"
            fill="rgba(165,180,252,0.25)" fontFamily="Inter">Axon Terminal</text>

          {/* ── Axon label (upper narrow section) ── */}
          <text x={CX} y="42" textAnchor="middle" fontSize="8"
            fill="rgba(147,197,253,0.4)" fontFamily="Inter">Axon</text>

          {/* ── Structure callout: Synaptic Vesicles — above the reserve pool ── */}
          <line x1="240" y1="241" x2="240" y2="228" stroke="rgba(165,180,252,0.45)" strokeWidth="0.8" strokeDasharray="3,2"/>
          <text x="240" y="224" textAnchor="middle" fontSize="8.5" fill="rgba(165,180,252,0.78)" fontFamily="Inter">Synaptic Vesicles</text>

          {/* ── Structure callout: Receptors (always visible) ── */}
          <line x1="338" y1="440" x2="365" y2="428" stroke="rgba(52,211,153,0.3)" strokeWidth="0.8" strokeDasharray="3,2"/>
          <text x="368" y="426" fontSize="7.5" fill="rgba(52,211,153,0.45)" fontFamily="Inter">Receptors</text>

          {/* ── Structure callout: Neurotransmitters (visible in stage 4+5) ── */}
          {(stageNum === 4 || stageNum === 5) && (
            <>
              <line x1="172" y1="390" x2="100" y2="403" stroke="rgba(96,165,250,0.35)" strokeWidth="0.8" strokeDasharray="3,2"/>
              <text x="34" y="401" fontSize="7.5" fill="rgba(96,165,250,0.55)" fontFamily="Inter">Neuro-</text>
              <text x="34" y="410" fontSize="7.5" fill="rgba(96,165,250,0.55)" fontFamily="Inter">transmitters</text>
            </>
          )}


          {/* ═══════════════════════════════════════════════════
              STAGE 2 — Action Potential wave down axon
          ═══════════════════════════════════════════════════ */}
          {stageNum === 2 && renderAxonWave(axonWave)}
          {stageNum === 2 && renderTerminalWave(termWave, apFront)}

          {/* ── Stage 2: Signal speed indicator (top-right extracellular space) ── */}
          {stageNum === 2 && apFront > 0.06 && (() => {
            const fadeIn  = Math.min(1, apFront * 6);
            const speedMs = Math.round(lerp(12, 120, apFront));
            return (
              <g opacity={fadeIn}>
                <rect x={394} y={10} width={80} height={36} rx={7}
                  fill="rgba(251,191,36,0.08)"
                  stroke="rgba(251,191,36,0.38)" strokeWidth="0.85"/>
                <text x={434} y={25} textAnchor="middle"
                  fontSize="5.5" fontFamily="Inter" fontWeight="600"
                  fill="rgba(251,191,36,0.52)" letterSpacing="0.06em">
                  SIGNAL SPEED
                </text>
                <text x={434} y={39} textAnchor="middle"
                  fontSize="11" fontFamily="Inter" fontWeight="700"
                  fill="rgba(251,191,36,0.92)" filter="url(#glow-y)">
                  ~{speedMs} m/s
                </text>
              </g>
            );
          })()}

          {/* ═══════════════════════════════════════════════════
              Ca²⁺ CHANNELS on the SIDES of terminal
              (NOT on the active zone at the bottom)
          ═══════════════════════════════════════════════════ */}
          {/* ── Ca²⁺ channels — rotated to follow bouton wall contour ── */}
          {CA_CHANNELS.map((ch, i) => {
            const sideIdx = i % 2;
            const isOpen  = stageNum >= 3 && caOpen > sideIdx * 0.35;
            const gapPx   = isOpen ? lerp(0, 10, clamp01((caOpen - sideIdx * 0.35) / 0.65)) : 0;
            const isL     = ch.side === 'L';
            const dx      = isL ? 1 : -1;   // +1 = right (inward for L), -1 = left (inward for R)
            return (
              <g key={ch.id}>
                {/* Rotate entire channel group to follow wall tangent */}
                <g transform={`rotate(${ch.ang}, ${ch.cx}, ${ch.cy})`}>
                  {/* Membrane slot — thin strip anchoring channel in wall */}
                  <rect x={ch.cx - 3} y={ch.cy - 12} width={5} height={24} rx={2}
                    fill={isOpen ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.18)'}
                    stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.32)'}
                    strokeWidth="0.8"
                  />
                  {/* Upper gate half — slides away along wall tangent when open */}
                  <rect x={ch.cx - 8} y={ch.cy - gapPx - 9} width={16} height={9} rx={3}
                    fill={isOpen ? 'rgba(52,211,153,0.22)' : 'rgba(99,102,241,0.1)'}
                    stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.38)'}
                    strokeWidth="1.3"
                    filter={isOpen ? 'url(#glow-g)' : undefined}
                  />
                  {/* TM-helix accent — upper */}
                  <rect x={ch.cx - 1} y={ch.cy - gapPx - 9} width={4} height={9} rx={2}
                    fill={isOpen ? 'rgba(52,211,153,0.55)' : 'rgba(99,102,241,0.3)'}
                  />
                  {/* Lower gate half — slides away */}
                  <rect x={ch.cx - 8} y={ch.cy + gapPx} width={16} height={9} rx={3}
                    fill={isOpen ? 'rgba(52,211,153,0.22)' : 'rgba(99,102,241,0.1)'}
                    stroke={isOpen ? '#34d399' : 'rgba(99,102,241,0.38)'}
                    strokeWidth="1.3"
                    filter={isOpen ? 'url(#glow-g)' : undefined}
                  />
                  {/* TM-helix accent — lower */}
                  <rect x={ch.cx - 1} y={ch.cy + gapPx} width={4} height={9} rx={2}
                    fill={isOpen ? 'rgba(52,211,153,0.55)' : 'rgba(99,102,241,0.3)'}
                  />
                  {/* Pore — visible open gap with bright glow */}
                  {isOpen && gapPx > 1 && (
                    <ellipse cx={ch.cx} cy={ch.cy} rx={5.5} ry={gapPx + 2}
                      fill="rgba(52,211,153,0.65)" filter="url(#glow-g)" />
                  )}
                  {/* Ca²⁺ streaming particles through pore — travel inward along local x-axis */}
                  {isOpen && gapPx > 3 && caStream.map((baseOffset, k) => {
                    const t = (baseOffset + i * 0.13 + k * 0.22) % 1;
                    // travel: enter just outside wall → pass through pore → ~30px inside
                    const px = ch.cx + dx * lerp(-16, 30, t);
                    const py = ch.cy + Math.sin(t * Math.PI * 2 + k) * 1.6;
                    // fade in quickly, stay bright, fade out at far end
                    const op = t < 0.15 ? t / 0.15 : t > 0.82 ? (1 - t) / 0.18 : 1;
                    // only show particle when it is inside the pore gap zone (around center)
                    const inPore = t > 0.25 && t < 0.62;
                    const r = inPore ? 2.8 : 2.2;
                    return (
                      <circle key={k} cx={px} cy={py} r={r}
                        fill={inPore ? '#a7f3d0' : '#34d399'}
                        opacity={op * clamp01((gapPx - 3) / 7) * 0.9}
                        filter="url(#glow-g)"
                      />
                    );
                  })}
                  {/* Inward-flow arrows inside the rotated frame */}
                  {isOpen && gapPx > 4 && (() => {
                    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(animTime / 350 + i * 1.1));
                    const a1 = ch.cx + dx * 16;
                    const a2 = ch.cx + dx * 25;
                    return (
                      <g opacity={pulse * clamp01((gapPx - 4) / 6)} filter="url(#glow-g)">
                        <polygon points={`${a1 - dx * 7},${ch.cy - 3.5} ${a1},${ch.cy} ${a1 - dx * 7},${ch.cy + 3.5}`}
                          fill="#34d399" />
                        <polygon points={`${a2 - dx * 7},${ch.cy - 3.5} ${a2},${ch.cy} ${a2 - dx * 7},${ch.cy + 3.5}`}
                          fill="#34d399" opacity="0.55" />
                      </g>
                    );
                  })()}
                </g>
                {/* Ca²⁺ label — rendered outside rotation to stay readable */}
                {isOpen && gapPx > 3 && (
                  <text
                    x={isL ? ch.cx + 22 : ch.cx - 22} y={ch.cy + 3}
                    textAnchor={isL ? 'start' : 'end'} fontSize="5.5"
                    fill="#6ee7b7" fontFamily="Inter" fontWeight="700"
                    filter="url(#glow-g)">Ca²⁺</text>
                )}
              </g>
            );
          })}

          {/* Ca²⁺ channel label — stage 3 */}
          {stageNum === 3 && caOpen > 0.5 && (
            <g opacity={clamp01((caOpen - 0.5) * 4)}>
              <line x1="102" y1="252" x2="60" y2="240" stroke="rgba(52,211,153,0.4)" strokeWidth="1" strokeDasharray="3 2"/>
              <text x="58" y="237" textAnchor="end" fontSize="7.5" fill="rgba(52,211,153,0.7)" fontFamily="Inter">Ca²⁺ channels</text>
              <text x="58" y="247" textAnchor="end" fontSize="7" fill="rgba(52,211,153,0.5)" fontFamily="Inter">(lateral walls)</text>
            </g>
          )}

          {/* Mitochondria callout — stage 3, leader from centred mito right edge */}
          {stageNum === 3 && caOpen > 0.25 && (
            <g opacity={clamp01((caOpen - 0.25) * 3.5)}>
              <line x1="266" y1="157" x2="360" y2="136"
                stroke="rgba(245,158,11,0.38)" strokeWidth="0.9" strokeDasharray="3 2"/>
              <text x="362" y="132" textAnchor="start" fontSize="7.5"
                fill="rgba(245,158,11,0.78)" fontFamily="Inter" fontWeight="600">Mitochondrion</text>
              <text x="362" y="142" textAnchor="start" fontSize="6.5"
                fill="rgba(245,158,11,0.48)" fontFamily="Inter">supplies ATP energy</text>
              <text x="362" y="151" textAnchor="start" fontSize="6.5"
                fill="rgba(245,158,11,0.38)" fontFamily="Inter">for vesicle docking</text>
            </g>
          )}

          {/* ── Stage 3: ATP molecules travelling from mito to vesicle pools ── */}
          {stageNum === 3 && prog > 0.04 && (() => {
            const MCX = 240, MCY = 162;
            // Two targets — left & right reserve-vesicle clusters
            const streams: { ctrlX: number; ctrlY: number; endX: number; endY: number; phase: number }[] = [
              { ctrlX: 185, ctrlY: 215, endX: 188, endY: 294, phase: 0      },
              { ctrlX: 295, ctrlY: 215, endX: 292, endY: 294, phase: 0.33   },
              { ctrlX: 185, ctrlY: 215, endX: 188, endY: 294, phase: 0.66   },
              { ctrlX: 295, ctrlY: 215, endX: 292, endY: 294, phase: 0.17   },
            ];
            return streams.map((s, i) => {
              const raw = ((prog * 3.5) + s.phase) % 1;   // 3.5 waves per stage
              const t   = raw * raw * (3 - 2 * raw);       // smoothstep
              const fadeOp = Math.sin(raw * Math.PI) * 0.9;
              if (fadeOp < 0.06) return null;
              // Quadratic bezier: P = (1-t)²·Start + 2t(1-t)·Ctrl + t²·End
              const u = 1 - t;
              const px = u*u*MCX + 2*u*t*s.ctrlX + t*t*s.endX;
              const py = u*u*MCY + 2*u*t*s.ctrlY + t*t*s.endY;
              return (
                <g key={`atp-${i}`} opacity={fadeOp}>
                  <circle cx={px} cy={py} r={6.5}
                    fill="rgba(245,158,11,0.18)"
                    stroke="rgba(245,158,11,0.72)" strokeWidth="1.1"
                    filter="url(#glow-y)"/>
                  <text x={px} y={py + 2.2} textAnchor="middle"
                    fontSize="4.8" fontFamily="Inter" fontWeight="800"
                    fill="rgba(245,158,11,0.95)">ATP</text>
                </g>
              );
            });
          })()}

          {/* ═══════════════════════════════════════════════════
              EXTRACELLULAR / INTRACELLULAR SPATIAL LABELS
          ═══════════════════════════════════════════════════ */}
          {(() => {
            const highlight = stageNum === 3 ? clamp01(caOpen * 2) : 0;
            const baseOp = 0.28 + 0.55 * highlight;
            const accentCol = `rgba(52,211,153,${baseOp})`;
            const labelCol  = `rgba(148,163,184,${0.30 + 0.45 * highlight})`;
            return (
              <g fontFamily="Inter">
                {/* ── LEFT: Extracellular bracket + label ── */}
                <line x1="56" y1="195" x2="56" y2="355"
                  stroke={accentCol} strokeWidth="1" strokeDasharray="3 2"/>
                <line x1="56" y1="195" x2="62" y2="195" stroke={accentCol} strokeWidth="1"/>
                <line x1="56" y1="355" x2="62" y2="355" stroke={accentCol} strokeWidth="1"/>
                <text x="53" y="278" textAnchor="middle" fontSize="7.5" fontWeight="600"
                  fill={accentCol} transform="rotate(-90,53,278)">Extracellular</text>

                {/* ── RIGHT: Extracellular bracket + label ── */}
                <line x1="424" y1="195" x2="424" y2="355"
                  stroke={accentCol} strokeWidth="1" strokeDasharray="3 2"/>
                <line x1="418" y1="195" x2="424" y2="195" stroke={accentCol} strokeWidth="1"/>
                <line x1="418" y1="355" x2="424" y2="355" stroke={accentCol} strokeWidth="1"/>
                <text x="427" y="278" textAnchor="middle" fontSize="7.5" fontWeight="600"
                  fill={accentCol} transform="rotate(90,427,278)">Extracellular</text>

                {/* ── INSIDE: Intracellular label — placed between reserve & docked layers ── */}
                <text x="240" y="290" textAnchor="middle" fontSize="7.5" fontWeight="600"
                  fill={labelCol}>Intracellular</text>
                <line x1="195" y1="293" x2="222" y2="293"
                  stroke={`rgba(148,163,184,${0.15 + 0.25 * highlight})`} strokeWidth="0.8" strokeDasharray="2 2"/>
                <line x1="258" y1="293" x2="285" y2="293"
                  stroke={`rgba(148,163,184,${0.15 + 0.25 * highlight})`} strokeWidth="0.8" strokeDasharray="2 2"/>
              </g>
            );
          })()}

          {/* ═══════════════════════════════════════════════════
              Ca²⁺ IONS WAITING OUTSIDE — visible before channels open
          ═══════════════════════════════════════════════════ */}
          {CA_IONS_OUTSIDE.map((ion, i) => {
            const wobble = Math.sin(animTime / 900 + i * 1.3) * 2.5;
            const fadeOut = stageNum >= 3 ? clamp01(1 - caIonProg * 3) : 1;
            const fadeIn  = stageNum >= 1 ? 1 : 0;
            if (fadeOut <= 0) return null;
            return (
              <g key={ion.id} opacity={fadeIn * fadeOut * 0.85}>
                <circle cx={ion.cx + wobble * 0.4} cy={ion.cy + wobble} r={5.5} fill="url(#caGrad)" filter="url(#glow-g)"/>
                <circle cx={ion.cx + wobble * 0.4 - 1.5} cy={ion.cy + wobble - 1.5} r={1.8} fill="rgba(255,255,255,0.45)"/>
                <text x={ion.cx + wobble * 0.4} y={ion.cy + wobble + 2.5} textAnchor="middle"
                  fontSize="3.5" fill="white" fontFamily="Inter" fontWeight="700">2+</text>
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              Ca²⁺ ION PARTICLES — enter from OUTSIDE, travel to vesicles
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
              RESERVE VESICLES — cytoplasmic pool above active zone
              Slightly smaller & dimmer than docked.
              Stage 4: drift toward active zone as docked vesicles fuse.
          ═══════════════════════════════════════════════════ */}
          {RESERVE.map((v, vi) => {
            const driftStart = 0.3 + vi * 0.06;
            const driftProg  = stageNum === 4
              ? clamp01((fuseProg - driftStart) / 0.55)
              : stageNum > 4 ? 1 : 0;
            const rvCy = v.cy + lerp(0, 26, eio(driftProg));
            const op   = 0.5 + driftProg * 0.12;
            return (
              <g key={v.id} opacity={op}>
                <circle cx={v.cx} cy={rvCy} r={v.r + 3.5}
                  fill="rgba(99,102,241,0.07)"/>
                <circle cx={v.cx} cy={rvCy} r={v.r}
                  fill="url(#vesGrad)"
                  stroke="rgba(165,180,252,0.32)" strokeWidth="0.8"/>
                <circle
                  cx={v.cx - v.r * 0.3} cy={rvCy - v.r * 0.3}
                  r={v.r * 0.3} fill="rgba(255,255,255,0.17)"/>
                {[0, 120, 240].map((ang) => (
                  <circle key={ang}
                    cx={v.cx + 4.2 * Math.cos((ang * Math.PI) / 180)}
                    cy={rvCy  + 4.2 * Math.sin((ang * Math.PI) / 180)}
                    r={1.2} fill="rgba(147,197,253,0.5)"/>
                ))}
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              DOCKED VESICLES — at active zone
              Stage 4: omega-shape fusion → membrane pore
          ═══════════════════════════════════════════════════ */}
          {DOCKED.map((v, vi) => {
            const vFuse  = stageNum === 4 ? clamp01((fuseProg - vi * 0.08) / 0.6) : fuseProg > 0 ? 1 : 0;
            const thisOpen = vFuse > 0 ? lerp(0, 86, clamp01((vFuse - 0.35) / 0.65)) : 0;
            const thisVis  = stageNum < 4 ? 1 : stageNum === 4 ? lerp(1, 0.0, clamp01((vFuse - 0.6) / 0.4)) : 0;
            if (thisVis <= 0.01) return null;

            // ── Stage 4: vesicle slides DOWN to membrane contact ──
            const memY    = membraneY(v.cx);
            const targetCy = memY - v.r + 1;           // bottom of vesicle just kisses membrane
            const moveProg = stageNum === 4 ? clamp01(vFuse / 0.38) : stageNum > 4 ? 1 : 0;
            const vCy      = lerp(v.cy, targetCy, eio(moveProg));

            // Ca²⁺ binding flash — triggers staggered per vesicle near end of stage 3
            const caBindThresh = 0.55 + vi * 0.07;
            const caBind = stageNum === 3 ? clamp01((caIonProg - caBindThresh) / 0.35) : 0;
            const rippleT   = caBind;
            const rippleR   = v.r + lerp(0, 18, rippleT);
            const rippleOp  = caBind > 0 ? clamp01(Math.sin(rippleT * Math.PI)) * 0.8 : 0;
            const pulse = caBind > 0
              ? 0.35 + 0.65 * Math.abs(Math.sin(animTime / 220 + vi * 0.9))
              : 0;

            return (
              <g key={v.id} opacity={thisVis}>
                {/* Ca²⁺ binding ripple ring */}
                {rippleOp > 0.01 && (
                  <circle cx={v.cx} cy={vCy} r={rippleR}
                    fill="none" stroke={`rgba(52,211,153,${rippleOp})`}
                    strokeWidth="2" filter="url(#glow-g)" />
                )}
                {/* Ca²⁺ binding inner glow */}
                {pulse > 0 && (
                  <circle cx={v.cx} cy={vCy} r={v.r + 3}
                    fill={`rgba(52,211,153,${pulse * 0.25})`} filter="url(#glow-g)" />
                )}
                {/* Vesicle body — circle → omega arc as it fuses */}
                <path
                  d={vesicleArcPath(v.cx, vCy, v.r, thisOpen)}
                  fill="url(#vesGrad)"
                  stroke={caBind > 0.1 ? `rgba(52,211,153,${0.4 + pulse * 0.5})` : 'rgba(165,180,252,0.5)'}
                  strokeWidth="1"
                  filter="url(#glow-b)"
                />
                {/* Highlight spot */}
                <circle cx={v.cx - 4} cy={vCy - 4} r={3.5} fill="rgba(255,255,255,0.3)"/>
                {/* Inner NT dots */}
                {[0, 72, 144, 216, 288].map((ang) => (
                  <circle key={ang}
                    cx={v.cx + 6 * Math.cos((ang * Math.PI) / 180)}
                    cy={vCy  + 6 * Math.sin((ang * Math.PI) / 180)}
                    r={1.5} fill="rgba(147,197,253,0.7)"
                  />
                ))}
                {/* "Ca²⁺" label pop at binding moment */}
                {caBind > 0.15 && caBind < 0.85 && (
                  <text x={v.cx + v.r + 3} y={vCy - v.r - 2}
                    fontSize="6" fontWeight="700" fontFamily="Inter"
                    fill={`rgba(110,231,183,${clamp01(Math.sin(caBind * Math.PI) * 2)})`}
                    filter="url(#glow-g)">Ca²⁺</text>
                )}
              </g>
            );
          })}

          {/* Stage 4: glowing fusion pore PINNED to the membrane surface */}
          {stageNum >= 4 && DOCKED.map((v, vi) => {
            const vFuse = stageNum === 4
              ? clamp01((fuseProg - vi * 0.08) / 0.6)
              : stageNum > 4 ? 1 : 0;
            const poreProg = clamp01((vFuse - 0.3) / 0.7);   // pore opens after vesicle arrives
            if (poreProg <= 0.05) return null;
            const poreY = membraneY(v.cx);
            const poreW = lerp(0, v.r * 1.5, eio(poreProg));
            return (
              <g key={`pore-${v.id}`} opacity={stageNum === 4 ? poreProg : lerp(1, 0, clamp01((ep - 0.7) / 0.3))}>
                <ellipse cx={v.cx} cy={poreY} rx={poreW} ry={5}
                  fill="rgba(99,102,241,0.55)" filter="url(#glow-b)"/>
                <ellipse cx={v.cx} cy={poreY} rx={poreW * 0.55} ry={2.8}
                  fill="rgba(196,181,253,0.85)"/>
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              PRE-SYNAPTIC ACTIVE ZONE (membrane line)
          ═══════════════════════════════════════════════════ */}
          <path
            d="M 120,355 Q 240,372 360,355"
            fill="none"
            stroke={
              stageNum === 4 ? `rgba(99,102,241,${0.4 + fuseProg * 0.4})` :
              stageNum === 5 ? 'rgba(99,102,241,0.4)' :
              'rgba(99,102,241,0.35)'
            }
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* Membrane dissolution — opaque cutout ellipses erase membrane at each fusion site */}
          {stageNum >= 4 && DOCKED.map((v, vi) => {
            const vFuse = stageNum === 4
              ? clamp01((fuseProg - vi * 0.12) / 0.6)
              : stageNum > 4 ? 1 : 0;
            const cutProg = clamp01((vFuse - 0.28) / 0.45);
            if (cutProg <= 0) return null;
            const mY   = membraneY(v.cx);
            const cutW = lerp(0, v.r * 1.05, eio(cutProg));
            return (
              <g key={`cut-${v.id}`}>
                {/* Glowing torn edges — left and right of gap */}
                {cutW > 3 && (
                  <>
                    <ellipse cx={v.cx - cutW} cy={mY} rx={2.5} ry={3}
                      fill="rgba(99,102,241,0.7)" filter="url(#glow-b)"/>
                    <ellipse cx={v.cx + cutW} cy={mY} rx={2.5} ry={3}
                      fill="rgba(99,102,241,0.7)" filter="url(#glow-b)"/>
                  </>
                )}
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              SYNAPTIC CLEFT
          ═══════════════════════════════════════════════════ */}
          <rect x="108" y="355" width="264" height="92" fill="rgba(4,28,50,0.55)"/>
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
              // Brownian drift — kicks in once NT reaches cleft, simulates thermal motion
              const drift = clamp01((t - 0.75) / 0.25);
              ntCx += Math.sin(animTime * 0.0031 + nt.delay1 * 11.3) * 2.8 * drift;
              ntCy  = Math.max(370, Math.min(442, ntCy + Math.cos(animTime * 0.0024 + nt.delay1 * 8.7) * 1.8 * drift));
              ntOpac = ntOpacity * clamp01(t * 6);
            } else if (stageNum === 5) {
              const t2 = clamp01((ntPhase2Prog - nt.delay2 * 0.6) / Math.max(0.01, 1 - nt.delay2 * 0.6));
              ntCx  = lerp(nt.mx, nt.ex, eio(t2));
              ntCy  = lerp(nt.my, nt.ey, eio(t2));
              // Brownian drift fades out as NT homes in on receptor
              const drift5 = clamp01(1 - t2 * 4);
              ntCx += Math.sin(animTime * 0.0031 + nt.delay2 * 11.3) * 2.8 * drift5;
              ntCy += Math.cos(animTime * 0.0024 + nt.delay2 *  8.7) * 1.8 * drift5;
              // Dissolve into receptor on arrival
              ntOpac = lerp(1, 0, clamp01((t2 - 0.8) / 0.2));
            } else {
              return null;
            }
            return (
              <g key={nt.id} opacity={ntOpac}>
                <circle cx={ntCx} cy={ntCy} r={5} fill="url(#ntGrad)" filter="url(#glow-b)"/>
                <circle cx={ntCx - 1.4} cy={ntCy - 1.4} r={1.6} fill="rgba(255,255,255,0.5)"/>
              </g>
            );
          })}

          {/* ═══════════════════════════════════════════════════
              POST-SYNAPTIC MEMBRANE — bilayer (outer + inner leaflet)
          ═══════════════════════════════════════════════════ */}
          {/* Outer leaflet — matches pre-synaptic active zone width (120→360) */}
          <path
            d="M 108,447 C 111,447 114,446 118,445 Q 240,430 362,445 C 366,446 369,447 372,447"
            fill="none"
            stroke={stageNum === 5 ? `rgba(244,114,182,${0.38 + recBound * 0.48})` : 'rgba(52,211,153,0.42)'}
            strokeWidth="3.5"
            strokeLinecap="round"
            filter={stageNum === 5 && recBound > 0.3 ? 'url(#glow-p)' : undefined}
          />
          {/* Inner leaflet */}
          <path
            d="M 116,455 C 119,454 122,453 126,453 Q 240,439 354,453 C 358,453 361,454 364,455"
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
            const cx    = rec.cx;
            const colF  = bound ? `rgba(244,114,182,${0.35 + bindT * 0.4})` : 'rgba(52,211,153,0.22)';
            const colSt = bound ? `rgba(244,114,182,0.85)` : 'rgba(52,211,153,0.72)';
            return (
              <g key={rec.id} filter={bound && bindT > 0.4 ? 'url(#glow-p)' : undefined}>

                {/* ══ EXTRACELLULAR DOMAIN — Y-arms (subunit lobes) ══
                    Each arm = one receptor subunit with a ligand-binding domain (LBD).
                    Two NTs bind here (one per arm) to open the ion channel gate.       */}

                {/* Left arm — Y-fork up to LBD lobe */}
                <path
                  d={`M ${cx-1.5},${my-5} C ${cx-3},${my-11} ${cx-7},${my-16} ${cx-9},${my-21}`}
                  stroke={colSt} strokeWidth="4" fill="none" strokeLinecap="round"
                />
                {/* Left LBD lobe cap */}
                <ellipse cx={cx-9} cy={my-24} rx={4.5} ry={3.5}
                  fill={colF} stroke={colSt} strokeWidth="1.2"/>
                {/* Left binding-site notch */}
                <path d={`M ${cx-6},${my-22} Q ${cx-9},${my-26} ${cx-12},${my-22}`}
                  stroke={colSt} strokeWidth="1" fill="none" strokeLinecap="round"/>
                {/* Left lobe glow when NT bound */}
                {bound && (
                  <ellipse cx={cx-9} cy={my-24} rx={4} ry={3}
                    fill={`rgba(244,114,182,${0.6 * bindT})`} filter="url(#glow-p)"/>
                )}

                {/* Right arm */}
                <path
                  d={`M ${cx+1.5},${my-5} C ${cx+3},${my-11} ${cx+7},${my-16} ${cx+9},${my-21}`}
                  stroke={colSt} strokeWidth="4" fill="none" strokeLinecap="round"
                />
                {/* Right LBD lobe cap */}
                <ellipse cx={cx+9} cy={my-24} rx={4.5} ry={3.5}
                  fill={colF} stroke={colSt} strokeWidth="1.2"/>
                {/* Right binding-site notch */}
                <path d={`M ${cx+6},${my-22} Q ${cx+9},${my-26} ${cx+12},${my-22}`}
                  stroke={colSt} strokeWidth="1" fill="none" strokeLinecap="round"/>
                {/* Right lobe glow */}
                {bound && (
                  <ellipse cx={cx+9} cy={my-24} rx={4} ry={3}
                    fill={`rgba(244,114,182,${0.6 * bindT})`} filter="url(#glow-p)"/>
                )}

                {/* ══ TRANSMEMBRANE BARREL ══ */}
                <rect x={cx-9} y={my-4} width={18} height={12} rx={3.5}
                  fill={colF} stroke={colSt} strokeWidth="1.2"/>
                <line x1={cx-3} y1={my-4} x2={cx-3} y2={my+8}
                  stroke={colSt} strokeWidth="0.7" opacity="0.45"/>
                <line x1={cx+3} y1={my-4} x2={cx+3} y2={my+8}
                  stroke={colSt} strokeWidth="0.7" opacity="0.45"/>
                {/* Central ion pore */}
                <rect x={cx-2.5} y={my-3} width={5} height={10} rx={2}
                  fill={bound ? `rgba(244,114,182,${0.45 + bindT * 0.5})` : 'rgba(2,8,22,0.92)'}
                  filter={bound && bindT > 0.5 ? 'url(#glow-p)' : undefined}
                />

                {/* ══ INTRACELLULAR DOMAIN ══ */}
                <rect x={cx-8} y={my+8} width={6} height={5} rx={1.5}
                  fill={bound ? 'rgba(244,114,182,0.25)' : 'rgba(52,211,153,0.14)'}
                  stroke={bound ? 'rgba(244,114,182,0.45)' : 'rgba(52,211,153,0.3)'}
                  strokeWidth="0.7"/>
                <rect x={cx+2} y={my+8} width={6} height={5} rx={1.5}
                  fill={bound ? 'rgba(244,114,182,0.25)' : 'rgba(52,211,153,0.14)'}
                  stroke={bound ? 'rgba(244,114,182,0.45)' : 'rgba(52,211,153,0.3)'}
                  strokeWidth="0.7"/>

                {/* NT-arrival flash burst */}
                {bound && bindT < 0.4 && (
                  <ellipse cx={cx} cy={my - 22}
                    rx={lerp(2, 11, clamp01(bindT / 0.22))}
                    ry={lerp(2, 11, clamp01(bindT / 0.22))}
                    fill="rgba(244,114,182,0.65)" filter="url(#glow-p)"
                    opacity={lerp(1, 0, bindT / 0.4)}
                  />
                )}
              </g>
            );
          })}

          {/* POST-SYNAPTIC DENDRITE BODY — rounded arch cross-section of a cylindrical dendrite.
              Top edge aligns with inner leaflet (116→364) — no gap, no ghost line.
              Width matches pre-synaptic terminal (~108→372) for visual consistency.
              Bottom is a pronounced arch that exits the viewport naturally. */}
          {stageNum === 5 && recBound > 0.1 && (
            <path
              d="M 108,453 Q 240,438 372,453 C 388,508 385,592 360,630 Q 240,650 120,630 C 95,592 92,508 108,453 Z"
              fill={`rgba(244,114,182,${recBound * 0.08})`}
              filter="url(#glow-p)"
            />
          )}
          <path
            d="M 108,453 Q 240,438 372,453 C 388,508 385,592 360,630 Q 240,650 120,630 C 95,592 92,508 108,453 Z"
            fill="url(#postGrad)"
          />
          <text x={CX} y="520" textAnchor="middle" fontSize="8.5"
            fill="rgba(110,231,183,0.3)" fontFamily="Inter">Post-synaptic Dendrite</text>

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
          <h1 className="text-xl font-bold text-white/90 leading-snug mb-4">
            Synaptic<br />Transmission
          </h1>

          {/* ── Mini neuron context map + stage progress ── */}
          {(() => {
            const pulse = 0.6 + 0.4 * Math.sin(animTime / 520);
            const s2 = stageNum === 2 ? ep * pulse : stageNum > 2 ? 0.38 : 0;
            const s3 = stageNum === 3 ? ep * pulse : stageNum > 3 ? 0.38 : 0;
            const s4 = stageNum === 4 ? ep * pulse : stageNum > 4 ? 0.38 : 0;
            const s5 = stageNum === 5 ? ep * pulse : 0;

            // AP particles travel down axon (pre-synaptic)
            const apPts = stageNum === 2
              ? [0, 0.37, 0.72].map((off, i) => {
                  const t = ((animTime / 680 + off) % 1);
                  return { id: i, y: lerp(72, 133, t), op: Math.sin(t * Math.PI) * ep };
                })
              : [];
            // Post AP particles travel into post-synaptic cell body
            const poPts = stageNum === 5
              ? [0, 0.38, 0.74].map((off, i) => {
                  const t = ((animTime / 680 + off) % 1);
                  return { id: i, y: lerp(167, 188, t), op: Math.sin(t * Math.PI) * ep };
                })
              : [];

            const preStroke  = s2 > 0.1 ? `rgba(251,191,36,${Math.min(s2,0.95)})` : 'rgba(99,102,241,0.4)';
            const bouStroke  = s4 > 0.1
              ? `rgba(96,165,250,${Math.min(s4,0.95)})`
              : s3 > 0.1 ? `rgba(52,211,153,${Math.min(s3,0.95)})` : 'rgba(99,102,241,0.38)';
            const clfStroke  = s4 > 0.1 ? `rgba(96,165,250,${Math.min(s4,0.95)})` : 'rgba(99,102,241,0.26)';
            const postStroke = s5 > 0.1 ? `rgba(244,114,182,${Math.min(s5,0.95)})` : 'rgba(99,102,241,0.28)';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20,
                background: 'rgba(4,8,20,0.5)', border: '1px solid rgba(99,102,241,0.13)',
                borderRadius: 12, padding: '10px 12px' }}>

                {/* Pre-synaptic + synapse gap + post-synaptic neuron, landscape, no labels */}
                <svg viewBox="0 0 530 128" width="100%" height={68} style={{ display: 'block', overflow: 'visible' }}>
                  <defs>
                    <filter id="mgy" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="mgg" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="mgb" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="mgp" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <radialGradient id="nSomaG" cx="38%" cy="32%" r="68%">
                      <stop offset="0%"   stopColor="#4a8fd4"/>
                      <stop offset="45%"  stopColor="#1b3d6e"/>
                      <stop offset="100%" stopColor="#060e22"/>
                    </radialGradient>
                    <radialGradient id="nNucG" cx="40%" cy="35%" r="65%">
                      <stop offset="0%"   stopColor="#a0d4ff"/>
                      <stop offset="100%" stopColor="#2878d0"/>
                    </radialGradient>
                    <radialGradient id="nTermG" cx="35%" cy="28%" r="72%">
                      <stop offset="0%"   stopColor="#ff9060"/>
                      <stop offset="100%" stopColor="#aa1800"/>
                    </radialGradient>
                    <radialGradient id="nDotG" cx="40%" cy="35%" r="65%">
                      <stop offset="0%"   stopColor="#ffe08a"/>
                      <stop offset="100%" stopColor="#c07820"/>
                    </radialGradient>
                  </defs>

                  {/* ══ DENDRITES — golden branching tree on the left ══ */}
                  <g fill="none" strokeLinecap="round">
                    {/* Upper main trunk */}
                    <path d="M 59,46 C 47,37 33,26 19,16" stroke="rgba(200,140,40,0.65)" strokeWidth="2.8"/>
                    <path d="M 19,16 C 11,10 4,4 0,1"     stroke="rgba(195,130,35,0.55)" strokeWidth="1.8"/>
                    <path d="M 19,16 C 21,8 22,1 20,-3"   stroke="rgba(195,130,35,0.55)" strokeWidth="1.7"/>
                    <path d="M 31,24 C 35,17 41,11 45,7"  stroke="rgba(188,124,33,0.45)" strokeWidth="1.4"/>
                    <path d="M 45,7  C 48,2 51,-2 53,-4"  stroke="rgba(182,118,30,0.38)" strokeWidth="1.1"/>
                    {/* Upper-mid trunk */}
                    <path d="M 57,53 C 43,51 27,48 12,45" stroke="rgba(192,132,38,0.6)"  strokeWidth="2.2"/>
                    <path d="M 12,45 C 5,43 -1,41 -5,38"  stroke="rgba(186,126,35,0.5)"  strokeWidth="1.6"/>
                    <path d="M 12,45 C 13,37 16,29 19,25" stroke="rgba(186,126,35,0.5)"  strokeWidth="1.5"/>
                    <path d="M 19,25 C 21,20 25,15 27,12" stroke="rgba(180,120,30,0.38)" strokeWidth="1.1"/>
                    {/* Lower-mid trunk */}
                    <path d="M 57,67 C 43,69 27,72 12,75" stroke="rgba(192,132,38,0.6)"  strokeWidth="2.2"/>
                    <path d="M 12,75 C 5,77 -1,79 -5,82"  stroke="rgba(186,126,35,0.5)"  strokeWidth="1.6"/>
                    <path d="M 12,75 C 13,83 16,91 19,95" stroke="rgba(186,126,35,0.5)"  strokeWidth="1.5"/>
                    <path d="M 19,95 C 21,100 25,105 27,108" stroke="rgba(180,120,30,0.38)" strokeWidth="1.1"/>
                    {/* Lower main trunk */}
                    <path d="M 59,74 C 47,83 33,94 19,104" stroke="rgba(200,140,40,0.65)" strokeWidth="2.8"/>
                    <path d="M 19,104 C 11,110 4,116 0,119" stroke="rgba(195,130,35,0.55)" strokeWidth="1.8"/>
                    <path d="M 19,104 C 21,112 22,119 20,123" stroke="rgba(195,130,35,0.55)" strokeWidth="1.7"/>
                    <path d="M 31,96  C 35,103 41,109 45,113" stroke="rgba(188,124,33,0.45)" strokeWidth="1.4"/>
                    <path d="M 45,113 C 48,118 51,122 53,124" stroke="rgba(182,118,30,0.38)" strokeWidth="1.1"/>
                  </g>

                  {/* Stage-2 dendrite glow */}
                  {s2 > 0.2 && (
                    <g stroke={`rgba(251,191,36,${s2*0.45})`} fill="none" strokeLinecap="round" filter="url(#mgy)">
                      <path d="M 59,46 C 47,37 33,26 19,16" strokeWidth="2.6"/>
                      <path d="M 57,53 C 43,51 27,48 12,45" strokeWidth="2.2"/>
                      <path d="M 57,67 C 43,69 27,72 12,75" strokeWidth="2.2"/>
                      <path d="M 59,74 C 47,83 33,94 19,104" strokeWidth="2.6"/>
                    </g>
                  )}

                  {/* Dendrite tip glow dots */}
                  {([
                    [0,1],[20,-3],[45,7],[53,-4],
                    [-5,38],[19,25],[27,12],
                    [-5,82],[19,95],[27,108],
                    [0,119],[20,123],[45,113],[53,124],
                  ] as [number,number][]).map(([dx,dy], i) => (
                    <circle key={i} cx={dx} cy={dy} r={2.6}
                      fill="url(#nDotG)" filter="url(#mgy)"
                      opacity={0.78 + 0.22 * Math.abs(Math.sin(animTime / 420 + i * 0.71))}
                    />
                  ))}

                  {/* ══ SOMA ══ */}
                  {s2 > 0.12 && <ellipse cx={73} cy={60} rx={31} ry={28} fill={`rgba(251,191,36,${s2*0.16})`} filter="url(#mgy)"/>}
                  <ellipse cx={73} cy={60} rx={23} ry={21}
                    fill="url(#nSomaG)"
                    stroke={s2 > 0.1 ? `rgba(251,191,36,${s2*0.65+0.15})` : 'rgba(100,162,230,0.32)'}
                    strokeWidth={1.5}
                    filter={s2>0.3 ? 'url(#mgy)' : undefined}
                  />
                  {/* Inner cytoplasm ring */}
                  <ellipse cx={71} cy={58} rx={17} ry={15} fill="none" stroke="rgba(80,142,212,0.11)" strokeWidth="2"/>
                  {/* Nucleus */}
                  <ellipse cx={75} cy={58} rx={10} ry={9}
                    fill="url(#nNucG)" stroke="rgba(140,205,255,0.5)" strokeWidth="0.9"/>
                  {/* Nucleolus */}
                  <circle cx={76} cy={57} r={3.2} fill="rgba(225,242,255,0.82)"/>
                  <circle cx={73} cy={61} r={1.6} fill="rgba(200,228,255,0.45)"/>

                  {/* ══ AXON HILLOCK ══ */}
                  <path d="M 93,56 C 97,58 101,59 106,60 C 101,61 97,62 93,64 Z"
                    fill={`rgba(66,153,225,${0.48 + s2*0.32})`}/>

                  {/* ══ AXON — core tube ══ */}
                  <line x1={106} y1={60} x2={207} y2={60}
                    stroke={`rgba(66,153,225,${0.42 + s2*0.38})`}
                    strokeWidth={4.2} strokeLinecap="round"
                    filter={s2>0.3 ? 'url(#mgy)' : undefined}
                  />

                  {/* Myelin sheaths — 6 capsule segments (Nodes of Ranvier between them) */}
                  {([109,122,135,148,161,174] as number[]).map((x, i) => (
                    <rect key={i} x={x} y={56.5} width={11} height={7} rx={3.5}
                      fill="rgba(168,222,252,0.18)"
                      stroke={`rgba(148,212,246,${0.42 + s2*0.32})`}
                      strokeWidth="0.85"
                    />
                  ))}

                  {/* AP particles traveling along axon (Stage 2) */}
                  {stageNum === 2 && apPts.map(pp => {
                    const ax = lerp(106, 204, (pp.y - 72) / 61);
                    return <circle key={pp.id} cx={ax} cy={60} r={3.6} fill="#fbbf24" opacity={pp.op} filter="url(#mgy)"/>;
                  })}

                  {/* ══ TERMINAL BRANCHES ══ */}
                  <g fill="none" strokeLinecap="round">
                    <path d="M 207,60 C 215,51 223,42 231,36" stroke={bouStroke} strokeWidth="2.2"/>
                    <path d="M 207,60 C 215,57 221,55 229,53" stroke={bouStroke} strokeWidth="2.0"/>
                    <path d="M 207,60 C 215,63 221,65 229,67" stroke={bouStroke} strokeWidth="2.0"/>
                    <path d="M 207,60 C 215,69 223,78 231,84" stroke={bouStroke} strokeWidth="2.2"/>
                  </g>

                  {/* Synaptic knobs (terminal bulbs) */}
                  {([
                    [231,36],[229,53],[229,67],[231,84],
                  ] as [number,number][]).map(([bx,by], i) => {
                    const active = s3 > 0.12 || s4 > 0.12;
                    const bulbFill = s3 > 0.12
                      ? `rgba(52,211,153,${0.5 + s3*0.42})`
                      : s4 > 0.12
                      ? `rgba(96,165,250,${0.5 + s4*0.42})`
                      : 'url(#nTermG)';
                    return (
                      <g key={i}>
                        {active && (
                          <circle cx={bx} cy={by} r={10}
                            fill={`rgba(52,211,153,${Math.max(s3,s4)*0.2})`} filter="url(#mgg)"/>
                        )}
                        <circle cx={bx} cy={by} r={5.8}
                          fill={bulbFill}
                          stroke={bouStroke} strokeWidth="0.8"
                          filter={active ? 'url(#mgg)' : undefined}
                        />
                        {/* NT release dots (stages 4-5) */}
                        {stageNum >= 4 && (
                          <circle
                            cx={bx + 7}
                            cy={by + Math.sin(animTime / 430 + i * 1.3) * 5}
                            r={2.1} fill="rgba(147,197,253,0.9)"
                            opacity={clamp01(ep * 4) * 0.88} filter="url(#mgb)"
                          />
                        )}
                        {/* Stage 5 receptor-binding glow */}
                        {s5 > 0.1 && (
                          <circle cx={bx + 10} cy={by} r={7}
                            fill={`rgba(244,114,182,${s5*0.42})`} filter="url(#mgp)"/>
                        )}
                      </g>
                    );
                  })}

                  {/* ══════════════════════════════════════════
                      SYNAPSE GAP — subtle cleft indicator
                  ══════════════════════════════════════════ */}
                  <rect x={244} y={36} width={22} height={48} rx={5}
                    fill={`rgba(52,211,153,${0.03 + (s3+s4)*0.04})`}
                    stroke={`rgba(52,211,153,${0.10 + (s3+s4)*0.14})`}
                    strokeWidth="0.6" strokeDasharray="2.5 2"/>

                  {/* ══════════════════════════════════════════
                      POST-SYNAPTIC NEURON
                      Same design as pre-synaptic, lights up in Stage 5
                  ══════════════════════════════════════════ */}

                  {/* Dendrites — golden tree radiating LEFT from soma (toward synapse) */}
                  <g fill="none" strokeLinecap="round" opacity={0.28 + s5 * 0.72}>
                    {/* Upper main trunk */}
                    <path d="M 306,46 C 294,37 280,26 266,16" stroke="rgba(200,140,40,0.65)" strokeWidth="2.8"/>
                    <path d="M 266,16 C 258,10 251,4 247,1"   stroke="rgba(195,130,35,0.55)" strokeWidth="1.8"/>
                    <path d="M 266,16 C 268,8 269,1 267,-3"   stroke="rgba(195,130,35,0.55)" strokeWidth="1.7"/>
                    <path d="M 278,24 C 282,17 288,11 292,7"  stroke="rgba(188,124,33,0.45)" strokeWidth="1.4"/>
                    <path d="M 292,7  C 295,2 298,-2 300,-4"  stroke="rgba(182,118,30,0.38)" strokeWidth="1.1"/>
                    {/* Upper-mid trunk */}
                    <path d="M 304,53 C 290,51 274,48 259,45" stroke="rgba(192,132,38,0.6)"  strokeWidth="2.2"/>
                    <path d="M 259,45 C 252,43 246,41 242,38" stroke="rgba(186,126,35,0.5)"  strokeWidth="1.6"/>
                    <path d="M 259,45 C 260,37 263,29 266,25" stroke="rgba(186,126,35,0.5)"  strokeWidth="1.5"/>
                    <path d="M 266,25 C 268,20 272,15 274,12" stroke="rgba(180,120,30,0.38)" strokeWidth="1.1"/>
                    {/* Lower-mid trunk */}
                    <path d="M 304,67 C 290,69 274,72 259,75" stroke="rgba(192,132,38,0.6)"  strokeWidth="2.2"/>
                    <path d="M 259,75 C 252,77 246,79 242,82" stroke="rgba(186,126,35,0.5)"  strokeWidth="1.6"/>
                    <path d="M 259,75 C 260,83 263,91 266,95" stroke="rgba(186,126,35,0.5)"  strokeWidth="1.5"/>
                    <path d="M 266,95 C 268,100 272,105 274,108" stroke="rgba(180,120,30,0.38)" strokeWidth="1.1"/>
                    {/* Lower main trunk */}
                    <path d="M 306,74 C 294,83 280,94 266,104" stroke="rgba(200,140,40,0.65)" strokeWidth="2.8"/>
                    <path d="M 266,104 C 258,110 251,116 247,119" stroke="rgba(195,130,35,0.55)" strokeWidth="1.8"/>
                    <path d="M 266,104 C 268,112 269,119 267,123" stroke="rgba(195,130,35,0.55)" strokeWidth="1.7"/>
                    <path d="M 278,96  C 282,103 288,109 292,113" stroke="rgba(188,124,33,0.45)" strokeWidth="1.4"/>
                    <path d="M 292,113 C 295,118 298,122 300,124" stroke="rgba(182,118,30,0.38)" strokeWidth="1.1"/>
                  </g>

                  {/* Stage-5 dendrite glow (pink) */}
                  {s5 > 0.2 && (
                    <g stroke={`rgba(244,114,182,${s5*0.45})`} fill="none" strokeLinecap="round" filter="url(#mgp)">
                      <path d="M 306,46 C 294,37 280,26 266,16" strokeWidth="2.6"/>
                      <path d="M 304,53 C 290,51 274,48 259,45" strokeWidth="2.2"/>
                      <path d="M 304,67 C 290,69 274,72 259,75" strokeWidth="2.2"/>
                      <path d="M 306,74 C 294,83 280,94 266,104" strokeWidth="2.6"/>
                    </g>
                  )}

                  {/* Post-synaptic dendrite tip glow dots */}
                  {([
                    [247,1],[267,-3],[292,7],[300,-4],
                    [242,38],[266,25],[274,12],
                    [242,82],[266,95],[274,108],
                    [247,119],[267,123],[292,113],[300,124],
                  ] as [number,number][]).map(([dx,dy], i) => (
                    <circle key={`pdt-${i}`} cx={dx} cy={dy} r={2.6}
                      fill={s5 > 0.1 ? `rgba(244,114,182,0.9)` : 'url(#nDotG)'}
                      filter={s5 > 0.1 ? 'url(#mgp)' : 'url(#mgy)'}
                      opacity={(0.28 + s5 * 0.6) * (0.78 + 0.22 * Math.abs(Math.sin(animTime / 420 + i * 0.71)))}
                    />
                  ))}

                  {/* Post-synaptic soma */}
                  {s5 > 0.12 && <ellipse cx={315} cy={60} rx={31} ry={28} fill={`rgba(244,114,182,${s5*0.16})`} filter="url(#mgp)"/>}
                  <ellipse cx={315} cy={60} rx={23} ry={21}
                    fill="url(#nSomaG)"
                    stroke={s5 > 0.1 ? `rgba(244,114,182,${s5*0.65+0.12})` : 'rgba(100,162,230,0.22)'}
                    strokeWidth={1.5}
                    filter={s5 > 0.3 ? 'url(#mgp)' : undefined}
                    opacity={0.28 + s5 * 0.72}
                  />
                  <ellipse cx={313} cy={58} rx={17} ry={15} fill="none"
                    stroke="rgba(80,142,212,0.08)" strokeWidth="2"
                    opacity={0.28 + s5 * 0.72}/>
                  <ellipse cx={317} cy={58} rx={10} ry={9}
                    fill="url(#nNucG)" stroke="rgba(140,205,255,0.4)" strokeWidth="0.9"
                    opacity={0.28 + s5 * 0.72}/>
                  <circle cx={318} cy={57} r={3.2} fill="rgba(225,242,255,0.82)"
                    opacity={0.28 + s5 * 0.72}/>

                  {/* Post-synaptic axon hillock */}
                  <path d="M 335,56 C 339,58 343,59 348,60 C 343,61 339,62 335,64 Z"
                    fill={`rgba(66,153,225,${0.48 + s5*0.3})`} opacity={0.28 + s5 * 0.72}/>

                  {/* Post-synaptic axon */}
                  <line x1={348} y1={60} x2={449} y2={60}
                    stroke={`rgba(66,153,225,${0.42 + s5*0.38})`}
                    strokeWidth={4.2} strokeLinecap="round"
                    filter={s5 > 0.3 ? 'url(#mgp)' : undefined}
                    opacity={0.28 + s5 * 0.72}
                  />

                  {/* Post-synaptic myelin sheaths */}
                  {([351,364,377,390,403,416] as number[]).map((x, i) => (
                    <rect key={`pm-${i}`} x={x} y={56.5} width={11} height={7} rx={3.5}
                      fill="rgba(168,222,252,0.18)"
                      stroke={`rgba(148,212,246,${0.38 + s5*0.32})`}
                      strokeWidth="0.85"
                      opacity={0.28 + s5 * 0.72}
                    />
                  ))}

                  {/* AP particles along post-synaptic axon (Stage 5) */}
                  {stageNum === 5 && postWaveProg > 0.1 && poPts.map(pp => {
                    const ax = lerp(348, 446, (pp.y - 167) / 21);
                    return <circle key={pp.id} cx={ax} cy={60} r={3.6}
                      fill="#f472b6" opacity={pp.op} filter="url(#mgp)"/>;
                  })}

                  {/* Post-synaptic terminal branches */}
                  <g fill="none" strokeLinecap="round" opacity={0.28 + s5 * 0.72}>
                    <path d="M 449,60 C 457,51 465,42 473,36" stroke={postStroke} strokeWidth="2.2"/>
                    <path d="M 449,60 C 457,57 463,55 471,53" stroke={postStroke} strokeWidth="2.0"/>
                    <path d="M 449,60 C 457,63 463,65 471,67" stroke={postStroke} strokeWidth="2.0"/>
                    <path d="M 449,60 C 457,69 465,78 473,84" stroke={postStroke} strokeWidth="2.2"/>
                  </g>

                  {/* Post-synaptic terminal bulbs */}
                  {([
                    [473,36],[471,53],[471,67],[473,84],
                  ] as [number,number][]).map(([bx,by], i) => (
                    <g key={`ptb-${i}`} opacity={0.28 + s5 * 0.72}>
                      {s5 > 0.2 && (
                        <circle cx={bx} cy={by} r={10}
                          fill={`rgba(244,114,182,${s5*0.22})`} filter="url(#mgp)"/>
                      )}
                      <circle cx={bx} cy={by} r={5.8}
                        fill={s5 > 0.12 ? `rgba(244,114,182,${0.5 + s5*0.42})` : 'url(#nTermG)'}
                        stroke={postStroke} strokeWidth="0.8"
                        filter={s5 > 0.2 ? 'url(#mgp)' : undefined}
                      />
                    </g>
                  ))}

                  {/* ══ Transparent hover hotspots — tooltip hit regions ══ */}
                  {([
                    { x:  0, y:  0, w: 62, h:128, label:'Dendrites',            desc:'Branch-like extensions that receive incoming signals from other neurons' },
                    { x: 52, y: 36, w: 46, h: 48, label:'Cell Body (Soma)',      desc:'Integrates all incoming signals; contains the nucleus' },
                    { x: 96, y: 50, w:111, h: 20, label:'Axon & Myelin Sheath',  desc:'Long fiber conducting impulses; white segments (myelin) speed transmission' },
                    { x:207, y: 26, w: 37, h: 70, label:'Axon Terminals',        desc:'Bulb-shaped endings that release neurotransmitters into the synaptic cleft' },
                    { x:244, y: 28, w: 22, h: 72, label:'Synaptic Cleft',        desc:'~20 nm gap where neurotransmitters diffuse from one neuron to the next' },
                    { x:266, y:  0, w: 60, h:128, label:'Dendrites',             desc:'Dendritic spines face the cleft and carry receptors that bind neurotransmitters' },
                    { x:292, y: 36, w: 48, h: 48, label:'Cell Body (Soma)',      desc:'Sums received signals; fires a new action potential if threshold is reached' },
                    { x:348, y: 50, w:100, h: 20, label:'Axon & Myelin Sheath',  desc:'Propagates the resulting action potential to the next synapse' },
                    { x:449, y: 26, w: 38, h: 70, label:'Axon Terminals',        desc:'Pass the signal forward — the start of the next synapse in the chain' },
                  ] as { x:number; y:number; w:number; h:number; label:string; desc:string }[]).map((hs, i) => (
                    <rect key={`hs-${i}`} x={hs.x} y={hs.y} width={hs.w} height={hs.h}
                      fill="transparent" style={{ cursor: 'crosshair' }}
                      onMouseEnter={() => setNeuronTip({ label: hs.label, desc: hs.desc })}
                      onMouseLeave={() => setNeuronTip(null)}
                    />
                  ))}
                </svg>

                {/* Tooltip strip — fades in on neuron hover */}
                <div style={{
                  minHeight: 34,
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0 2px',
                  opacity: neuronTip ? 1 : 0,
                  transform: neuronTip ? 'translateY(0)' : 'translateY(-3px)',
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    width: 2.5, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0,
                    background: `linear-gradient(to bottom, ${stage.color}cc, ${stage.color}44)`,
                  }}/>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: 'Inter',
                      color: neuronTip ? stage.color : 'transparent',
                      transition: 'color 0.18s', letterSpacing: '0.02em' }}>
                      {neuronTip?.label}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: 'Inter', lineHeight: 1.4,
                      color: 'rgba(255,255,255,0.45)' }}>
                      {neuronTip?.desc}
                    </span>
                  </div>
                </div>

                {/* Stage progress dots — horizontal row */}
                <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
                  {STAGES.map((s, i) => {
                    const isActive = si === i;
                    const isDone   = si > i;
                    return (
                      <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: isActive ? s.color : isDone ? `${s.color}55` : 'rgba(255,255,255,0.1)',
                          boxShadow: isActive ? `0 0 8px ${s.color}cc` : 'none',
                          transition: 'background 0.4s, box-shadow 0.4s',
                        }}/>
                        <span style={{
                          fontSize: 8, fontFamily: 'Inter', lineHeight: 1.2, textAlign: 'center',
                          color: isActive ? s.color : isDone ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)',
                          transition: 'color 0.4s',
                        }}>{s.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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

          {/* Key fact box */}
          <div className="rounded-xl p-3.5 mt-3 flex gap-2.5 transition-all duration-500"
            style={{ background: `${stage.color}09`, border: `1px solid ${stage.color}20` }}>
            <div className="flex-shrink-0 mt-0.5 text-base leading-none">💡</div>
            <div>
              <div className="text-xs font-semibold mb-1 transition-colors duration-500" style={{ color: stage.color }}>
                Did you know?
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.48)' }}>
                {stage.fact}
              </p>
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
