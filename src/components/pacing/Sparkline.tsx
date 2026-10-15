import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface Props {
  data: number[];
  color?: string;
  height?: number;
  width?: number | string;
}

export function Sparkline({ data, color = "hsl(var(--primary))", height = 24, width = 80 }: Props) {
  const series = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
