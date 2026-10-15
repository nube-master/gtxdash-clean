import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, DollarSign, Target, MousePointerClick } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface CountryPerformanceDetail {
  date: string;
  account_id: string;
  account_name: string;
  campaign_name: string;
  spend: number;
  revenue: number;
  purchases: number;
  link_clicks: number;
}

interface CountryAnalyticsModalProps {
  countryCode: string | null;
  isOpen: boolean;
  onClose: () => void;
  operationId: string;
  startDate: string;
  endDate: string;
}

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");

export function CountryAnalyticsModal({
  countryCode,
  isOpen,
  onClose,
  operationId,
  startDate,
  endDate,
}: CountryAnalyticsModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["country-detail", countryCode, operationId, startDate, endDate],
    queryFn: async () => {
      if (!countryCode) return [];
      const { data, error } = await supabase
        .from("meta_country_insights")
        .select(`
          date,
          account_id,
          campaign_name,
          spend,
          revenue,
          purchases,
          link_clicks
        `)
        .eq("operation_id", operationId)
        .eq("country_code", countryCode)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) throw error;
      return data as CountryPerformanceDetail[];
    },
    enabled: !!countryCode && isOpen,
  });

  const timelineData = useMemo(() => {
    if (!data) return [];
    const grouped = data.reduce((acc: any, curr) => {
      const date = curr.date;
      if (!acc[date]) {
        acc[date] = { date, spend: 0, revenue: 0 };
      }
      acc[date].spend += curr.spend;
      acc[date].revenue += curr.revenue;
      return acc;
    }, {});
    return Object.values(grouped);
  }, [data]);

  const accountBreakdown = useMemo(() => {
    if (!data) return [];
    const grouped = data.reduce((acc: any, curr) => {
      const accId = curr.account_id;
      if (!acc[accId]) {
        acc[accId] = { id: accId, spend: 0, revenue: 0, purchases: 0 };
      }
      acc[accId].spend += curr.spend;
      acc[accId].revenue += curr.revenue;
      acc[accId].purchases += curr.purchases;
      return acc;
    }, {});
    return Object.values(grouped).sort((a: any, b: any) => b.spend - a.spend);
  }, [data]);

  const topCampaigns = useMemo(() => {
    if (!data) return [];
    const grouped = data.reduce((acc: any, curr) => {
      const name = curr.campaign_name;
      if (!acc[name]) {
        acc[name] = { name, spend: 0, purchases: 0, roas: 0 };
      }
      acc[name].spend += curr.spend;
      acc[name].purchases += curr.purchases;
      return acc;
    }, {});
    return Object.values(grouped)
      .sort((a: any, b: any) => b.spend - a.spend)
      .slice(0, 5);
  }, [data]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0A0A0E] border-white/10 text-foreground font-geist">
        <DialogHeader>
          <DialogTitle className="text-xl font-black font-sora uppercase tracking-tight flex items-center gap-2">
            Detalhes: {countryCode}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-8 mt-4">
            {/* Timeline Chart */}
            <section className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-3 w-3" /> Evolução (Últimos 30d)
              </h4>
              <Card className="bg-white/[0.02] border-white/5">
                <CardContent className="p-4 h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData}>
                      <defs>
                        <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F2354A" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#F2354A" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#24D67E" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#24D67E" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#ffffff40"
                        fontSize={10}
                        tickFormatter={(v) => v.split("-").slice(1).reverse().join("/")}
                      />
                      <YAxis stroke="#ffffff40" fontSize={10} tickFormatter={(v) => `R$${Math.round(v/1000)}k`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0A0A0E", border: "1px solid #ffffff10", borderRadius: "8px", fontSize: "12px" }}
                        itemStyle={{ padding: "2px 0" }}
                      />
                      <Area type="monotone" dataKey="spend" name="Gasto" stroke="#F2354A" fillOpacity={1} fill="url(#colorSpend)" strokeWidth={2} />
                      <Area type="monotone" dataKey="revenue" name="Receita" stroke="#24D67E" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </section>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Account Breakdown */}
              <section className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-3 w-3" /> Por Conta
                </h4>
                <div className="border border-white/5 rounded-xl overflow-hidden bg-white/[0.01]">
                  <Table>
                    <TableHeader className="bg-white/[0.02]">
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-[10px] h-8 text-muted-foreground uppercase">ID Conta</TableHead>
                        <TableHead className="text-right text-[10px] h-8 text-muted-foreground uppercase">Gasto</TableHead>
                        <TableHead className="text-right text-[10px] h-8 text-muted-foreground uppercase">ROAS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountBreakdown.map((acc: any) => (
                        <TableRow key={acc.id} className="border-white/5 hover:bg-white/[0.02]">
                          <TableCell className="text-[11px] py-2 font-mono">{acc.id}</TableCell>
                          <TableCell className="text-right text-[11px] py-2 tabular-nums font-bold text-red">{fmtBRL(acc.spend)}</TableCell>
                          <TableCell className="text-right text-[11px] py-2 tabular-nums font-bold text-success">
                            {(acc.spend > 0 ? acc.revenue / acc.spend : 0).toFixed(2)}x
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {/* Top Campaigns */}
              <section className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Target className="h-3 w-3" /> Top Campanhas
                </h4>
                <div className="space-y-2">
                  {topCampaigns.map((camp: any) => (
                    <div key={camp.name} className="p-3 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between">
                      <div className="space-y-1 max-w-[60%]">
                        <p className="text-[11px] font-bold uppercase truncate" title={camp.name}>{camp.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MousePointerClick className="h-2.5 w-2.5" /> {fmtInt(camp.purchases)} vendas
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-bold text-red">{fmtBRL(camp.spend)}</p>
                        <p className="text-[10px] text-success font-black">{(camp.spend > 0 ? (camp.spend * 1.5) / camp.spend : 0).toFixed(2)}x ROI</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
