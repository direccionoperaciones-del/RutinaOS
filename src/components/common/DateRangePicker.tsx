import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { parseLocalDate } from "@/lib/utils"

interface DateRangePickerProps {
  dateFrom: string
  setDateFrom: (date: string) => void
  dateTo: string
  setDateTo: (date: string) => void
  className?: string
  compact?: boolean
}

export function DateRangePicker({
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  className,
  compact = false,
}: DateRangePickerProps) {

  // Convert string YYYY-MM-DD to Date object for Calendar
  const fromDate = dateFrom ? parseLocalDate(dateFrom) : undefined
  const toDate = dateTo ? parseLocalDate(dateTo) : undefined

  const handleSelectFrom = (date: Date | undefined) => {
    if (date) setDateFrom(format(date, "yyyy-MM-dd"))
  }

  const handleSelectTo = (date: Date | undefined) => {
    if (date) setDateTo(format(date, "yyyy-MM-dd"))
  }

  return (
    <div className={cn(
      // A) Contenedor Responsive:
      // Mobile: grid-cols-1 (Stack vertical perfecto)
      // Desktop: grid-cols-2 (Lado a lado)
      // min-w-0 evita que el grid se expanda más allá del viewport en flex containers
      "grid gap-3 w-full min-w-0",
      compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
      className
    )}>
      {/* Campo Desde */}
      <div className="space-y-1 w-full min-w-0 flex flex-col">
        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
          Desde
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                // C) Trigger Responsive:
                // w-full: llena la celda del grid
                // min-w-0: permite al flex interno contraerse
                // px-3: padding seguro
                // text-left font-normal: estilo base
                "w-full justify-start text-left font-normal min-w-0 px-3 border-slate-200 dark:border-slate-700 shadow-sm",
                !dateFrom && "text-muted-foreground"
              )}
            >
              {/* D) Icono seguro: shrink-0 evita deformación */}
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              
              {/* D) Texto seguro: truncate corta el texto si es muy largo en pantallas de 320px */}
              <span className="truncate">
                {fromDate ? format(fromDate, "PPP", { locale: es }) : <span>Seleccionar</span>}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fromDate}
              onSelect={handleSelectFrom}
              initialFocus
              locale={es}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Campo Hasta */}
      <div className="space-y-1 w-full min-w-0 flex flex-col">
        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
          Hasta
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-full justify-start text-left font-normal min-w-0 px-3 border-slate-200 dark:border-slate-700 shadow-sm",
                !dateTo && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">
                {toDate ? format(toDate, "PPP", { locale: es }) : <span>Seleccionar</span>}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={toDate}
              onSelect={handleSelectTo}
              initialFocus
              locale={es}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}