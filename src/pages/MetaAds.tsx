import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { mockAds, getStructureData } from "@/data/mockData";
import { Zap } from "lucide-react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function MetaAds() {
  const structures = useMemo(() => getStructureData(mockAds), []);
  const totalActive = structures.reduce((s, st) => s + st.active, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meta Ads — Estruturas</h1>
        <p className="text-sm text-muted-foreground font-mono">Detecção automática de padrões [BAIANO]</p>
      </div>

      {/* Active Structures Card */}
      <Card className="warroom-card warroom-glow border-primary/20">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="h-6 w-6 text-primary animate-pulse-glow" />
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Estruturas Ativas Hoje
            </p>
            <p className="text-3xl font-bold font-mono text-primary">{totalActive}</p>
          </div>
          <div className="ml-auto flex gap-2">
            {structures.map((s) => (
              <Badge key={s.structure} variant="secondary" className="font-mono text-xs">
                {s.structure}: {s.active} ativas
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Structure Table */}
      <Card className="warroom-card">
        <CardHeader>
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Performance por Estrutura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">Estrutura</TableHead>
                <TableHead className="font-mono text-xs text-right">Campanhas</TableHead>
                <TableHead className="font-mono text-xs text-right">Ativas</TableHead>
                <TableHead className="font-mono text-xs text-right">Pausadas</TableHead>
                <TableHead className="font-mono text-xs text-right">Spend</TableHead>
                <TableHead className="font-mono text-xs text-right">Receita</TableHead>
                <TableHead className="font-mono text-xs text-right">ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {structures.map((s) => (
                <TableRow key={s.structure}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      [BAIANO][{s.structure}]
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{s.campaigns}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-warroom-positive font-mono">{s.active}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-muted-foreground font-mono">{s.paused}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(s.spend)}</TableCell>
                  <TableCell className="text-right font-mono text-warroom-positive">
                    {formatCurrency(s.revenue)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`font-mono font-bold ${
                        s.roas >= 2 ? "text-warroom-positive" : s.roas >= 1 ? "text-warroom-warning" : "text-warroom-negative"
                      }`}
                    >
                      {s.roas.toFixed(2)}x
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
