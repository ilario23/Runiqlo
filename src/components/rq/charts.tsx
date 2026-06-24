// Runner's Almanac — shared topographic SVG primitives (editorial broadsheet).
// Ported from the design bundle (charts.jsx), typed for the real app.

// Carbon-instrument tokens (CSS vars resolve in SVG attrs + adapt to theme/accent).
export const RQ = {
  ink: 'var(--text)',
  ink2: 'var(--dim)',
  ink3: 'var(--faint)',
  rule: 'var(--line)',
  rule2: 'var(--line-2)',
  paper: 'var(--bg)',
  paper2: 'var(--panel)',
  paper3: 'var(--panel-2)',
  rust: 'var(--accent)',
  rustDim: 'var(--accent-2)',
} as const;

export type Pt = [number, number];

interface ScaleOpts {
  x0: number;
  y0: number;
  w: number;
  h: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Scale [x,y] points into a viewport (y inverted for SVG). */
export function scaleTo(pts: Pt[], {x0, y0, w, h, xMin, xMax, yMin, yMax}: ScaleOpts): Pt[] {
  const xR = xMax - xMin || 1;
  const yR = yMax - yMin || 1;
  return pts.map(([x, y]) => [x0 + ((x - xMin) / xR) * w, y0 + h - ((y - yMin) / yR) * h]);
}

/** Cubic-smoothed SVG path "d" from points. */
export function smoothPath(pts: Pt[]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

/** A "topographic" line: main stroke + fainter parallel contour copies below. */
export function TopoLine({
  d,
  color = RQ.ink,
  width = 1.4,
  contours = 4,
  contourGap = 6,
  contourColor = RQ.rule,
  contourOpacity = 0.45,
}: {
  d: string;
  color?: string;
  width?: number;
  contours?: number;
  contourGap?: number;
  contourColor?: string;
  contourOpacity?: number;
}) {
  const lines = [];
  for (let i = contours; i >= 1; i--) {
    lines.push(
      <path
        key={i}
        d={d}
        stroke={contourColor}
        strokeOpacity={contourOpacity * (1 - i / (contours + 1))}
        strokeWidth={0.6}
        fill="none"
        transform={`translate(0 ${i * contourGap})`}
      />,
    );
  }
  return (
    <g>
      {lines}
      <path d={d} stroke={color} strokeWidth={width} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}

/** Horizontal contour grid backdrop. */
export function ContourBg({
  x,
  y,
  w,
  h,
  lines = 6,
  stroke = RQ.rule,
  opacity = 0.5,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lines?: number;
  stroke?: string;
  opacity?: number;
}) {
  const els = [];
  for (let i = 0; i <= lines; i++) {
    const yy = y + (i * h) / lines;
    els.push(
      <line
        key={i}
        x1={x}
        y1={yy}
        x2={x + w}
        y2={yy}
        stroke={stroke}
        strokeOpacity={opacity * (i % 2 === 0 ? 1 : 0.4)}
        strokeWidth={i % 3 === 0 ? 0.8 : 0.5}
      />,
    );
  }
  return <g>{els}</g>;
}

/** X-axis tick marks + labels. */
export function XAxis({
  x,
  y,
  w,
  ticks,
  color = RQ.ink3,
}: {
  x: number;
  y: number;
  w: number;
  ticks: {pos: number; label: string}[];
  color?: string;
}) {
  return (
    <g>
      {ticks.map((t, i) => (
        <g key={i} transform={`translate(${x + t.pos * w},${y})`}>
          <line x1={0} y1={0} x2={0} y2={4} stroke={color} strokeWidth={0.8} />
          <text x={0} y={16} fontFamily="var(--mono)" fontSize={9} fill={color} textAnchor="middle">
            {t.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Small sparkline path (no contours). */
export function Spark({pts, color = RQ.ink, width = 1, fill = 'none'}: {pts: Pt[]; color?: string; width?: number; fill?: string}) {
  return (
    <path d={smoothPath(pts)} stroke={color} strokeWidth={width} fill={fill} strokeLinejoin="round" strokeLinecap="round" />
  );
}

/** Elevation profile — solid fill below an ink top stroke. */
export function ElevationProfile({
  pts,
  x,
  y,
  w,
  h,
  fill = RQ.ink,
  stroke = RQ.ink,
  ymin,
  ymax,
}: {
  pts: Pt[];
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  ymin: number;
  ymax: number;
}) {
  if (pts.length < 2) return null;
  const xMin = pts[0][0];
  const xMax = pts[pts.length - 1][0];
  const scaled = scaleTo(pts, {x0: x, y0: y, w, h, xMin, xMax, yMin: ymin, yMax: ymax});
  const top = smoothPath(scaled);
  const area = `${top} L ${x + w},${y + h} L ${x},${y + h} Z`;
  return (
    <g>
      <path d={area} fill={fill} fillOpacity={0.85} />
      <path d={top} stroke={stroke} strokeWidth={1.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}

/** Heart-rate curve over horizontal zone bands. */
export function HRTrace({
  pts,
  x,
  y,
  w,
  h,
  ymin = 100,
  ymax = 195,
  zones,
}: {
  pts: Pt[];
  x: number;
  y: number;
  w: number;
  h: number;
  ymin?: number;
  ymax?: number;
  zones?: {lo: number; hi: number}[];
}) {
  if (pts.length < 2) return null;
  const xMin = pts[0][0];
  const xMax = pts[pts.length - 1][0];
  const scaled = scaleTo(pts, {x0: x, y0: y, w, h, xMin, xMax, yMin: ymin, yMax: ymax});
  const zoneColors = ['#dfe8d8', '#c8d9b8', '#e9c490', '#dc8a5b', '#c93f1d'];
  const bandEls: React.ReactNode[] = [];
  if (zones) {
    zones.forEach((z, i) => {
      const yTop = y + h - ((z.hi - ymin) / (ymax - ymin)) * h;
      const yBot = y + h - ((z.lo - ymin) / (ymax - ymin)) * h;
      bandEls.push(
        <rect key={i} x={x} y={yTop} width={w} height={yBot - yTop} fill={zoneColors[i % zoneColors.length]} fillOpacity={0.35} />,
        <text key={`l${i}`} x={x + w + 4} y={(yTop + yBot) / 2 + 3} fontSize={9} fontFamily="var(--mono)" fill={RQ.ink3}>
          Z{i + 1}
        </text>,
      );
    });
  }
  return (
    <g>
      {bandEls}
      <path d={smoothPath(scaled)} stroke={RQ.rust} strokeWidth={1.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}
