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
  compact?: boolean; // Force stacked layout if true
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
      "grid gap-3 w-full min-w-0", 
      compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
      className
    )}>
      {/* Campo Desde */}
      <div className="space-y-1 w-full min-w-0">
        <Label className="text-xs font-semibold text-muted-foreground uppercase">Desde</Label>
        <div className="relative w-full">
          <CalendarIcon 
            className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary pointer-events-none"
          />
          <Input 
            id="date-filter-from"
            type="date" 
            className="h-10 pl-9 text-sm bg-background w-full min-w-0 block shadow-sm" 
            value={dateFrom} 
            onChange={(e) => setDateFrom(e.target.value)}
            onClick={() => openDatePicker('date-filter-from')}
          />
        </div>
      </div>

      {/* Campo Hasta */}
      <div className="space-y-1 w-full min-w-0">
        <Label className="text-xs font-semibold text-muted-foreground uppercase">Hasta</Label>
        <div className="relative w-full">
          <CalendarIcon 
            className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary pointer-events-none"
          />
          <Input 
            id="date-filter-to"
            type="date" 
            className="h-10 pl-9 text-sm bg-background w-full min-w-0 block shadow-sm" 
            value={dateTo} 
            onChange={(e) => setDateTo(e.target.value)} 
            onClick={() => openDatePicker('date-filter-to')}
          />
        </div>
      </div>
    </div>
  );
}