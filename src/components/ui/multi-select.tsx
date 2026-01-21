import * as React from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandEmpty,
  CommandInput,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type Option = {
  label: string;
  value: string;
};

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Seleccionar...",
  className,
  ...props
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item));
  };

  return (
    <Popover open={open} onOpenChange={setOpen} {...props}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-10 py-2 px-3 text-xs bg-background hover:bg-background",
            className
          )}
          onClick={() => setOpen(!open)}
        >
          <div className="flex flex-wrap gap-1 items-center overflow-hidden">
            {selected.length === 0 && (
              <span className="text-muted-foreground font-normal text-xs">{placeholder}</span>
            )}
            {selected.length > 3 ? (
               <Badge variant="secondary" className="mr-1 mb-1 text-[10px]">
                 {selected.length} seleccionados
               </Badge>
            ) : (
              selected.map((item) => {
                const option = options.find((opt) => opt.value === item);
                return (
                  <Badge variant="secondary" key={item} className="mr-1 mb-1 text-[10px] font-normal">
                    {option?.label || item}
                    <div
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleUnselect(item);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => handleUnselect(item)}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </div>
                  </Badge>
                );
              })
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 max-w-[300px]">
        <Command className="w-full">
          <CommandInput placeholder="Buscar..." />
          <CommandEmpty>No encontrado.</CommandEmpty>
          <CommandList>
            <CommandGroup className="max-h-64 overflow-auto">
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      onChange(
                        isSelected
                          ? selected.filter((item) => item !== option.value)
                          : [...selected, option.value]
                      );
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className={cn("h-4 w-4")} />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}