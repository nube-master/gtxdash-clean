import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ResponsiveTable
 * ----------------
 * Wrapper para tabelas pesadas. Em mobile aplica scroll horizontal suave
 * e permite a primeira coluna "grudar" (sticky) para preservar contexto.
 *
 * Uso:
 *   <ResponsiveTable stickyFirstColumn>
 *     <table>...</table>
 *   </ResponsiveTable>
 *
 * Adicione a classe `sticky-col` na primeira <th>/<td> de cada linha
 * caso queira manter o cabeçalho de linha visível em mobile.
 */
interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  stickyFirstColumn?: boolean;
  minWidth?: number | string;
}

export const ResponsiveTable = React.forwardRef<HTMLDivElement, ResponsiveTableProps>(
  ({ className, children, stickyFirstColumn = false, minWidth, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "responsive-table-wrapper relative w-full overflow-x-auto rounded-md border border-border/40 bg-card/40",
          stickyFirstColumn && "responsive-table-sticky",
          className,
        )}
        style={{
          WebkitOverflowScrolling: "touch",
          ...style,
        }}
        {...props}
      >
        <div style={minWidth ? { minWidth } : undefined}>{children}</div>
      </div>
    );
  },
);
ResponsiveTable.displayName = "ResponsiveTable";
