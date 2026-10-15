import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { BudgetGroupCard } from "@/components/pacing/BudgetGroupCard";
import { BudgetGroupEditorPanel } from "@/components/pacing/BudgetGroupEditorPanel";
import { CampaignDetailPanel } from "@/components/pacing/CampaignDetailPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Gauge, Sliders, History, Settings as SettingsIcon, Target } from "lucide-react";
import { toast } from "sonner";
import {
  matchCampaignsForGroup,
  type BudgetGroup,
  type PacingCampaign,
} from "@/components/pacing/mockData";
import { usePacingBudgetGroups } from "@/hooks/usePacingBudgetGroups";

const fmt = (v: number, d = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function PacingBudgetGroups() {
  const navigate = useNavigate();
  const { groups, loading, createGroup, updateGroup, deleteGroup } = usePacingBudgetGroups();
  const [editing, setEditing] = useState<BudgetGroup | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BudgetGroup | null>(null);
  const [confirmPause, setConfirmPause] = useState<BudgetGroup | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<PacingCampaign | null>(null);

  const totals = useMemo(() => {
    const totalGroups = groups.length;
    const totalCampaigns = groups.reduce(
      (acc, g) => acc + matchCampaignsForGroup(g.matcher).length, 0);
    const totalHourlyAlloc = groups.reduce((acc, g) => acc + g.capHourly, 0);
    return { totalGroups, totalCampaigns, totalHourlyAlloc };
  }, [groups]);

  const openCreate = () => { setEditing(null); setPanelOpen(true); };
  const openEdit = (g: BudgetGroup) => { setEditing(g); setPanelOpen(true); };

  const handleSave = async (saved: BudgetGroup) => {
    if (editing) await updateGroup(editing.id, saved);
    else await createGroup(saved);
    setPanelOpen(false);
  };

  const handleDuplicate = async (g: BudgetGroup) => {
    await createGroup({ ...g, id: "", name: `${g.name} (cópia)`, firedToday: 0, lastPauseAt: null });
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteGroup(confirmDelete.id);
    setConfirmDelete(null);
  };

  const handlePauseAll = () => {
    if (!confirmPause) return;
    const count = matchCampaignsForGroup(confirmPause.matcher).filter(
      (c) => c.status !== "paused"
    ).length;
    toast.success(
      `${count} ${count === 1 ? "campanha pausada" : "campanhas pausadas"} no grupo "${confirmPause.name}"`
    );
    setConfirmPause(null);
  };

  const handleHistory = (g: BudgetGroup) => navigate(`/pacing/historico?group=${g.id}`);

  return (
    <div className="space-y-4 px-4 md:px-6 pb-10">
      <PacingHeader />

      <Tabs value="groups" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="dashboard" onClick={() => navigate("/pacing")}>
            <Gauge className="size-3.5 mr-1.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="rules" onClick={() => navigate("/pacing/regras")}>
            <Sliders className="size-3.5 mr-1.5" /> Regras
          </TabsTrigger>
          <TabsTrigger value="groups"><Target className="size-3.5 mr-1.5" /> Budget Groups</TabsTrigger>
          <TabsTrigger value="history" onClick={() => navigate("/pacing/historico")}>
            <History className="size-3.5 mr-1.5" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="settings" onClick={() => navigate("/pacing/settings")}>
            <SettingsIcon className="size-3.5 mr-1.5" /> Config
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">🎯 Budget Groups</h2>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {totals.totalGroups} grupos · {totals.totalCampaigns} campanhas agrupadas · R${" "}
            {fmt(totals.totalHourlyAlloc)}/h alocado
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5 mr-1.5" /> Novo Grupo
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
          </>
        ) : groups.length === 0 ? (
          <div className="rounded border border-dashed border-border/60 py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum grupo criado ainda.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>
              <Plus className="size-3.5 mr-1.5" /> Criar primeiro grupo
            </Button>
          </div>
        ) : (
          groups.map((g) => (
            <BudgetGroupCard
              key={g.id}
              group={g}
              onEdit={openEdit}
              onDuplicate={handleDuplicate}
              onDelete={(group) => setConfirmDelete(group)}
              onPauseAll={(group) => setConfirmPause(group)}
              onHistory={handleHistory}
              onCapBadgeClick={(group) => navigate(`/pacing/historico?group=${group.id}`)}
              onSelectCampaign={(c) => setSelectedCampaign(c)}
            />
          ))
        )}
      </div>

      <BudgetGroupEditorPanel
        open={panelOpen}
        group={editing}
        onClose={() => setPanelOpen(false)}
        onSave={handleSave}
      />

      <CampaignDetailPanel
        campaign={selectedCampaign}
        allRules={[]}
        onClose={() => setSelectedCampaign(null)}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar grupo "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As campanhas continuam existindo, mas deixam de
              ser monitoradas pelo cap do grupo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmPause} onOpenChange={(v) => !v && setConfirmPause(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Pausar TODAS as{" "}
              {confirmPause
                ? matchCampaignsForGroup(confirmPause.matcher).filter(
                    (c) => c.status !== "paused"
                  ).length
                : 0}{" "}
              campanhas do grupo "{confirmPause?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação pode ser desfeita manualmente em cada campanha ou retomando o grupo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePauseAll}>Pausar grupo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
