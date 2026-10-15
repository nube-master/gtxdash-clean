import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, FlaskConical, User } from "lucide-react";
import { useOfferProjects } from "@/hooks/useOfferProjects";

// Paleta rotativa para projetos dinâmicos
const PROJECT_DOTS = [
  "bg-amber-400", "bg-emerald-400", "bg-sky-400",
  "bg-cyan-400", "bg-rose-400", "bg-violet-400",
  "bg-fuchsia-400", "bg-lime-400", "bg-orange-400", "bg-teal-400",
];

type FilterMode = "off" | "testing_no_sales" | "scale" | "f1";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  filterStatus: string;
  onStatusChange: (v: string) => void;
  filterProject: string;
  onProjectChange: (v: string) => void;
  filterTestMode: FilterMode;
  onTestModeChange: (v: FilterMode) => void;
  filterPerson: string;
  onPersonChange: (v: string) => void;
  uniquePeople: { name: string; roles: string[] }[];
  testNoSalesCount: number;
  scaleCount: number;
  f1Count: number;
  f3Count: number;
  syncing: boolean;
  lastSync: Date | null;
  onSyncNow: () => void;
  isAdmin: boolean;
}

export function CreativeFilters(props: Props) {
  const {
    search, onSearchChange,
    filterStatus, onStatusChange,
    filterProject, onProjectChange,
    filterTestMode, onTestModeChange,
    filterPerson, onPersonChange, uniquePeople,
    testNoSalesCount, scaleCount, f1Count, f3Count,
    syncing, lastSync, onSyncNow,
  } = props;

  const { allProjects } = useOfferProjects();
  const PROJECTS = [
    { value: "all", label: "Todos projetos", dot: "" },
    ...allProjects.map((p, i) => ({
      value: p.code,
      label: p.code,
      dot: PROJECT_DOTS[i % PROJECT_DOTS.length],
    })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar criativo (ex: H01B31)..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 font-mono text-sm"
          />
        </div>

        {/* Status filter */}
        <Select value={filterStatus} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[130px] font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
          </SelectContent>
        </Select>

        {/* Project filter */}
        <Select value={filterProject} onValueChange={onProjectChange}>
          <SelectTrigger className="w-[150px] font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECTS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <span className="flex items-center gap-2">
                  {p.dot && (
                    <span className={`inline-block h-2 w-2 rounded-full ${p.dot}`} />
                  )}
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Person filter */}
        <Select value={filterPerson} onValueChange={onPersonChange}>
          <SelectTrigger className="w-[170px] font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Pessoa" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas pessoas</SelectItem>
            {uniquePeople.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                <span className="flex items-center gap-2">
                  {p.name}
                  {p.roles.map((r) => (
                    <Badge
                      key={r}
                      variant="outline"
                      className={`text-[9px] px-1 py-0 font-mono ${
                        r === "Copy"
                          ? "border-blue-400/50 text-blue-400"
                          : "border-amber-400/50 text-amber-400"
                      }`}
                    >
                      {r}
                    </Badge>
                  ))}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sync */}
        <div className="flex items-center gap-2 ml-auto">
          {lastSync && (
            <span className="text-[10px] font-mono text-muted-foreground">
              Sync: {lastSync.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncNow}
            disabled={syncing}
            className="font-mono text-xs h-7"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* Test mode filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
        <Button
          variant={filterTestMode === "f1" ? "default" : "outline"}
          size="sm"
          onClick={() => onTestModeChange(filterTestMode === "f1" ? "off" : "f1")}
          className="font-mono text-[10px] h-7 px-2.5 gap-1.5"
        >
          🧪 Teste Criativo (F1)
          {f1Count > 0 && (
            <span className="ml-1 rounded-full bg-blue-400/20 text-blue-400 px-1.5 text-[9px]">{f1Count}</span>
          )}
        </Button>
        <Button
          variant={filterTestMode === "testing_no_sales" ? "default" : "outline"}
          size="sm"
          onClick={() => onTestModeChange(filterTestMode === "testing_no_sales" ? "off" : "testing_no_sales")}
          className="font-mono text-[10px] h-7 px-2.5 gap-1.5"
        >
          Teste sem Venda
          {testNoSalesCount > 0 && (
            <span className="ml-1 rounded-full bg-destructive/20 text-destructive px-1.5 text-[9px]">{testNoSalesCount}</span>
          )}
        </Button>
        <Button
          variant={filterTestMode === "scale" ? "default" : "outline"}
          size="sm"
          onClick={() => onTestModeChange(filterTestMode === "scale" ? "off" : "scale")}
          className="font-mono text-[10px] h-7 px-2.5 gap-1.5"
        >
          🚀 Escala
          {(scaleCount > 0 || f3Count > 0) && (
            <span className="ml-1 rounded-full bg-wr-positive/20 text-wr-positive px-1.5 text-[9px]">
              {scaleCount}
            </span>
          )}
        </Button>
        {(filterTestMode !== "off" || filterPerson !== "all") && (
          <span className="text-[10px] font-mono text-muted-foreground ml-2">
            Filtro ativo
          </span>
        )}
      </div>
    </div>
  );
}
