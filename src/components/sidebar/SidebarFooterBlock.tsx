import { Bot, LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter } from "@/components/ui/sidebar";
import { useState } from "react";

const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

interface Props {
  collapsed: boolean;
  user: any;
  displayName: string | null;
  initials: string;
  avatarUrl?: string | null;
  signOut: () => void;
}

function UserAvatar({ initials, avatarUrl, size = "h-9 w-9", textSize = "text-[10px]" }: { initials: string; avatarUrl?: string | null; size?: string; textSize?: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="Avatar"
        className={`${size} rounded-lg object-cover shrink-0`}
      />
    );
  }
  return (
    <div className={`${size} rounded-lg bg-primary/8 flex items-center justify-center shrink-0 ${textSize} font-bold text-primary`}>
      {initials}
    </div>
  );
}

export function SidebarFooterBlock({ collapsed, user, displayName, initials, avatarUrl, signOut }: Props) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const maskedEmail = user?.email
    ? user.email.replace(/^(.{2})(.*)(@.*)$/, (_, a: string, b: string, c: string) => a + "*".repeat(b.length) + c)
    : "";

  return (
    <SidebarFooter
      className="p-2.5 space-y-2 bg-sidebar"
      style={{ borderTop: "1px solid var(--sidebar-border)" }}
      // Prevent sidebar collapse when dropdown is open
      onMouseLeave={(e) => { if (dropdownOpen) e.stopPropagation(); }}
    >
      {collapsed ? (
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <div className="mx-auto cursor-pointer">
              <UserAvatar initials={initials} avatarUrl={avatarUrl} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <div className="px-3 py-2 flex items-center gap-3">
              <UserAvatar initials={initials} avatarUrl={avatarUrl} size="h-10 w-10" textSize="text-sm" />
              <div>
                <p className="text-sm font-medium text-foreground">{displayName || "Usuário"}</p>
                <p className="text-[11px] text-muted-foreground">{maskedEmail}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2 text-sm cursor-pointer">
              <User className="h-4 w-4" /> Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/connect")} className="gap-2 text-sm cursor-pointer">
              <Bot className="h-4 w-4" /> Conectar IA
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive cursor-pointer focus:text-destructive">
              <LogOut className="h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key="user-block"
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-2"
          >
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 px-1.5 w-full text-left hover:bg-sidebar-accent rounded-lg py-1.5 transition-colors border border-transparent hover:border-sidebar-border">
                  <UserAvatar initials={initials} avatarUrl={avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate leading-tight font-geist">{displayName || "Usuário"}</p>
                    <p className="text-[10px] text-muted-foreground/50 truncate font-mono">{user?.email || ""}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
                <div className="px-3 py-2.5 flex items-center gap-3">
                  <UserAvatar initials={initials} avatarUrl={avatarUrl} size="h-10 w-10" textSize="text-sm" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{displayName || "Usuário"}</p>
                    <p className="text-[11px] text-muted-foreground">{maskedEmail}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2 text-sm cursor-pointer">
                  <User className="h-4 w-4" /> Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/connect")} className="gap-2 text-sm cursor-pointer">
                  <Bot className="h-4 w-4" /> Conectar IA
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive cursor-pointer focus:text-destructive">
                  <LogOut className="h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Status bar */}
            <div
              className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-sidebar-accent/50 border border-sidebar-border"
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ background: "hsl(142 71% 45%)", boxShadow: "0 0 6px hsl(142 71% 45% / 0.5)" }}
                />
                <span className="text-[9px] tracking-[0.15em] uppercase font-mono text-muted-foreground/50 tabular-nums">
                  GTX Mídia · ativa
                </span>
              </div>
              <span className="text-[8px] font-mono text-muted-foreground/30">v2.0</span>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </SidebarFooter>
  );
}
