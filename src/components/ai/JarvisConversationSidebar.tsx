import { memo } from "react";
import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JarvisConversation } from "@/hooks/useJarvisConversations";

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface JarvisConversationSidebarProps {
  conversations: JarvisConversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function JarvisConversationSidebarComponent({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
}: JarvisConversationSidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "flex flex-col bg-muted/20 border-r border-border/30 shrink-0 transition-all duration-300 z-50",
          // Desktop: always visible
          "hidden md:flex md:w-[260px]",
          // Mobile: slide-in overlay
          isOpen && "!flex fixed inset-y-0 left-0 w-[280px] md:relative md:w-[260px]"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border/30 shrink-0">
          <button
            onClick={onNew}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova conversa
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1.5 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground/60">Nenhuma conversa ainda</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 mx-1.5 rounded-lg cursor-pointer transition-colors",
                  activeId === conv.id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
                onClick={() => {
                  onSelect(conv.id);
                  onClose();
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate leading-tight">{conv.title}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatRelativeDate(conv.updated_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                  title="Excluir conversa"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export const JarvisConversationSidebar = memo(JarvisConversationSidebarComponent);
