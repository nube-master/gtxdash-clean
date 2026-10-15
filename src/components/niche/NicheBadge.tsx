import { Badge } from "@/components/ui/badge";
import { nicheColor, nicheLabel } from "@/lib/productNiche";

export function NicheBadge({ niche, className = "" }: { niche: string; className?: string }) {
  return (
    <Badge variant="outline" className={`text-[9px] font-medium ${nicheColor(niche)} ${className}`}>
      {nicheLabel(niche)}
    </Badge>
  );
}
