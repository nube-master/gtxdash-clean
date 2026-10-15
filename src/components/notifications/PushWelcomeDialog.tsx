import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BellRing, CheckCircle2 } from "lucide-react";
import { PUSH_NOTIFICATION_TYPES } from "@/lib/pushNotificationTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PushWelcomeDialog({ open, onOpenChange }: Props) {
  const recommended = PUSH_NOTIFICATION_TYPES.filter((t) => t.recommended);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            Ative as notificações
          </DialogTitle>
          <DialogDescription>
            Assim você acompanha a operação sem precisar abrir o painel. Estes são os alertas
            típicos que a equipe recebe:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm">
          {recommended.map((t) => (
            <li key={t.type} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">{t.label}</span>
                <span className="text-muted-foreground"> — {t.description}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Depois de ativar no seu aparelho, o administrador da operação confirma quais tipos você
          recebe.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Depois
          </Button>
          <Button asChild onClick={() => onOpenChange(false)}>
            <Link to="/notifications">Ativar agora</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
