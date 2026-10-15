import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccountOption {
  account_id: string;
  account_name: string;
}

interface AccountComboboxProps {
  accounts: AccountOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

export function AccountCombobox({
  accounts,
  value,
  onValueChange,
  placeholder = "Selecione a conta",
  className,
  triggerClassName,
}: AccountComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.account_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", triggerClassName)}
        >
          <span className="truncate text-left flex-1">
            {selected ? selected.account_name : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", className)} align="start">
        <Command>
          <CommandInput placeholder="Buscar conta..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-3 text-xs text-center text-muted-foreground">
              Nenhuma conta encontrada.
            </CommandEmpty>
            <CommandGroup>
              {accounts.map((acc) => (
                <CommandItem
                  key={acc.account_id}
                  value={acc.account_name}
                  onSelect={() => {
                    onValueChange(acc.account_id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-1.5 h-3 w-3 shrink-0",
                      value === acc.account_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {acc.account_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
