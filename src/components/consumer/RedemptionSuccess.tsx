import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The live clock + particle canvas is the anti-screenshot proof:
// a static screenshot never shows a ticking second and moving particles.
// Merchants are trained to glance at both before accepting the redemption.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

const PARTICLE_COLORS = [
  '#22c55e', '#4ade80', '#86efac',  // green family
  '#fbbf24', '#f59e0b',             // gold accents
  '#ffffff',
];

function spawnParticles(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.4,
    y: h / 2 + (Math.random() - 0.5) * h * 0.2,
    vx: (Math.random() - 0.5) * 6,
    vy: -(Math.random() * 8 + 2),
    radius: Math.random() * 5 + 2,
    alpha: 1,
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
  }));
}

interface RedemptionSuccessProps {
  business: string;
  rewardLabel: string;
  onDone: () => void;
}

export const RedemptionSuccess = ({ business, rewardLabel, onDone }: RedemptionSuccessProps) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const particles   = useRef<Particle[]>([]);
  const lastBurst   = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  // Live clock: seconds since redemption
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // Particle canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const BURST_INTERVAL = 1_400; // ms between bursts

    const draw = (ts: number) => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      ctx.clearRect(0, 0, w, h);

      if (ts - lastBurst.current > BURST_INTERVAL) {
        particles.current.push(...spawnParticles(18, w, h));
        lastBurst.current = ts;
      }

      particles.current = particles.current.filter((p) => p.alpha > 0.02);

      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18; // gravity
        p.alpha -= 0.012;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    // First burst immediately
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    particles.current = spawnParticles(30, w, h);
    lastBurst.current = performance.now();
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const clockStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-emerald-500 text-white">
      {/* Particle canvas sits behind the text */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      />

      <div className="relative z-10 flex flex-col items-center gap-5 px-8 text-center">
        <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center ring-4 ring-white/30">
          <CheckCircle2 className="h-14 w-14 text-white" strokeWidth={1.5} />
        </div>

        <div>
          <h1 className="text-3xl font-black tracking-tight">Redeemed!</h1>
          <p className="text-emerald-100 text-base mt-1 font-medium">{business}</p>
          <p className="text-white/80 text-sm mt-0.5">{rewardLabel}</p>
        </div>

        {/* Live clock — the anti-fraud proof */}
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-8 py-4 border border-white/20">
          <p className="text-xs text-emerald-100 font-medium uppercase tracking-widest mb-1">
            Redemption timer
          </p>
          <div className="text-5xl font-black tabular-nums tracking-tight">{clockStr}</div>
          <p className="text-xs text-emerald-100 mt-1 opacity-80">
            Show this live screen to the cashier
          </p>
        </div>

        <p className="text-sm text-emerald-100 max-w-xs">
          The timer proves this is a real-time redemption. A screenshot will not be accepted.
        </p>

        <Button
          onClick={onDone}
          className="mt-2 bg-white text-emerald-700 hover:bg-white/90 font-bold px-10 h-12 text-base rounded-2xl shadow-lg"
        >
          Done
        </Button>
      </div>
    </div>
  );
};
