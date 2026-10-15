import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ArrowLeft, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

/**
 * Tag Audit: encontra campanhas com tags de produto quebradas/inconsistentes
 * e mostra o spend "invisível" para a regex canônica [PRODUTO].
 */

const KNOWN_PRODUCTS = [
  "VIT-RRT", "BS-COD", "RRT-COD", "DA-COD", "TDM-COD", "CB-COD",
  "NDM", "NDR", "NDB", "NPP", "LDR", "CRT", "CST", "AILULA",
  "MMP", "MMPB", "MEMOPRYL",
];

// Variações "quebradas" que devem ser [PROD] mas aparecem de outras formas
function makeBrokenVariants(prod: string): RegExp[] {
  const noHyphen = prod.replace(/-/g, "");        // VIT-RRT → VITRRT
  const underscore = prod.replace(/-/g, "_");     // VIT-RRT → VIT_RRT
  const spaced = prod.replace(/-/g, " ");         // VIT-RRT → VIT RRT
  const lower = prod.toLowerCase();
  return [
    // dentro de bracket mas com variação: [VITRRT], [vit-rrt], [VIT_RRT]
    new RegExp(`\\[\\s*(${noHyphen}|${underscore}|${spaced}|${lower})\\s*\\]`, "i"),
    // fora de qualquer bracket: menciona o produto solto no nome
    new RegExp(`(^|[^A-Za-z0-9_\\[])${prod}([^A-Za-z0-9_\\]]|$)`, ""),
  ];
}

function analyzeCampaign(name: string) {
  const brackets = Array.from(name.matchAll(/\[([^\]]+)\]/g)).map(m => m[1].trim().toUpperCase());
  const canonicalMatch = KNOWN_PRODUCTS.find(p => brackets.includes(p));

  if (canonicalMatch) return { status: "ok" as const, product: canonicalMatch, reason: null };

  // Tenta detectar variações
  for (const prod of KNOWN_PRODUCTS) {
    const variants = makeBrokenVariants(prod);
    for (const rx of variants) {
      if (rx.test(name)) {
        const isInBracket = new RegExp(`\\[[^\\]]*${prod.replace(/-/g, ".?")}[^\\]]*\\]`, "i").test(name);
        return {
          status: "broken" as const,
          product: prod,
          reason: isInBracket ? "variação dentro de bracket" : "produto sem bracket",
        };
      }
    }
  }

  return { status: "no_tag" as const, product: null, reason: "sem tag de produto reconhecível" };
}

export default function PacingTagAudit() {
  const navigate = useNavigate();
  const opId = useOperationId();
  const [days, setDays] = useState(15);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tag-audit", opId, days],
    queryFn: async () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

      const rows = await fetchAllPaginated<{ campaign_name: string; spend: number; account_id: string }>(
        "traffic_data",
        "campaign_name, spend, account_id",
        (q) => {
          q = q.gte("date", fmt(start)).lte("date", fmt(end));
          if (opId) q = q.eq("operation_id", opId);
          return q;
        },
        "date",
        false,
      );

      // Aggregate by campaign_name
      const byCampaign = new Map<string, { spend: number; accounts: Set<string> }>();
      for (const r of rows as any[]) {
        const cur = byCampaign.get(r.campaign_name) || { spend: 0, accounts: new Set() };
        cur.spend += Number(r.spend || 0);
        cur.accounts.add(r.account_id);
        byCampaign.set(r.campaign_name, cur);
      }

      const analyzed = Array.from(byCampaign.entries()).map(([name, v]) => ({
        campaign_name: name,
        spend: v.spend,
        accounts: v.accounts.size,
        ...analyzeCampaign(name),
      }));

      return analyzed.sort((a, b) => b.spend - a.spend);
    },
    enabled: !!opId,
    staleTime: 60_000,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const ok = data.filter(d => d.status === "ok");
    const broken = data.filter(d => d.status === "broken");
    const noTag = data.filter(d => d.status === "no_tag");
    const sum = (arr: typeof data) => arr.reduce((s, r) => s + r.spend, 0);
    return {
      totalSpend: sum(data),
      okSpend: sum(ok), okCount: ok.length,
      brokenSpend: sum(broken), brokenCount: broken.length,
      noTagSpend: sum(noTag), noTagCount: noTag.length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const problematic = data.filter(d => d.status !== "ok");
    if (!search.trim()) return problematic;
    const s = search.toLowerCase();
    return problematic.filter(d =>
      d.campaign_name.toLowerCase().includes(s) ||
      (d.product || "").toLowerCase().includes(s)
    );
  }, [data, search]);

  const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const exportCsv = () => {
    if (!filtered.length) return;
    const header = ["campaign_name", "status", "produto_detectado", "motivo", "spend_brl", "contas"];
    const rows = filtered.map(r => [
      `"${r.campaign_name.replace(/"/g, '""')}"`,
      r.status,
      r.product || "",
      r.reason || "",
      r.spend.toFixed(2),
      r.accounts,
    ].join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tag-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/pacing")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Auditoria de Tags</h1>
            <p className="text-sm text-muted-foreground">
              Campanhas com tags de produto quebradas ou inconsistentes — spend "invisível" para a regex canônica
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 15)))}
            className="w-24"
            min={1} max={90}
          />
          <span className="text-sm text-muted-foreground">dias</span>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      {isLoading || !stats ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" /> Tags OK
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{brl(stats.okSpend)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.okCount} campanhas · {((stats.okSpend / stats.totalSpend) * 100).toFixed(1)}% do total
              </p>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" /> Tags quebradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{brl(stats.brokenSpend)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.brokenCount} campanhas · variação ou fora de bracket
              </p>
            </CardContent>
          </Card>
          <Card className="border-red-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" /> Sem tag
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{brl(stats.noTagSpend)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.noTagCount} campanhas · nenhum produto reconhecível
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Campanhas problemáticas</CardTitle>
            <Input
              placeholder="Buscar campanha ou produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />
              Nenhuma campanha problemática encontrada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Produto detectado</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs max-w-md truncate" title={r.campaign_name}>
                      {r.campaign_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "broken" ? "outline" : "destructive"}>
                        {r.status === "broken" ? "quebrada" : "sem tag"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.product ? <Badge variant="secondary">{r.product}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reason}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(r.spend)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 200 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Mostrando 200 de {filtered.length}. Use CSV para exportar tudo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
