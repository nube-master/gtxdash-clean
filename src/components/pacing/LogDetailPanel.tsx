import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug } from "lucide-react";
import { logActionLabel, type LogEntry } from "./historyMock";

interface Props {
  entry: LogEntry | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function LogDetailPanel({ entry, open, onOpenChange }: Props) {
  const [showTech, setShowTech] = useState(false);
  useEffect(() => { if (!open) setShowTech(false); }, [open]);

  if (!entry) return null;

  const base = new Date(entry.ts);
  const t = (offsetSec: number) =>
    new Date(base.getTime() + offsetSec * 1000).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });

  const snapshot = {
    campaign_id: "120246987819540447",
    ratio: entry.ratio,
    spend_at_action: entry.spend,
    spend_expected: entry.expected,
    last_sale_min_ago: entry.lastSaleMinAgo,
    rule_id: entry.ruleId,
    rule_name: entry.ruleName,
    project: entry.project,
    account: entry.account,
    status: entry.status,
  };

  const metaPayload = {
    method: "POST",
    url: "/v20.0/120246987819540447",
    body: { status: entry.action === "resume" ? "ACTIVE" : "PAUSED" },
    response: entry.status === "fail"
      ? { code: 17, message: "User request limit reached" }
      : { success: true, latency_ms: 240 },
  };

  const isManual = !entry.ruleId || entry.ruleName === "—" || /manual/i.test(entry.reason ?? "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm">{entry.campaign}</span>
            <Badge variant="outline" className="font-mono text-[10px]">{entry.project}</Badge>
            <Badge
              variant={isManual ? "default" : "outline"}
              className={"text-[10px] " + (isManual ? "bg-blue-500/15 text-blue-600 border-blue-500/30 hover:bg-blue-500/20" : "")}
            >
              {isManual ? "🔒 Manual" : "⏱ Regra"}
            </Badge>
            <Badge
              variant={entry.status === "fail" ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {logActionLabel(entry.action)} · {entry.status}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-5 text-xs">
          {/* Timeline */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Timeline</h3>
            <ol className="space-y-1.5 font-mono tabular-nums">
              <li><span className="text-muted-foreground">{t(0)}</span> — Regra disparou</li>
              <li>
                <span className="text-muted-foreground">{t(0)}</span> — Snapshot: spend R${entry.spend.toFixed(0)}, expected R${entry.expected.toFixed(0)}, ratio {entry.ratio}×
              </li>
              <li><span className="text-muted-foreground">{t(1)}</span> — Meta API: POST /campaign/120…</li>
              <li>
                <span className="text-muted-foreground">{t(1)}</span> —{" "}
                {entry.status === "fail" ? (
                  <span className="text-destructive">Meta respondeu: 429 rate limit</span>
                ) : (
                  <span>Meta respondeu: 200 OK · 240ms</span>
                )}
              </li>
              <li><span className="text-muted-foreground">{t(1)}</span> — Pushcut webhook disparado</li>
              <li><span className="text-muted-foreground">{t(2)}</span> — Log persistido</li>
              {entry.status === "manual_resume" && entry.manualResumeAt && (
                <li className="text-foreground">
                  <span className="text-muted-foreground">
                    {new Date(entry.manualResumeAt).toLocaleTimeString("pt-BR", { hour12: false })}
                  </span>{" "}
                  — Religada manualmente por {entry.manualResumeBy}
                </li>
              )}
            </ol>
          </section>

          {/* Snapshot */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Snapshot</h3>
            <pre className="bg-muted/40 border border-border/60 rounded p-3 text-[11px] font-mono overflow-x-auto">
{JSON.stringify(snapshot, null, 2)}
            </pre>
          </section>

          {/* Detalhes técnicos */}
          <section>
            <Button variant="outline" size="sm" onClick={() => setShowTech((v) => !v)} className="h-7 text-xs">
              <Bug className="size-3 mr-1.5" /> {showTech ? "ocultar" : "ver"} detalhes técnicos
            </Button>
            {showTech && (
              <pre className="mt-2 bg-muted/40 border border-border/60 rounded p-3 text-[11px] font-mono overflow-x-auto">
{JSON.stringify(metaPayload, null, 2)}
              </pre>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
