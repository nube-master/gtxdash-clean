import { Star, X } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export type FavoriteItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

interface Props {
  collapsed: boolean;
  favorites: FavoriteItem[];
  onRemove: (url: string) => void;
}

export function SidebarFavorites({ collapsed, favorites, onRemove }: Props) {
  if (favorites.length === 0) return null;

  return (
    <SidebarGroup className="py-1">
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.div key="fav-label" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
            <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.15em] text-amber-500/70 font-semibold px-2.5 mb-0.5 flex items-center gap-1">
              <Star className="h-2.5 w-2.5" />
              Favoritos
            </SidebarGroupLabel>
          </motion.div>
        )}
      </AnimatePresence>
      {collapsed && <div className="h-px bg-amber-500/20 mx-2 my-1" />}
      <SidebarGroupContent>
        <SidebarMenu>
          {favorites.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="flex items-center justify-center py-1.5 rounded-md text-muted-foreground/60 transition-colors hover:bg-white/[0.03] hover:text-foreground"
                        activeClassName="bg-white/[0.04] text-foreground font-medium border border-white/[0.03]"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      ⭐ {item.title}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-md text-[13px] text-muted-foreground/60 transition-colors hover:bg-white/[0.03] hover:text-foreground group"
                    activeClassName="bg-white/[0.04] text-foreground font-medium border border-white/[0.03] shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap overflow-hidden flex-1">{item.title}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(item.url);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 flex items-center justify-center rounded hover:bg-destructive/10"
                    >
                      <X className="h-2.5 w-2.5 text-muted-foreground" />
                    </button>
                  </NavLink>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
