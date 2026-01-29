import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon } from "lucide-react";
import { openDatePicker } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  className?: string;
  compact?: boolean; // Si es true, fuerza layout vertical (stack) siempre. Útil para sidebars.
}

export function DateRangePicker({ 
  dateFrom, 
  setDateFrom, 
  dateTo, 
  setDateTo, 
  className,
  compact = false
}: DateRangePickerProps) {
  
  return (
    <div className={cn(
      // A) Contenedor Responsive:
      // - Mobile First: grid-cols-1 (Uno debajo del otro)
      // - md+: grid-cols-2 (Lado a lado), salvo que sea 'compact'
      // - w-full y min-w-0 para evitar desbordes en flex items padres
      "grid gap-3 w-full min-w-0", 
      compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
      className
    )}>
      {/* Campo Desde */}
      <div className="space-y-1 w-full min-w-0">
        <Label 
          htmlFor="date-filter-from" 
          className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider"
        >
          Desde
        </Label>
        <div className="relative w-full group">
          <CalendarIcon 
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none group-hover:text-primary transition-colors"
          />
          <Input 
            id="date-filter-from"
            type="date" 
            // B) Input Responsive:
            // - w-full para llenar la columna del grid
            // - min-w-0 para permitir encogerse en flex containers
            className="h-10 pl-9 w-full min-w-0 bg-background text-sm shadow-sm" 
            value={dateFrom} 
            onChange={(e) => setDateFrom(e.target.value)}
            onClick={() => openDatePicker('date-filter-from')}
          />
        </div>
      </div>

      {/* Campo Hasta */}
      <div className="space-y-1 w-full min-w-0">
        <Label 
          htmlFor="date-filter-to" 
          className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider"
        >
          Hasta
        </Label>
        <div className="relative w-full group">
          <CalendarIcon 
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none group-hover:text-primary transition-colors"
          />
          <Input 
            id="date-filter-to"
            type="date" 
            className="h-10 pl-9 w-full min-w-0 bg-background text-sm shadow-sm" 
            value={dateTo} 
            onChange={(e) => setDateTo(e.target.value)} 
            onClick={() => openDatePicker('date-filter-to')}
          />
        </div>
      </div>
    </div>
  );
}