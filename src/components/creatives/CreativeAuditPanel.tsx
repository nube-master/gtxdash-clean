import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Tag,
  Copy,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Shield,
  CheckCircle2,
} from "lucide-react";
import type { CreativeRow } from "@/lib/creativeUtils";

interface CreativeAuditPanelProps {
  creatives: CreativeRow[];
}

interface AuditIssue {
  type: "no_tag" | "duplicate_cross" | "attribution_mismatch";
  severity: "warning" | "error";
  creativeId: string;
  details: string;
  campaigns?: string[];
  projects?: string[];
  spend?: number;
  revenue?: number;
}

export function CreativeAuditPanel({ creatives }: CreativeAuditPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "no_tag" | "duplicate_cross" | "attribution_mismatch">("all");

  const audit = useMemo(() => {
    const issues: AuditIssue[] = [];

    // 1. Campaigns without project tag
    const noTagCreatives = creatives.filter(
      (c) => c.project.tag === null && c.spend > 0
    );
    for (const c of noTagCreatives) {
      const campaigns = Array.from(c.campaignNames).slice(0, 5);
      issues.push({
        type: "no_tag",
        severity: "warning",
        creativeId: c.creativeId,
        details: `${campaigns.length} campanha(s) sem tag de projeto`,
        campaigns,
        spend: c.spend,
        revenue: c.revenue,
      });
    }

    // 2. Duplicated base creatives across projects
    const byBaseId = new Map<string, CreativeRow[]>();
    for (const c of creatives) {
      if (c.creativeId === "SEM_ID") continue;
      if (!byBaseId.has(c.creativeId)) byBaseId.set(c.creativeId, []);
      byBaseId.get(c.creativeId)!.push(c);
    }
    for (const [baseId, rows] of byBaseId) {
      const projectTags = rows.map((r) => r.project.tag || "Sem Tag");
      const uniqueProjects = [...new Set(projectTags)];
      if (uniqueProjects.length > 1) {
        issues.push({
          type: "duplicate_cross",
          severity: "warning",
          creativeId: baseId,
          details: `Presente em ${uniqueProjects.length} projetos: ${uniqueProjects.join(", ")}`,
          projects: uniqueProjects,
          spend: rows.reduce((s, r) => s + r.spend, 0),
          revenue: rows.reduce((s, r) => s + r.revenue, 0),
        });
      }
    }

    // 3. Attribution mismatches (sales project ≠ traffic project)
    for (const c of creatives) {
      if (c.integrity.status === "cross_project_conflict") {
        issues.push({
          type: "attribution_mismatch",
          severity: "error",
          creativeId: c.creativeId,
          details: c.integrity.details?.[0] || "Conflito de atribuição entre tráfego e vendas",
          campaigns: Array.from(c.campaignNames).slice(0, 3),
          spend: c.spend,
          revenue: c.revenue,
        });
      }
    }

    // Sort: errors first, then by spend desc
    issues.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      return (b.spend || 0) - (a.spend || 0);
    });

    return issues;
  }, [creatives]);

  const filtered = activeTab === "all" ? audit : audit.filter((i) => i.type === activeTab);

  const noTagCount = audit.filter((i) => i.type === "no_tag").length;
  const dupCount = audit.filter((i) => i.type === "duplicate_cross").length;
  const mismatchCount = audit.filter((i) => i.type === "attribution_mismatch").length;
  const totalSpendAtRisk = audit.reduce((s, i) => s + (i.spend || 0), 0);

  if (audit.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-foreground">Auditoria de Integridade</p>
            <p className="text-xs text-muted-foreground">Nenhum problema encontrado no período atual.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tabs = [
    { key: "all" as const, label: "Todos", count: audit.length, icon: Shield },
    { key: "no_tag" as const, label: "Sem Tag", count: noTagCount, icon: Tag },
    { key: "duplicate_cross" as const, label: "Cross-Projeto", count: dupCount, icon: Copy },
    { key: "attribution_mismatch" as const, label: "Atribuição", count: mismatchCount, icon: GitBranch },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Auditoria de Integridade</CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {audit.length} problema{audit.length !== 1 ? "s" : ""}
            </Badge>
            {totalSpendAtRisk > 0 && (
              <Badge variant="destructive" className="text-[10px] font-mono">
                R$ {totalSpendAtRisk.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} em risco
              </Badge>
            )}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Issues List */}
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {filtered.map((issue, idx) => (
                <div
                  key={`${issue.type}-${issue.creativeId}-${idx}`}
                  className={`rounded-lg border p-3 ${
                    issue.severity === "error"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertTriangle
                        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                          issue.severity === "error" ? "text-destructive" : "text-amber-500"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold text-foreground">
                            {issue.creativeId}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono ${
                              issue.type === "no_tag"
                                ? "text-amber-500 border-amber-500/30"
                                : issue.type === "duplicate_cross"
                                ? "text-blue-400 border-blue-400/30"
                                : "text-destructive border-destructive/30"
                            }`}
                          >
                            {issue.type === "no_tag"
                              ? "SEM TAG"
                              : issue.type === "duplicate_cross"
                              ? "CROSS-PROJETO"
                              : "ATRIBUIÇÃO"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{issue.details}</p>
                        {issue.campaigns && issue.campaigns.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {issue.campaigns.map((c, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-[9px] font-mono text-muted-foreground max-w-[250px] truncate"
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {issue.projects && issue.projects.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {issue.projects.map((p, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[9px] font-mono"
                              >
                                {p}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {issue.spend != null && issue.spend > 0 && (
                        <p className="text-[10px] font-mono text-muted-foreground">
                          Invest: R$ {issue.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      {issue.revenue != null && issue.revenue > 0 && (
                        <p className="text-[10px] font-mono text-emerald-500">
                          Fatur: R$ {issue.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Nenhum problema nesta categoria.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
