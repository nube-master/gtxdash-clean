import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { Layers, Hash, X } from "lucide-react";

import { extractProjectCodeFromNaming } from "@/lib/projectUtils";
import { useOfferProjects } from "@/hooks/useOfferProjects";

function extractProjectTag(campaignName: string): string | null {
  const code = extractProjectCodeFromNaming(campaignName);
  return code !== "OUTROS" ? code : null;
}

// Cores removidas — painel segue tokens do design system (neutro + primary ativo).


export interface ProjectDistributionPanelProps {
  /** Currently active project tag selected by the user (filters the pipeline below). */
  selectedProject?: string | null;
  /** Called when the user clicks a project pill. Returns the project tag and the account_ids tied to it. */
  onSelectProject?: (project: string | null, accountIds: Set<string>) => void;
}

export default function ProjectDistributionPanel({
  selectedProject = null,
  onSelectProject,
}: ProjectDistributionPanelProps = {}) {
  const perf = useMobilePerformance();
  useOfferProjects();

  const { data: campaigns } = useQuery({
    queryKey: ["campaign-statuses-for-projects"],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("meta_campaign_status")
          .select("account_id, campaign_id, campaign_name, effective_status")
          .eq("effective_status", "ACTIVE")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      return allData;
    },
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });

  const { data: accounts } = useQuery({
    queryKey: ["meta-ad-accounts-project-dist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name, currency, category, is_active, account_status");
      if (error) throw error;
      return data || [];
    },
  });

  const { projectGroups, untaggedCount, totalAccounts, totalCampaigns } = useMemo(() => {
    if (!campaigns || !accounts) {
      return { projectGroups: [] as Array<{ project: string; color: string; accountIds: Set<string>; campaigns: number }>, untaggedCount: 0, totalAccounts: 0, totalCampaigns: 0 };
    }

    const registered = new Set<string>();
    for (const a of accounts) {
      if (a.is_active && a.account_status === 1) registered.add(a.account_id);
    }

    const map = new Map<string, { accs: Set<string>; campaigns: number }>();
    let untagged = 0;
    let totalCamps = 0;
    for (const c of campaigns) {
      if (!registered.has(c.account_id)) continue;
      const tag = extractProjectTag(c.campaign_name || "");
      if (!tag) { untagged++; continue; }
      totalCamps++;
      if (!map.has(tag)) map.set(tag, { accs: new Set(), campaigns: 0 });
      const e = map.get(tag)!;
      e.accs.add(c.account_id);
      e.campaigns += 1;
    }

    const groups = Array.from(map.entries()).map(([project, v]) => ({
      project,
      accountIds: v.accs,
      campaigns: v.campaigns,
    }));

    groups.sort((a, b) => b.accountIds.size - a.accountIds.size);

    const totalAccs = new Set(groups.flatMap((g) => Array.from(g.accountIds))).size;
    return { projectGroups: groups, untaggedCount: untagged, totalAccounts: totalAccs, totalCampaigns: totalCamps };
  }, [campaigns, accounts]);

  const handlePillClick = (g: { project: string; accountIds: Set<string> }) => {
    if (!onSelectProject) return;
    if (selectedProject === g.project) {
      onSelectProject(null, new Set());
    } else {
      onSelectProject(g.project, g.accountIds);
    }
  };

  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
        <Layers className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-black tracking-[0.2em] uppercase text-primary" style={{ textShadow: "0 0 12px rgba(255,30,30,0.4)" }}>
          Distribuição por Projeto
        </span>
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-muted-foreground">
          {totalAccounts} contas · {projectGroups.length} projetos · {totalCampaigns} campanhas
        </span>
        {selectedProject && (
          <button
            onClick={() => onSelectProject?.(null, new Set())}
            className="text-[10px] font-mono flex items-center gap-1 px-2 py-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
            title="Limpar seleção"
          >
            <X className="h-3 w-3" /> limpar
          </button>
        )}
      </div>

      {/* Compact segmented bar */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-[2px] h-2 rounded-full overflow-hidden mb-3 bg-secondary/30">
          {projectGroups.map((g) => {
            const pct = totalAccounts > 0 ? (g.accountIds.size / totalAccounts) * 100 : 0;
            const active = selectedProject === g.project;
            const dim = selectedProject && !active;
            return (
              <button
                key={g.project}
                onClick={() => handlePillClick(g)}
                className={`h-full transition-all first:rounded-l-full last:rounded-r-full ${
                  active ? "bg-primary" : "bg-muted-foreground/40 hover:bg-muted-foreground/60"
                }`}
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  opacity: dim ? 0.3 : 1,
                }}
                title={`${g.project}: ${g.accountIds.size} contas · ${g.campaigns} campanhas`}
              />
            );
          })}
        </div>

        {/* Clickable pills */}
        <div className="flex flex-wrap gap-1.5">
          {projectGroups.map((g) => {
            const active = selectedProject === g.project;
            const dim = selectedProject && !active;
            return (
              <button
                key={g.project}
                onClick={() => handlePillClick(g)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-[11px] font-mono border ${
                  active
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-secondary/30 border-border hover:bg-secondary/50 text-foreground"
                }`}
                style={{ opacity: dim ? 0.5 : 1 }}
                title={`Filtrar pipeline por ${g.project}`}
              >
                <span className="font-bold">{g.project}</span>
                <span className="text-muted-foreground">{g.accountIds.size}c</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-muted-foreground">{g.campaigns}🅒</span>
              </button>
            );
          })}
          {projectGroups.length === 0 && (
            <span className="text-[11px] font-mono text-muted-foreground">Nenhuma campanha ativa com tag de projeto encontrada</span>
          )}
        </div>
      </div>


      {untaggedCount > 0 && (
        <div className="px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: "hsl(var(--border))" }}>
          <Hash className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground">
            {untaggedCount} campanhas ativas sem tag de projeto
          </span>
        </div>
      )}
    </div>
  );
}
