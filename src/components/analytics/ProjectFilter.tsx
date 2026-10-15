import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";

interface FilterOption {
  code: string;
  label: string;
}

interface ProjectFilterProps {
  projects: FilterOption[];
  selectedProjects: string[];
  onToggleProject: (code: string) => void;
  onClear: () => void;
}

export function ProjectFilter({ projects, selectedProjects, onToggleProject, onClear }: ProjectFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wider">Projeto</span>
      </div>
      {projects.map((p) => {
        const isSelected = selectedProjects.includes(p.code);
        return (
          <button
            key={p.code}
            onClick={() => onToggleProject(p.code)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
              isSelected
                ? "bg-primary/20 border-primary/40 text-primary"
                : "bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            }`}
          >
            {p.code}
          </button>
        );
      })}
      {selectedProjects.length > 0 && (
        <button
          onClick={onClear}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          title="Limpar filtros"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {selectedProjects.length > 0 && (
        <Badge variant="outline" className="text-[9px] bg-primary/5 border-primary/20 text-primary">
          {selectedProjects.length} selecionado{selectedProjects.length > 1 ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}
