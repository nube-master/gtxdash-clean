import { useState, useMemo } from "react";
import { GraduationCap, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AcademySchool } from "@/components/academy/AcademySchool";
import { useAllAcademyLessons, useAllAcademyModules } from "@/hooks/useAcademyData";

type SearchResult = {
  type: "aula";
  title: string;
  subtitle: string;
  id: string;
};

export default function Academy() {
  const [globalSearch, setGlobalSearch] = useState("");

  const { data: modules } = useAllAcademyModules();
  const { data: lessons } = useAllAcademyLessons();

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!globalSearch || globalSearch.length < 2) return [];
    const q = globalSearch.toLowerCase();
    const results: SearchResult[] = [];

    lessons?.forEach((l) => {
      if (l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.content.toLowerCase().includes(q)) {
        const mod = modules?.find((m) => m.id === l.module_id);
        results.push({ type: "aula", title: l.title, subtitle: mod?.title || "Módulo", id: l.id });
      }
    });

    return results.slice(0, 20);
  }, [globalSearch, lessons, modules]);

  return (
    <div className="space-y-0 p-4 md:p-6">
      {/* Header — Circle style */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-foreground">Academy</h1>
            <p className="text-xs text-muted-foreground">Central de treinamento da operação</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar aulas..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="pl-9 bg-card/50 border-border/50"
          />

          {searchResults.length > 0 && (
            <Card className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border-border/50 shadow-xl">
              <CardContent className="p-2 max-h-72 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.type}-${r.id}-${i}`}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/10 flex items-center gap-3 transition-colors"
                    onClick={() => setGlobalSearch("")}
                  >
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                      <GraduationCap className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {globalSearch.length >= 2 && searchResults.length === 0 && (
            <Card className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border-border/50 shadow-xl">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Nenhum resultado para "{globalSearch}"</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Content — directly School, no tabs */}
      <AcademySchool />
    </div>
  );
}
