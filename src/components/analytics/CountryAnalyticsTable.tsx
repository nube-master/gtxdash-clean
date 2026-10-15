import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { CountryPerformance } from "@/hooks/useCountryPerformance";
import { CountryAnalyticsModal } from "./CountryAnalyticsModal";
import { useOperationId } from "@/contexts/OperationContext";
import { useDateRange } from "@/contexts/DateRangeContext";

const fmtBRL = (v: number) =>
  `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtBRL2 = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// Lightweight flag fallback using Emoji or external service if needed
// For now using a simple emoji mapping or standard codes
const getFlagEmoji = (countryCode: string) => {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char =>  127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

interface CountryAnalyticsTableProps {
  data: CountryPerformance[];
}

type SortKey = keyof CountryPerformance;

export function CountryAnalyticsTable({ data }: CountryAnalyticsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("total_spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const opId = useOperationId();
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const va = a[sortKey] as any;
      const vb = b[sortKey] as any;
      if (typeof va === "string" || typeof vb === "string") {
        return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      }
      return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const avgCpa = useMemo(() => {
    const totalSpend = data.reduce((acc, r) => acc + r.total_spend, 0);
    const totalPurchases = data.reduce((acc, r) => acc + r.total_purchases, 0);
    return totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  }, [data]);

  if (data.length === 0) return (
    <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
      Nenhum dado geolocalizado encontrado para este período.
    </div>
  );

  return (
    <Card className="overflow-hidden border border-border/50">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[180px] h-10">
                <button onClick={() => toggleSort("country_code")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  País <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right h-10">
                <button onClick={() => toggleSort("total_spend")} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                  Investido <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right h-10">LP Views</TableHead>
              <TableHead className="text-right h-10">
                <button onClick={() => toggleSort("connect_rate")} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                  CR% <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right h-10">ICs</TableHead>
              <TableHead className="text-right h-10">Vendas</TableHead>
              <TableHead className="text-right h-10">
                <button onClick={() => toggleSort("real_revenue")} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                  Receita Real <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right h-10">
                <button onClick={() => toggleSort("real_roas")} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                  ROAS Real <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right h-10">
                <button onClick={() => toggleSort("cpa")} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                  CPA <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>

            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              const isHighCpa = avgCpa > 0 && r.cpa > avgCpa * 1.5;
              const isLowCr = r.connect_rate > 0 && r.connect_rate < 70;

              return (
                <TableRow 
                  key={r.country_code} 
                  className="group hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedCountry(r.country_code)}
                >
                  <TableCell className="font-medium flex items-center gap-2">
                    <span className="text-lg" title={r.country_code}>{getFlagEmoji(r.country_code)}</span>
                    <span className="font-mono text-xs">{r.country_code}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBRL(r.total_spend)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    <div className="flex flex-col items-end">
                      <span>{fmtInt(r.total_lp_views)}</span>
                      <span className="text-[9px] opacity-50 uppercase tracking-tighter">
                        {fmtInt(r.total_impressions)} Imp / {fmtInt(r.total_clicks)} Click
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${isLowCr ? "text-amber-500" : "text-[#24D67E]"}`}>
                    <div className="flex items-center justify-end gap-1">
                      {fmtPct(r.connect_rate)}
                      {isLowCr && (
                        <span title="Connect Rate abaixo de 70%">
                          <AlertTriangle className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtInt(r.total_ics)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtInt(r.total_purchases)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[#24D67E] font-medium">{fmtBRL(r.real_revenue)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-bold ${r.real_roas >= 1 ? "text-[#24D67E]" : "text-[#F2354A]"}`}>
                    {r.real_roas.toFixed(2)}x
                  </TableCell>

                  <TableCell className={`text-right tabular-nums ${isHighCpa ? "text-[#F2354A] font-bold" : ""}`}>
                    <div className="flex items-center justify-end gap-1">
                      {fmtBRL2(r.cpa)}
                      {isHighCpa && (
                        <span title="CPA 50% acima da média">
                          <TrendingUp className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </TableCell>

                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {opId && (
        <CountryAnalyticsModal
          countryCode={selectedCountry}
          isOpen={!!selectedCountry}
          onClose={() => setSelectedCountry(null)}
          operationId={opId}
          startDate={start}
          endDate={end}
        />
      )}
    </Card>
  );
}
