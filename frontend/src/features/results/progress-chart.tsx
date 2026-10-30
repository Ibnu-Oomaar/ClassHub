import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPercent } from '@/lib/format';

export interface ProgressPoint {
  id: string;
  /** Examination name. */
  label: string;
  /** Percentage from 0 to 100. */
  value: number;
  /** A second line for the tooltip, for example the date and the grade. */
  detail: string;
}

const HEIGHT = 220;
const MARGIN = { top: 18, right: 44, bottom: 34, left: 40 };
const TICKS = [0, 25, 50, 75, 100];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    setWidth(Math.floor(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * One student's percentage across their published examinations, oldest to newest. A single series, so
 * no legend: the heading above it says what is plotted, and the table under it carries every value.
 */
export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 1);
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = (index: number) => MARGIN.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = (value: number) => MARGIN.top + innerHeight - (Math.min(Math.max(value, 0), 100) / 100) * innerHeight;
    return { x, y, innerWidth };
  }, [width, points.length]);

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${geometry.x(index).toFixed(1)} ${geometry.y(point.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const showEveryLabel = points.length <= 5;
  const current = active === null ? null : points[active];

  const nearest = (clientX: number, element: SVGSVGElement) => {
    const box = element.getBoundingClientRect();
    const px = clientX - box.left;
    let best = 0;
    let distance = Infinity;
    points.forEach((_, index) => {
      const gap = Math.abs(geometry.x(index) - px);
      if (gap < distance) {
        distance = gap;
        best = index;
      }
    });
    setActive(best);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-label="Percentage in each published examination"
          onPointerMove={(event) => nearest(event.clientX, event.currentTarget)}
          onPointerLeave={() => setActive(null)}
          className="block touch-pan-y overflow-visible"
        >
          {TICKS.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke="var(--border)" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={geometry.y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">
                {tick}
              </text>
            </g>
          ))}

          {current ? (
            <line x1={geometry.x(active ?? 0)} x2={geometry.x(active ?? 0)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} stroke="var(--input)" strokeWidth={1} />
          ) : null}

          {points.length > 1 ? <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}

          {points.map((point, index) => (
            <g key={point.id}>
              <circle cx={geometry.x(index)} cy={geometry.y(point.value)} r={active === index ? 7 : 5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
              <circle
                cx={geometry.x(index)}
                cy={geometry.y(point.value)}
                r={16}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${point.label}: ${formatPercent(point.value)}. ${point.detail}`}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="outline-none focus-visible:stroke-ring"
                strokeWidth={2}
              />
              {showEveryLabel || index === 0 || index === points.length - 1 ? (
                <text x={geometry.x(index)} y={HEIGHT - MARGIN.bottom + 18} textAnchor={index === 0 && !showEveryLabel ? 'start' : index === points.length - 1 && !showEveryLabel ? 'end' : 'middle'} fontSize={11} fill="var(--muted-foreground)">
                  {shorten(point.label, showEveryLabel ? 14 : 20)}
                </text>
              ) : null}
            </g>
          ))}

          {last ? (
            <text x={geometry.x(points.length - 1) + 12} y={geometry.y(last.value)} dominantBaseline="middle" fontSize={12} fontWeight={600} fill="var(--foreground)">
              {formatPercent(last.value)}
            </text>
          ) : null}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} aria-hidden />
      )}

      {current && active !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sheet"
          style={{ left: Math.min(Math.max(geometry.x(active), 80), Math.max(width - 80, 80)), top: Math.max(geometry.y(current.value) - 74, 0) }}
        >
          <p className="flex items-center gap-2 font-semibold tabular-nums">
            <span className="inline-block h-0.5 w-3.5 rounded bg-primary" aria-hidden />
            {formatPercent(current.value)}
          </p>
          <p className="mt-0.5 text-[0.8125rem]">{current.label}</p>
          <p className="text-xs text-muted-foreground">{current.detail}</p>
        </div>
      ) : null}
    </div>
  );
}
