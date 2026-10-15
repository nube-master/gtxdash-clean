import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Star, ChevronRight } from "lucide-react";

const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[] | null;
  badge?: string | number | null;
  badgeColor?: string;
  pulse?: boolean;
  /** When true, item shows "Em breve" badge and is not clickable */
  disabled?: boolean;
};

/* ─── Nav Item Component ─── */
function SidebarNavItem({
  item,
  end,
  onFavoriteToggle,
  isFavorite,
}: {
  item: NavItem;
  end?: boolean;
  onFavoriteToggle?: (url: string) => void;
  isFavorite?: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  // ── Disabled item (feature not enabled) ──
  if (item.disabled) {
    const disabledEl = (
      <div
        className={`relative flex items-center gap-2.5 py-[7px] rounded-md text-[13px] text-muted-foreground/40 cursor-not-allowed select-none ${
          collapsed ? "justify-center px-0" : "px-2.5"
        }`}
      >
        <div className="relative shrink-0">
          <item.icon className="h-[18px] w-[18px]" />
        </div>
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key="label"
              variants={fadeVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="whitespace-nowrap overflow-hidden flex-1"
            >
              {item.title}
            </motion.span>
          )}
        </AnimatePresence>
        {!collapsed && (
          <span className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none bg-muted text-muted-foreground/60 whitespace-nowrap">
            Em breve
          </span>
        )}
      </div>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{disabledEl}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs flex items-center gap-2">
            {item.title}
            <span className="text-[8px] font-semibold uppercase bg-muted text-muted-foreground/60 px-1 rounded">
              Em breve
            </span>
          </TooltipContent>
        </Tooltip>
      );
    }
    return disabledEl;
  }

  // ── Normal item ──
  const link = (
    <NavLink
      to={item.url}
      end={end}
      className={`relative flex items-center gap-2.5 py-[7px] rounded-md text-[13px] text-muted-foreground/60 transition-all hover:bg-white/[0.03] hover:text-foreground group/nav ${
        collapsed ? "justify-center px-0" : "px-2.5"
      }`}
      activeClassName="bg-white/[0.06] text-foreground font-semibold sidebar-active border border-white/[0.08] shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
    >
      {/* Left accent bar for active state */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 rounded-r-full bg-primary opacity-0 transition-opacity sidebar-active-bar" />
      
      <div className="relative shrink-0">
        <item.icon className="h-[18px] w-[18px]" />
        {item.pulse && (
          <div
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse"
            style={{ boxShadow: "0 0 6px hsl(var(--primary) / 0.6)" }}
          />
        )}
      </div>
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            key="label"
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="whitespace-nowrap overflow-hidden flex-1"
          >
            {item.title}
          </motion.span>
        )}
      </AnimatePresence>
      {!collapsed && item.badge != null && (
        <span
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full leading-none tabular-nums ${
            item.badgeColor ?? "bg-primary/15 text-primary"
          }`}
        >
          {item.badge}
        </span>
      )}
      {!collapsed && onFavoriteToggle && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFavoriteToggle(item.url);
          }}
          className={`opacity-0 group-hover/nav:opacity-100 transition-opacity h-4 w-4 flex items-center justify-center rounded ${
            isFavorite ? "opacity-100" : ""
          }`}
        >
          <Star
            className={`h-2.5 w-2.5 ${
              isFavorite ? "text-amber-500 fill-amber-500" : "text-muted-foreground/40"
            }`}
          />
        </button>
      )}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs flex items-center gap-2">
          {item.title}
          {item.badge != null && (
            <span className="text-[9px] font-mono font-bold bg-primary/15 text-primary px-1 rounded">
              {item.badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

/* ─── Group Renderer ─── */
interface NavGroupProps {
  label: string;
  items: NavItem[];
  canSee: (roles: string[] | null, url: string) => boolean;
  collapsed: boolean;
  onFavoriteToggle?: (url: string) => void;
  favoriteUrls?: string[];
  defaultOpen?: boolean;
  notificationDot?: boolean;
}

export function NavGroup({ label, items, canSee, collapsed, onFavoriteToggle, favoriteUrls = [], defaultOpen = true, notificationDot }: NavGroupProps) {
  const visible = items.filter((i) => canSee(i.roles, i.url));
  const [open, setOpen] = useState(defaultOpen);

  if (visible.length === 0) return null;

  return (
    <SidebarGroup className="py-0.5">
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.div key={`label-${label}`} variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
            <button
              onClick={() => setOpen(!open)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 group/label hover:bg-accent/5 rounded-md transition-colors"
            >
              <ChevronRight
                className={`h-3 w-3 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              />
              {/* Label with line divider */}
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 font-semibold whitespace-nowrap">
                {label}
              </span>
              <div className="flex-1 h-px bg-border/30 ml-1" />
              {notificationDot && (
                <div className="h-2 w-2 rounded-full bg-primary shrink-0" style={{ boxShadow: "0 0 6px hsl(var(--primary) / 0.5)" }} />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {collapsed && <div className="h-px bg-border/20 mx-2 my-1" />}
      
      <AnimatePresence initial={false}>
        {(open || collapsed) && (
          <motion.div
            initial={collapsed ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <SidebarGroupContent>
              <SidebarMenu>
                {visible.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <SidebarNavItem
                        item={item}
                        end={item.url === "/"}
                        onFavoriteToggle={onFavoriteToggle}
                        isFavorite={favoriteUrls.includes(item.url)}
                      />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarGroup>
  );
}
