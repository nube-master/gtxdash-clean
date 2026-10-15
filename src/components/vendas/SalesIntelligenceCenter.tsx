import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, Globe2, Smartphone, Wifi, Calendar,
  Users, MapPin, Trophy, Search, Package,
} from "lucide-react";
import { resolveProductName } from "@/lib/productNames";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ComposableMap, Geographies, Geography,
} from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import type { LiveSale } from "@/hooks/useLiveSales";
import { ISO_ALPHA2, alpha2ToName } from "@/lib/iso3166";

// World topojson hosted (small file, ~250 features) — uses ISO numeric IDs.
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const COLORS = [
  "hsl(var(--primary))",
  "hsl(217 91% 60%)",
  "hsl(142 76% 45%)",
  "hsl(38 92% 55%)",
  "hsl(0 84% 60%)",
  "hsl(280 70% 60%)",
  "hsl(190 80% 50%)",
];

interface Bucket {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

function aggregate(
  sales: LiveSale[],
  getter: (s: LiveSale) => string | null | undefined,
  fallback = "Desconhecido",
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const s of sales) {
    const raw = (getter(s) || "").toString().trim();
    const key = raw || fallback;
    const entry = map.get(key) || { key, label: key, count: 0, revenue: 0 };
    entry.count++;
    entry.revenue += Number(s.revenue || 0);
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function deviceCategory(s: LiveSale): string {
  const raw = (s.device || "").toLowerCase();
  if (raw.includes("phone")) return "Mobile";
  if (raw.includes("tablet")) return "Tablet";
  if (raw.includes("desktop") || raw.includes("computer")) return "Desktop";
  if (raw.includes("mobile")) return "Mobile";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Desconhecido";
}

interface Props {
  sales: LiveSale[];
}

export function SalesIntelligenceCenter({ sales }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState("geo");
  const [citySearch, setCitySearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // Only count approved sales with geo data
  const validSales = useMemo(
    () => sales.filter((s) => s.status === "approved" && Number(s.revenue || 0) > 0),
    [sales],
  );

  const totalRevenue = useMemo(
    () => validSales.reduce((acc, s) => acc + Number(s.revenue || 0), 0),
    [validSales],
  );
  const totalCount = validSales.length;

  // ─── Geo aggregations ───
  const byCountry = useMemo(() => aggregate(validSales, (s) => s.country, "Sem país"), [validSales]);
  const byRegion = useMemo(() => {
    const filtered = selectedCountry
      ? validSales.filter((s) => (s.country || "").toUpperCase() === selectedCountry)
      : validSales;
    return aggregate(filtered, (s) => s.region, "Sem estado");
  }, [validSales, selectedCountry]);
  const byCity = useMemo(() => {
    const filtered = selectedCountry
      ? validSales.filter((s) => (s.country || "").toUpperCase() === selectedCountry)
      : validSales;
    const list = aggregate(filtered, (s) => {
      const c = (s.city || "").trim();
      const r = (s.region || "").trim();
      return c ? (r ? `${c}, ${r}` : c) : null;
    }, "Sem cidade");
    if (!citySearch) return list;
    const q = citySearch.toLowerCase();
    return list.filter((b) => b.label.toLowerCase().includes(q));
  }, [validSales, selectedCountry, citySearch]);

  // ─── Device aggregations ───
  const byDevice = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const s of validSales) {
      const key = deviceCategory(s);
      const e = map.get(key) || { key, label: key, count: 0, revenue: 0 };
      e.count++;
      e.revenue += Number(s.revenue || 0);
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [validSales]);
  const byBrand = useMemo(() => aggregate(validSales, (s) => s.device_brand, "Outras marcas"), [validSales]);
  const byOS = useMemo(() => aggregate(validSales, (s) => s.os, "Sem OS"), [validSales]);

  // ─── Network aggregations ───
  const byBrowser = useMemo(() => aggregate(validSales, (s) => s.browser, "Sem browser"), [validSales]);
  const byConnection = useMemo(() => aggregate(validSales, (s) => s.connection_type, "Sem conexão"), [validSales]);
  const byIsp = useMemo(() => aggregate(validSales, (s) => s.isp, "Sem ISP"), [validSales]);

  // ─── Oferta / Plataforma / Produto (parse RedTrack offer_name segments) ───
  // Format: "Traffic | Platform | Apelido | Variant" (ex: "Facebook | Clickbank | MMP | mmp-mltom-adsvideo")
  const parseOfferSeg = (s: LiveSale, idx: number): string | null => {
    const raw = (s.offer_name || "").trim();
    if (!raw) return null;
    const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
    return parts[idx] || null;
  };
  const byOferta = useMemo(
    () => aggregate(validSales, (s) => parseOfferSeg(s, 2), "Sem oferta"),
    [validSales],
  );
  const byCheckout = useMemo(
    () => aggregate(validSales, (s) => {
      const raw = (parseOfferSeg(s, 1) || "").toLowerCase();
      if (!raw) return null;
      if (raw.includes("cartpanda")) return "CartPanda";
      if (raw.includes("buygoods")) return "BuyGoods";
      if (raw.includes("digistore")) return "Digistore24";
      if (raw.includes("clickbank")) return "ClickBank";
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }, "Sem plataforma"),
    [validSales],
  );
  const byProduto = useMemo(
    () => aggregate(
      validSales,
      (s) => resolveProductName(s.offer_name, s.product_name, "") || null,
      "Sem produto",
    ),
    [validSales],
  );

  // ─── Time aggregations ───
  const byHour = useMemo(() => {
    const arr: Bucket[] = Array.from({ length: 24 }, (_, h) => ({
      key: String(h), label: `${h.toString().padStart(2, "0")}h`, count: 0, revenue: 0,
    }));
    for (const s of validSales) {
      try {
        const d = new Date(s.created_at);
        const h = new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false,
        }).format(d);
        const idx = parseInt(h, 10);
        if (idx >= 0 && idx < 24) {
          arr[idx].count++;
          arr[idx].revenue += Number(s.revenue || 0);
        }
      } catch { /* skip */ }
    }
    return arr;
  }, [validSales]);

  const byWeekday = useMemo(() => {
    const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const arr: Bucket[] = labels.map((l, i) => ({ key: String(i), label: l, count: 0, revenue: 0 }));
    for (const s of validSales) {
      try {
        const d = new Date(s.created_at);
        // SP timezone weekday
        const wd = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay();
        arr[wd].count++;
        arr[wd].revenue += Number(s.revenue || 0);
      } catch { /* skip */ }
    }
    return arr;
  }, [validSales]);

  // ─── Map color scale ───
  const maxCountryRevenue = byCountry[0]?.revenue || 1;
  const colorScale = scaleLinear<string>()
    .domain([0, maxCountryRevenue])
    .range(["hsl(var(--muted))", "hsl(var(--primary))"]);

  // Map alpha-2 → revenue for choropleth
  const revenueByAlpha2 = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of byCountry) {
      m.set(b.key.toUpperCase(), b.revenue);
    }
    return m;
  }, [byCountry]);

  const revenueByNumericId = useMemo(() => {
    const m = new Map<string, number>();
    for (const [alpha2, info] of Object.entries(ISO_ALPHA2)) {
      const rev = revenueByAlpha2.get(alpha2);
      if (rev) m.set(info.numeric, rev);
    }
    return m;
  }, [revenueByAlpha2]);

  if (totalCount === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-muted-foreground">
          <Globe2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Sem vendas no período para gerar inteligência geográfica.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Globe2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Central de Inteligência de Vendas</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalCount} vendas · {fmtBRL(totalRevenue)} · Geografia, dispositivo, conexão e tempo
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="geo" className="gap-2">
                <MapPin className="h-3.5 w-3.5" /> Geografia
              </TabsTrigger>
              <TabsTrigger value="offers" className="gap-2">
                <Package className="h-3.5 w-3.5" /> Ofertas
              </TabsTrigger>
              <TabsTrigger value="device" className="gap-2">
                <Smartphone className="h-3.5 w-3.5" /> Dispositivo
              </TabsTrigger>
              <TabsTrigger value="network" className="gap-2">
                <Wifi className="h-3.5 w-3.5" /> Rede
              </TabsTrigger>
              <TabsTrigger value="time" className="gap-2">
                <Calendar className="h-3.5 w-3.5" /> Tempo
              </TabsTrigger>
            </TabsList>

            {/* ─── GEOGRAFIA ─── */}
            <TabsContent value="geo" className="space-y-4 mt-4">
              {/* Top 5 countries cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {byCountry.slice(0, 5).map((c, i) => {
                  const isSelected = selectedCountry === c.key.toUpperCase();
                  const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
                  return (
                    <button
                      key={c.key}
                      onClick={() =>
                        setSelectedCountry(isSelected ? null : c.key.toUpperCase())
                      }
                      className={`text-left rounded-lg border p-3 transition-all hover:border-primary/50 hover:shadow-md ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-bold" style={{ color: COLORS[i] }}>
                          {c.key}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {pct.toFixed(0)}%
                        </Badge>
                      </div>
                      <div className="text-sm font-bold">{fmtBRL(c.revenue)}</div>
                      <div className="text-[11px] text-muted-foreground">{c.count} vendas</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-1">
                        {alpha2ToName(c.key)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* World map + drill-down side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 rounded-lg border bg-card/50 p-2 overflow-hidden">
                  <div className="text-xs font-medium px-2 py-1 text-muted-foreground">
                    Mapa mundial · intensidade por faturamento
                  </div>
                  <div className="aspect-[2/1] w-full">
                    <ComposableMap
                      projectionConfig={{ scale: 140 }}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <Geographies geography={GEO_URL}>
                        {({ geographies }) =>
                          geographies.map((geo) => {
                            const id = String(geo.id).padStart(3, "0");
                            const rev = revenueByNumericId.get(id) || 0;
                            const name = geo.properties?.name || "";
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={rev > 0 ? colorScale(rev) : "hsl(var(--muted))"}
                                stroke="hsl(var(--border))"
                                strokeWidth={0.4}
                                style={{
                                  default: { outline: "none" },
                                  hover: { fill: "hsl(var(--primary))", outline: "none", cursor: "pointer" },
                                  pressed: { outline: "none" },
                                }}
                              >
                                <title>{`${name}${rev > 0 ? ` · ${fmtBRL(rev)}` : ""}`}</title>
                              </Geography>
                            );
                          })
                        }
                      </Geographies>
                    </ComposableMap>
                  </div>
                </div>

                {/* Cities ranking */}
                <div className="rounded-lg border bg-card/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Trophy className="h-3.5 w-3.5" />
                      Top cidades {selectedCountry && (
                        <Badge variant="secondary" className="text-[10px]">{selectedCountry}</Badge>
                      )}
                    </div>
                    {selectedCountry && (
                      <button
                        onClick={() => setSelectedCountry(null)}
                        className="text-[10px] text-primary hover:underline"
                      >
                        limpar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cidade..."
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      className="pl-7 h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {byCity.slice(0, 30).map((c) => {
                      const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
                      return (
                        <div key={c.key} className="text-xs">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="truncate font-medium">{c.label}</span>
                            <span className="font-mono text-muted-foreground ml-2">
                              {c.count}× · {fmtBRL(c.revenue)}
                            </span>
                          </div>
                          <Progress value={pct} className="h-1" />
                        </div>
                      );
                    })}
                    {byCity.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhuma cidade encontrada
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Region/State drill-down */}
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Estados / Regiões {selectedCountry && `· ${selectedCountry}`}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Estado/Região</TableHead>
                      <TableHead className="text-xs text-right">Vendas</TableHead>
                      <TableHead className="text-xs text-right">Faturamento</TableHead>
                      <TableHead className="text-xs text-right">% do total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byRegion.slice(0, 15).map((r) => {
                      const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
                      return (
                        <TableRow key={r.key}>
                          <TableCell className="text-xs font-medium">{r.label}</TableCell>
                          <TableCell className="text-xs text-right">{r.count}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{fmtBRL(r.revenue)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">
                            {pct.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ─── DISPOSITIVO ─── */}
            {/* ─── OFERTAS ─── */}
            <TabsContent value="offers" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DonutCard title={`Por Oferta (${byOferta.length})`} data={byOferta.slice(0, 8)} />
                <DonutCard title="Plataforma de Checkout" data={byCheckout} />
                <DonutCard title="Por Produto" data={byProduto.slice(0, 8)} />
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                Distribuição extraída do <code>offer_name</code> do RedTrack — formato <code>Tráfego | Plataforma | Apelido | Variante</code>.
              </p>
            </TabsContent>

            {/* ─── DISPOSITIVO ─── */}
            <TabsContent value="device" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DonutCard title="Tipo de Dispositivo" data={byDevice} />
                <DonutCard title="Sistema Operacional" data={byOS.slice(0, 6)} />
                <RankCard title="Top Marcas" data={byBrand.slice(0, 8)} icon={Smartphone} />
              </div>
            </TabsContent>

            {/* ─── REDE ─── */}
            <TabsContent value="network" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DonutCard title="Navegador" data={byBrowser.slice(0, 6)} />
                <DonutCard title="Tipo de Conexão" data={byConnection} />
                <RankCard title="Top ISPs (Provedores)" data={byIsp.slice(0, 8)} icon={Wifi} />
              </div>
            </TabsContent>

            {/* ─── TEMPO ─── */}
            <TabsContent value="time" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border bg-card/50 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Vendas por hora (BRT)
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byHour}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        formatter={(value: any, name: string) =>
                          name === "revenue" ? fmtBRL(Number(value)) : value
                        }
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Faturamento" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-lg border bg-card/50 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Vendas por dia da semana
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byWeekday}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        formatter={(value: any, name: string) =>
                          name === "revenue" ? fmtBRL(Number(value)) : value
                        }
                      />
                      <Bar dataKey="revenue" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} name="Faturamento" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground italic flex items-center gap-1">
                <Users className="h-3 w-3" />
                Observação: Dados de gênero não estão disponíveis via RedTrack/Meta por restrições de privacidade.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Sub-components ─── */

function DonutCard({ title, data }: { title: string; data: Bucket[] }) {
  const total = data.reduce((acc, b) => acc + b.revenue, 0);
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">{title}</div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="revenue"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value: any) => fmtBRL(Number(value))}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1 mt-2">
        {data.slice(0, 5).map((b, i) => {
          const pct = total > 0 ? (b.revenue / total) * 100 : 0;
          return (
            <div key={b.key} className="flex items-center gap-2 text-[11px]">
              <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="truncate flex-1">{b.label}</span>
              <span className="font-mono text-muted-foreground">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankCard({ title, data, icon: Icon }: { title: string; data: Bucket[]; icon: any }) {
  const max = data[0]?.revenue || 1;
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="space-y-2">
        {data.map((b, i) => {
          const pct = (b.revenue / max) * 100;
          return (
            <div key={b.key} className="text-xs">
              <div className="flex justify-between items-center mb-0.5">
                <span className="truncate font-medium" title={b.label}>
                  {i + 1}. {b.label}
                </span>
                <span className="font-mono text-muted-foreground ml-2 whitespace-nowrap">
                  {b.count}× · {fmtBRL(b.revenue)}
                </span>
              </div>
              <Progress value={pct} className="h-1" />
            </div>
          );
        })}
        {data.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Sem dados</p>
        )}
      </div>
    </div>
  );
}
