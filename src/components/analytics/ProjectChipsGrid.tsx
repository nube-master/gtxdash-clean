import { useCurrency } from "@/contexts/CurrencyContext";

interface ProjectChip {
  code: string;
  label: string;
  spend: number;
  sales: number;
}

interface ProjectChipsGridProps {
  projects: ProjectChip[];
  selectedProjects: string[];
  onToggle: (code: string) => void;
}

export function ProjectChipsGrid({ projects, selectedProjects, onToggle }: ProjectChipsGridProps) {
  

  if (projects.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-4 py-1">
      {projects.map((p) => {
        const isSelected = selectedProjects.includes(p.code);
        
        return (
          <button
            key={p.code}
            onClick={() => onToggle(p.code)}
            className={`relative flex flex-col items-center justify-center h-[52px] min-w-[90px] px-3 rounded-lg transition-all duration-200 group ${
              isSelected
                ? "bg-primary border-primary shadow-md scale-[1.02]"
                : "bg-card border-border hover:border-muted-foreground/50"
            } border`}
          >
            {/* Sales Badge at TOP (Circular Red) */}
            <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 min-w-[24px] h-[24px] flex items-center justify-center px-1.5 rounded-full text-[10px] font-bold shadow-md transition-all border-2 border-background z-10 ${
              isSelected ? "bg-background text-primary" : "bg-primary text-primary-foreground"
            }`}>
              {p.sales}
            </div>

            {/* Project Code (Centralized, Mono) */}
            <span className={`text-[12px] font-mono font-bold tracking-tight uppercase ${
              isSelected ? "text-primary-foreground" : p.spend > 0 ? "text-foreground" : "text-muted-foreground"
            }`}>
              {p.code.replace("[", "").replace("]", "")}
            </span>

            {/* Spend (Bottom) */}
            <span className={`text-[9px] font-bold mt-0.5 tracking-tight tabular-nums ${
              isSelected ? "text-primary-foreground/80" : p.spend > 0 ? "text-primary" : "text-muted-foreground/30"
            }`}>
              {p.spend > 0 ? `R$ ${Math.round(p.spend)}` : "R$ 0"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
