import type { StockAsset } from '../types/studio';

export function drawMotionPreset(
  ctx: CanvasRenderingContext2D,
  preset: StockAsset['motionPreset'] | undefined,
  w: number,
  h: number,
  timeSec: number,
  accentColor = '#F59E0B',
  transparentOverlay = false
): void {
  if (!transparentOverlay) {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0B0E17');
    bgGrad.addColorStop(1, '#141B29');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.save();

  switch (preset) {
    case 'clockwork-gears': {
      const drawGear = (cx: number, cy: number, radius: number, teeth: number, angle: number, color: string) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.strokeStyle = color;
        ctx.fillStyle = `${color}22`;
        ctx.lineWidth = Math.max(2, w * 0.004);
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const r = i % 2 === 0 ? radius : radius * 0.84;
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };

      drawGear(w * 0.34, h * 0.52, Math.min(w, h) * 0.25, 12, timeSec * 0.7, accentColor);
      drawGear(w * 0.61, h * 0.42, Math.min(w, h) * 0.17, 9, -timeSec * 0.93 + 0.3, '#38BDF8');
      drawGear(w * 0.72, h * 0.68, Math.min(w, h) * 0.12, 8, timeSec * 1.1, '#FBBF24');
      break;
    }

    case 'orbital-rings': {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const baseR = Math.min(w, h) * 0.14;

      // Central star
      const sunGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseR * 0.75);
      sunGrad.addColorStop(0, '#FEF3C7');
      sunGrad.addColorStop(0.5, accentColor);
      sunGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.75, 0, Math.PI * 2);
      ctx.fill();

      const rings = [
        { r: baseR * 1.4, speed: 1.4, color: '#38BDF8', dotR: baseR * 0.12 },
        { r: baseR * 2.15, speed: 0.7, color: '#F59E0B', dotR: baseR * 0.16 },
        { r: baseR * 2.9, speed: 0.35, color: '#94A3B8', dotR: baseR * 0.13 },
      ];

      rings.forEach((ring, idx) => {
        ctx.strokeStyle = `${ring.color}55`;
        ctx.lineWidth = Math.max(1.5, w * 0.0025);
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, ring.r * 1.25, ring.r * 0.65, 0.12 * idx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const theta = timeSec * ring.speed + idx * 1.7;
        const px = cx + Math.cos(theta) * ring.r * 1.25;
        const py = cy + Math.sin(theta) * ring.r * 0.65;
        ctx.fillStyle = ring.color;
        ctx.beginPath();
        ctx.arc(px, py, ring.dotR, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }

    case 'harbor-mist': {
      for (let i = 0; i < 4; i++) {
        const y = h * (0.48 + i * 0.12);
        const offset = Math.sin(timeSec * (0.35 + i * 0.1) + i) * w * 0.08;
        const grad = ctx.createLinearGradient(0, y - h * 0.12, 0, y + h * 0.12);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, `rgba(148, 163, 184, ${0.14 - i * 0.02})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(w * 0.5 + offset, y, w * 0.65, h * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'rain-streaks': {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
      ctx.lineWidth = Math.max(1, w * 0.002);
      for (let i = 0; i < 42; i++) {
        const seedX = ((i * 73) % 100) / 100;
        const speed = 0.6 + (i % 5) * 0.18;
        const progress = ((timeSec * speed + (i * 0.19)) % 1);
        const x = seedX * w - progress * w * 0.12;
        const y = progress * (h + 40) - 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - w * 0.025, y + h * 0.08);
        ctx.stroke();
      }
      break;
    }

    case 'starfield-warp': {
      const cx = w * 0.5;
      const cy = h * 0.5;
      for (let i = 0; i < 55; i++) {
        const angle = i * 2.39996;
        const depth = ((timeSec * 0.28 + (i * 0.07)) % 1);
        const dist = depth * Math.max(w, h) * 0.62;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const r = 0.8 + depth * 2.4;
        ctx.fillStyle = `rgba(226, 232, 240, ${0.2 + depth * 0.75})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'sunbeam-dust':
    default: {
      const beam = ctx.createLinearGradient(0, 0, w * 0.7, h);
      beam.addColorStop(0, `${accentColor}30`);
      beam.addColorStop(1, 'transparent');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, 0);
      ctx.lineTo(w * 0.48, 0);
      ctx.lineTo(w * 0.92, h);
      ctx.lineTo(w * 0.35, h);
      ctx.closePath();
      ctx.fill();

      for (let i = 0; i < 24; i++) {
        const px = (((i * 97) % 100) / 100) * w + Math.sin(timeSec * 0.8 + i) * 14;
        const py = (((i * 53) % 100) / 100) * h + Math.cos(timeSec * 0.6 + i) * 10;
        ctx.fillStyle = `rgba(251, 191, 36, ${0.25 + (i % 4) * 0.12})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}
