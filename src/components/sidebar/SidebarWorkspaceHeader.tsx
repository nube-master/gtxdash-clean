import { Pin, PanelLeftClose } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarHeader } from "@/components/ui/sidebar";
import brandLockup from "@/assets/brand/traffic-os-lockup.svg.asset.json";
import brandTile from "@/assets/brand/traffic-os-tile.svg.asset.json";

const fadeVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.12 } },
};

interface Props {
  collapsed: boolean;
  pinned: boolean;
  togglePin: () => void;
}

export function SidebarWorkspaceHeader({ collapsed, pinned, togglePin }: Props) {
  return (
    <SidebarHeader
      className="px-4 py-3"
      style={{ borderBottom: "1px solid var(--sidebar-border)" }}
    >
      <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed ? (
          <motion.div
            key="lockup"
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex-1 flex items-center justify-between min-w-0"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <img src={brandTile.url} alt="Traffic OS" className="h-10 w-10 shrink-0 object-contain" />
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[15px] font-black tracking-tighter text-foreground font-sora truncate uppercase leading-none">TRAFFIC OS</span>
                <span className="text-[7.5px] font-bold tracking-[0.25em] text-muted-foreground/30 font-mono uppercase truncate mt-0.5">PROFITABLE SCALE</span>
              </div>
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={togglePin}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all shrink-0 ml-1.5"
                >
                  {pinned ? (
                    <Pin className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {pinned ? "Desafixar sidebar" : "Fixar sidebar"}
              </TooltipContent>
            </Tooltip>
          </motion.div>
        ) : (
          <div className="flex items-center justify-center w-full">
            <img src={brandTile.url} alt="Traffic OS" className="h-8 w-8 object-contain" />
          </div>
        )}
      </div>
    </SidebarHeader>
  );
}
