import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VslFunnelProps {
  uniqueViews: number;
  totalPlays: number;
  audienceAtPitch: number;
  buttonClicks: number;
  conversions: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

export function VslFunnel({ uniqueViews, totalPlays, audienceAtPitch, buttonClicks, conversions }: VslFunnelProps) {
  const steps = [
    { label: "Visitantes", value: totalPlays },
    { label: "Plays Únicos", value: uniqueViews },
    { label: "Audiência no Pitch", value: audienceAtPitch },
    { label: "Cliques", value: buttonClicks },
    { label: "Conversões", value: conversions },
  ];

  const base = Math.max(steps[0].value, 1);

  // Ensure monotonically decreasing (cap each to previous)
  const visual = [base];
  for (let i = 1; i < steps.length; i++) {
    visual.push(Math.min(steps[i].value, visual[i - 1]));
  }

  // Pass-through rate from previous step
  const dropLabels = steps.map((s, i) => {
    if (i === 0) return "100%";
    const prev = visual[i - 1];
    if (prev <= 0) return "0%";
    const pct = Math.min((s.value / prev) * 100, 100);
    return `${pct.toFixed(1)}%`;
  });

  // Cube-root scale for smoother visual narrowing
  const cbrtBase = Math.cbrt(base);
  const fracs = visual.map((v) => Math.max(Math.cbrt(v) / cbrtBase, 0.08));

  // SVG dimensions
  const W = 1000;
  const H = 100;
  const cy = H / 2;
  const colW = W / steps.length;
  const maxHalf = H * 0.42;

  const heights = fracs.map((f) => f * maxHalf);

  function buildPath(): string {
    const topPts: { x: number; y: number }[] = [];
    const botPts: { x: number; y: number }[] = [];

    for (let i = 0; i <= steps.length; i++) {
      const x = i * colW;
      let h: number;
      if (i === 0) h = heights[0];
      else if (i === steps.length) h = heights[steps.length - 1] * 0.75;
      else h = (heights[i - 1] + heights[i]) / 2;

      topPts.push({ x, y: cy - h });
      botPts.push({ x, y: cy + h });
    }

    // Smooth path with cubic bezier
    let d = `M ${topPts[0].x} ${cy}`;
    d += ` Q ${topPts[0].x} ${topPts[0].y}, ${topPts[0].x + 12} ${topPts[0].y}`;

    for (let i = 0; i < topPts.length - 1; i++) {
      const p0 = i === 0 ? { x: topPts[0].x + 12, y: topPts[0].y } : topPts[i];
      const p1 = topPts[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) * 0.55;
      const cp2x = p0.x + (p1.x - p0.x) * 0.45;
      d += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const lastBot = botPts[botPts.length - 1];
    d += ` L ${lastBot.x} ${lastBot.y}`;

    for (let i = botPts.length - 2; i >= 0; i--) {
      const p0 = botPts[i + 1];
      const p1 = i === 0 ? { x: botPts[0].x + 12, y: botPts[0].y } : botPts[i];
      const cp1x = p0.x - (p0.x - p1.x) * 0.45;
      const cp2x = p0.x - (p0.x - p1.x) * 0.55;
      d += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    d += ` Q ${botPts[0].x} ${botPts[0].y}, ${botPts[0].x} ${cy}`;
    d += " Z";
    return d;
  }

  return (
    <Card className="wr-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Funil de Conversão
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Labels */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
          {steps.map((s) => (
            <div key={s.label} className="text-center">
              <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>

        {/* SVG Funnel */}
        <div className="mt-2 mb-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="funnelGrad2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                <stop offset="40%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
                <stop offset="75%" stopColor="hsl(var(--destructive))" stopOpacity="0.4" />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity="0.25" />
              </linearGradient>
            </defs>
            <path d={buildPath()} fill="url(#funnelGrad2)" />

            {steps.map((s, i) => {
              const cx = i * colW + colW / 2;
              return (
                <text
                  key={s.label}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="Inter, system-ui, sans-serif"
                  opacity={0.85}
                >
                  {dropLabels[i]}
                </text>
              );
            })}

            {steps.slice(1).map((_, i) => {
              const x = (i + 1) * colW;
              return (
                <line key={i} x1={x} y1={0} x2={x} y2={H} stroke="hsl(var(--border))" strokeWidth="1" opacity="0.12" />
              );
            })}
          </svg>
        </div>

        {/* Values */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
          {steps.map((s) => (
            <div key={s.label} className="text-center">
              <span className="text-sm font-bold font-data text-foreground">{fmt(s.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
