import { Search, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

interface Props {
  collapsed: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export function SidebarQuickSearch({ collapsed, searchQuery, setSearchQuery }: Props) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused && searchQuery) setSearchQuery("");
  }, [collapsed]);

  if (collapsed) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="search"
        variants={fadeVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="px-2.5 pb-1"
      >
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-colors ${
            focused
              ? "border-primary/30 bg-primary/5"
              : "border-border/30 bg-muted/20 hover:bg-muted/40"
          }`}
        >
          <Search className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Buscar página..."
            className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
