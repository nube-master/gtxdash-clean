import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface ProjectTrendProps {
  enrichedSales: any[];
  enrichedTraffic: any[];
}

const PROJECT_COLORS: Record<string, string> = {
  NDM: "hsl(262, 83%, 58%)",
  NDB: "hsl(280, 70%, 55%)",
  
  NDR: "hsl(200, 80%, 55%)",
  MO: "hsl(160, 70%, 45%)",
  LDR: "hsl(185, 80%, 45%)",
  CRT: "hsl(340, 75%, 55%)",
  OUTROS: "hsl(220, 8%, 50%)",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-[11px] space-y-1">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(p.value)}
        </p>
      ))}
    </div>
  );
}

export function ProjectTrendChart({ enrichedSales, enrichedTraffic }: ProjectTrendProps) {
  const { chartData, projectCodes } = useMemo(() => {
    const dayProjectMap = new Map<string, Map<string, { revenue: number; spend: number }>>();
    const projectSet = new Set<string>();

    for (const s of enrichedSales) {
      if (s.status !== "approved" || s._project === "OUTROS") continue;
      if (typeof s.date !== "string" || !s.date) continue;
      projectSet.add(s._project);
      const day = s.date;
      if (!dayProjectMap.has(day)) dayProjectMap.set(day, new Map());
      const projMap = dayProjectMap.get(day)!;
      if (!projMap.has(s._project)) projMap.set(s._project, { revenue: 0, spend: 0 });
      projMap.get(s._project)!.revenue += Number(s.revenue);
    }

    for (const t of enrichedTraffic) {
      if (t._project === "OUTROS") continue;
      if (typeof t.date !== "string" || !t.date) continue;
      projectSet.add(t._project);
      const day = t.date;
      if (!dayProjectMap.has(day)) dayProjectMap.set(day, new Map());
      const projMap = dayProjectMap.get(day)!;
      if (!projMap.has(t._project)) projMap.set(t._project, { revenue: 0, spend: 0 });
      projMap.get(t._project)!.spend += Number(t.spend);
    }

    const projectCodes = Array.from(projectSet).sort();
    const chartData = Array.from(dayProjectMap.entries())
      .map(([date, projMap]) => {
        const entry: any = { date: date.slice(5).replace("-", "/"), fullDate: date };
        for (const code of projectCodes) {
          const d = projMap.get(code);
          entry[`${code}_revenue`] = d?.revenue || 0;
          entry[`${code}_profit`] = (d?.revenue || 0) - (d?.spend || 0);
        }
        return entry;
      })
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

    return { chartData, projectCodes };
  }, [enrichedSales, enrichedTraffic]);

  if (chartData.length < 2 || projectCodes.length < 2) return null;

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Tendência de Receita por Projeto
        </h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 8%, 16%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(220, 6%, 50%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(220, 6%, 50%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {projectCodes.map((code) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={`${code}_revenue`}
                  name={`${code} Receita`}
                  stroke={PROJECT_COLORS[code] || PROJECT_COLORS.OUTROS}
                  strokeWidth={2.5}
                  dot={chartData.length <= 14}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
