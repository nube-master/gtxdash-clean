import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({ data, width = 60, height = 20, color, className }: SparklineProps) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);

    const points = data.map((v, i) => ({
      x: i * stepX,
      y: height - ((v - min) / range) * (height * 0.8) - height * 0.1,
    }));

    // Smooth curve using cubic bezier
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }
    return d;
  }, [data, width, height]);

  if (!data || data.length < 2) return null;

  const trend = data[data.length - 1] - data[0];
  const strokeColor = color || (trend >= 0 ? "hsl(var(--wr-positive))" : "hsl(var(--destructive))");

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`spark-fill-${trend >= 0 ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <path
        d={`${path} L ${(data.length - 1) * (width / (data.length - 1))},${height} L 0,${height} Z`}
        fill={`url(#spark-fill-${trend >= 0 ? "up" : "down"})`}
      />
      {/* Line */}
      <path d={path} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle
        cx={(data.length - 1) * (width / (data.length - 1))}
        cy={(() => {
          const min = Math.min(...data);
          const max = Math.max(...data);
          const range = max - min || 1;
          return height - ((data[data.length - 1] - min) / range) * (height * 0.8) - height * 0.1;
        })()}
        r="2"
        fill={strokeColor}
      />
    </svg>
  );
}
