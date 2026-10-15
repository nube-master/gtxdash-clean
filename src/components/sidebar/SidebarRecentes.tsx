import { Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { NavLink } from "@/components/NavLink";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export type RecentItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

interface Props {
  collapsed: boolean;
  recentes: RecentItem[];
}

export function SidebarRecentes({ collapsed, recentes }: Props) {
  if (recentes.length === 0 || collapsed) return null;

  return (
    <SidebarGroup className="py-1">
      <AnimatePresence mode="wait">
        <motion.div key="rec-label" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
          <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50 font-semibold px-2.5 mb-0.5 flex items-center gap-1 font-mono">
            <Clock className="h-2.5 w-2.5" />
            Recentes
          </SidebarGroupLabel>
        </motion.div>
      </AnimatePresence>
      <SidebarGroupContent>
        <SidebarMenu>
          {recentes.slice(0, 3).map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  end={item.url === "/"}
                  className="flex items-center gap-2.5 py-1 px-2.5 rounded-md text-[12px] text-muted-foreground/40 transition-colors hover:bg-white/[0.03] hover:text-foreground font-geist"
                  activeClassName="text-foreground"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <span className="whitespace-nowrap overflow-hidden">{item.title}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
