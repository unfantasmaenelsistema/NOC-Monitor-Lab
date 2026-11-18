import React, { useEffect, useRef } from 'react';

export interface ChartSeries {
  label: string;
  color: string;
  data: number[];
}

interface SparklineCanvasProps {
  series: ChartSeries[];
  height?: number;
  min?: number;
  max?: number;
  unit?: string;
  showGrid?: boolean;
  fillArea?: boolean;
}

export const SparklineCanvas: React.FC<SparklineCanvasProps> = ({
  series,
  height = 120,
  min = 0,
  max,
  unit = '%',
  showGrid = true,
  fillArea = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth || 320;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const allValues = series.flatMap((s) => s.data);
    if (allValues.length === 0) return;

    const computedMax =
      max !== undefined ? max : Math.max(10, Math.ceil(Math.max(...allValues) * 1.15));
    const computedMin = min;
    const range = Math.max(1, computedMax - computedMin);

    const padLeft = showGrid ? 36 : 4;
    const padRight = 8;
    const padTop = 8;
    const padBottom = showGrid ? 18 : 4;
    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    // Draw Grid
    if (showGrid) {
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const steps = 3;
      for (let i = 0; i <= steps; i++) {
        const y = padTop + (plotH * i) / steps;
        const val = computedMax - (range * i) / steps;
        ctx.beginPath();
        ctx.moveTo(padLeft, Math.round(y) + 0.5);
        ctx.lineTo(width - padRight, Math.round(y) + 0.5);
        ctx.stroke();

        ctx.fillText(`${Math.round(val)}${unit}`, padLeft - 5, y);
      }
    }

    // Draw Each Series
    series.forEach((s) => {
      const pts = s.data;
      if (pts.length < 2) return;

      const coords = pts.map((v, idx) => {
        const x = padLeft + (idx / (pts.length - 1)) * plotW;
        const norm = (v - computedMin) / range;
        const y = padTop + plotH - Math.max(0, Math.min(1, norm)) * plotH;
        return { x, y };
      });

      if (fillArea && series.length <= 2) {
        ctx.beginPath();
        ctx.moveTo(coords[0].x, padTop + plotH);
        coords.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(coords[coords.length - 1].x, padTop + plotH);
        ctx.closePath();
        ctx.fillStyle = `${s.color}1c`;
        ctx.fill();
      }

      ctx.beginPath();
      coords.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Highlight latest point
      const last = coords[coords.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    });
  }, [series, height, min, max, unit, showGrid, fillArea]);

  return (
    <div className="w-full overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
};
