import { cn } from "@/lib/utils";

export type MetaAdsTab = "campaigns" | "adsets" | "ads";

interface MetaAdsDrillTabsProps {
  activeTab: MetaAdsTab;
  onTabChange: (tab: MetaAdsTab) => void;
  counts: {
    campaigns: number;
    adsets: number;
    ads: number;
  };
  selectionCount: number;
}

export function MetaAdsDrillTabs({ activeTab, onTabChange, counts, selectionCount }: MetaAdsDrillTabsProps) {
  const tabs = [
    { id: "campaigns", label: "Campanha Conjunto", count: counts.campaigns },
    { id: "adsets", label: "Conjuntos", count: counts.adsets },
    { id: "ads", label: "ADs", count: counts.ads },
  ];

  return (
    <div className="flex items-center justify-between border-b border-white/5 bg-[#0A0A0E] px-4">
      <div className="flex items-center">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as MetaAdsTab)}
              className={cn(
                "relative px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all",
                isActive 
                  ? "text-white border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label} ({tab.count})
              {selectionCount > 0 && isActive && tab.id !== "ads" && (
                <span className="ml-2 text-[10px] text-primary">
                  ({selectionCount} selecionados)
                </span>
              )}
            </button>
          );
        })}
      </div>
      
      {selectionCount > 0 && (
        <button 
          onClick={() => onTabChange("campaigns")} // Reset logic should be handled by parent, but visually we can show a clear button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
        >
          <span>Limpar Filtros</span>
          <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[10px]">×</span>
        </button>
      )}
    </div>
  );
}
