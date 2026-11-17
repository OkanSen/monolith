import React, { useEffect, useRef } from 'react';

interface Canvas2DBarsProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  barCount?: number;
}

export const Canvas2DBars: React.FC<Canvas2DBarsProps> = ({ analyserRef, barCount = 44 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const getMusicalFrequency = (index: number, total: number, data: Uint8Array): number => {
    if (!data.length) return 0;
    const activeRangeLength = Math.max(10, Math.floor(data.length * 0.165));
    const minLog = Math.log10(1);
    const maxLog = Math.log10(activeRangeLength);
    const exp = minLog + (index / total) * (maxLog - minLog);
    const bin = Math.min(activeRangeLength - 1, Math.max(0, Math.floor(Math.pow(10, exp))));
    return data[bin] || 0;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const dataArray = new Uint8Array(256);
    const smoothBars = new Float32Array(barCount).fill(4);

    const render = () => {
      const w = (canvas.width = canvas.parentElement?.clientWidth || 520);
      const h = (canvas.height = canvas.parentElement?.clientHeight || 150);
      ctx.clearRect(0, 0, w, h);

      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      const computed = getComputedStyle(canvas);
      const glowCore = computed.getPropertyValue('--glow-core').trim() || '#f1f5f9';
      const glowAura = computed.getPropertyValue('--glow-aura').trim() || 'rgba(203, 213, 225, 0.6)';
      const stoneCarved = computed.getPropertyValue('--stone-carved').trim() || 'rgba(8, 10, 14, 0.7)';
      const textAsh = computed.getPropertyValue('--text-ash').trim() || 'rgba(100, 116, 139, 0.35)';

      const spacing = 3;
      const barWidth = (w - (barCount - 1) * spacing) / barCount;

      for (let i = 0; i < barCount; i++) {
        const rawValue = getMusicalFrequency(i, barCount, dataArray);
        const targetHeight = Math.max(4, (rawValue / 255) * (h - 18));

        if (targetHeight > smoothBars[i]) {
          smoothBars[i] += (targetHeight - smoothBars[i]) * 0.32;
        } else {
          smoothBars[i] -= (smoothBars[i] - targetHeight) * 0.08;
        }

        const barHeight = smoothBars[i];
        const x = i * (barWidth + spacing);
        const y = h - barHeight;

        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, glowCore);
        grad.addColorStop(0.35, textAsh);
        grad.addColorStop(1, stoneCarved);

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = glowCore;
        ctx.shadowColor = glowAura;
        ctx.shadowBlur = 6;
        ctx.fillRect(x, y, barWidth, 1.5);
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [analyserRef, barCount]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};