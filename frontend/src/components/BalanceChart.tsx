export interface BalancePoint {
  date: string;
  balance: number;
}

const WIDTH = 640;
const HEIGHT = 160;
const PAD = { top: 12, right: 12, bottom: 24, left: 8 };

/** A small inline-SVG line/area chart of an account's balance over time,
 * drawn to its own data's scale so every gridline label is a real value
 * the chart reaches (per the house style: draw to the scale, never guess
 * a fixed axis). Renders nothing meaningful below two points. */
export function BalanceChart({ points }: { points: BalancePoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-slate-400">Not enough monthly balance history to chart yet.</p>;
  }

  const values = points.map((p) => p.balance);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(
    PAD.top + innerH
  ).toFixed(1)} Z`;

  const zeroY = y(0);
  const money = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;

  // Show a handful of month labels rather than every point, so they never overlap.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Balance over time">
      <line x1={PAD.left} y1={zeroY} x2={WIDTH - PAD.right} y2={zeroY} stroke="#262B33" strokeWidth={1} />
      <path d={areaPath} fill="#5B8DEF" fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke="#5B8DEF" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.balance)} r={2.5} fill="#5B8DEF" />
      ))}
      {points.map((p, i) =>
        i % labelStep === 0 ? (
          <text key={p.date} x={x(i)} y={HEIGHT - 6} fontSize={9} fill="#94A3B8" textAnchor="middle">
            {new Date(p.date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
          </text>
        ) : null
      )}
      <text x={PAD.left} y={PAD.top + 8} fontSize={9} fill="#94A3B8">
        {money(max)}
      </text>
      {min < 0 && (
        <text x={PAD.left} y={PAD.top + innerH} fontSize={9} fill="#94A3B8">
          {money(min)}
        </text>
      )}
    </svg>
  );
}
