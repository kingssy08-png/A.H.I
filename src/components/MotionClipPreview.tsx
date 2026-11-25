import { useEffect, useRef } from 'react';
import type { StockAsset } from '../types/studio';
import { drawMotionPreset } from '../utils/motionCanvas';

interface MotionClipPreviewProps {
  preset: StockAsset['motionPreset'];
  accentColor: string;
  active?: boolean;
  className?: string;
}

export function MotionClipPreview({
  preset,
  accentColor,
  active = true,
  className = '',
}: MotionClipPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = active ? (now - start) / 1000 : 1.5;
      drawMotionPreset(ctx, preset, canvas.width, canvas.height, elapsed, accentColor);
      if (active) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [preset, accentColor, active]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={180}
      className={`w-full h-full object-cover block ${className}`}
    />
  );
}
