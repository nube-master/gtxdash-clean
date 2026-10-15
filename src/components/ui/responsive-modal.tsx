import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * ResponsiveModal
 * ---------------
 * Em desktop renderiza um Dialog centralizado (shadcn).
 * Em mobile (<768px) vira um Sheet bottom full-screen (90vh) com handle.
 *
 * API espelha shadcn Dialog: ResponsiveModal/Trigger/Content/Header/Title/Description/Footer.
 */

interface ResponsiveModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const ResponsiveModalContext = React.createContext<{ isMobile: boolean }>({
  isMobile: false,
});

export function ResponsiveModal({ open, onOpenChange, children }: ResponsiveModalProps) {
  const isMobile = useIsMobile();
  const Root = isMobile ? Sheet : Dialog;
  return (
    <ResponsiveModalContext.Provider value={{ isMobile }}>
      <Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    </ResponsiveModalContext.Provider>
  );
}

export function ResponsiveModalTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { isMobile } = React.useContext(ResponsiveModalContext);
  const Trigger = isMobile ? SheetTrigger : DialogTrigger;
  return <Trigger asChild={asChild}>{children}</Trigger>;
}

interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tamanho desktop. Mobile sempre 90vh bottom sheet. */
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeMap: Record<NonNullable<ContentProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-[95vw]",
};

export function ResponsiveModalContent({
  className,
  size = "md",
  children,
  ...props
}: ContentProps) {
  const { isMobile } = React.useContext(ResponsiveModalContext);
  if (isMobile) {
    return (
      <SheetContent
        side="bottom"
        className={cn(
          "h-[90vh] overflow-y-auto rounded-t-2xl border-t border-border p-0",
          className,
        )}
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2" {...props}>
          {children}
        </div>
      </SheetContent>
    );
  }
  return (
    <DialogContent className={cn(sizeMap[size], className)} {...props}>
      {children}
    </DialogContent>
  );
}

export function ResponsiveModalHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = React.useContext(ResponsiveModalContext);
  return isMobile ? <SheetHeader {...props} /> : <DialogHeader {...props} />;
}

export function ResponsiveModalFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = React.useContext(ResponsiveModalContext);
  return isMobile ? (
    <SheetFooter
      className={cn("sticky bottom-0 mt-4 flex-col gap-2 bg-background pt-3", className)}
      {...props}
    />
  ) : (
    <DialogFooter className={className} {...props} />
  );
}

export function ResponsiveModalTitle(props: React.ComponentProps<typeof DialogTitle>) {
  const { isMobile } = React.useContext(ResponsiveModalContext);
  return isMobile ? <SheetTitle {...props} /> : <DialogTitle {...props} />;
}

export function ResponsiveModalDescription(
  props: React.ComponentProps<typeof DialogDescription>,
) {
  const { isMobile } = React.useContext(ResponsiveModalContext);
  return isMobile ? <SheetDescription {...props} /> : <DialogDescription {...props} />;
}
