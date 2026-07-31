import React, { useEffect, useMemo } from 'react';

// Celebratory burst shown ONLY in the demo/reviewer flow after a successful
// spot declaration. Pure CSS animation — no dependency, ~40 DOM nodes for
// under 3 seconds, then the whole layer unmounts.

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

interface ConfettiBurstProps {
  onDone: () => void;
}

export const ConfettiBurst = ({ onDone }: ConfettiBurstProps) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        duration: 1.6 + Math.random() * 1.2,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
        drift: -50 + Math.random() * 100,
      })),
    []
  );

  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.round ? p.size : p.size * 0.45}px`,
            backgroundColor: p.color,
            borderRadius: p.round ? '9999px' : '2px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--confetti-drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
};
