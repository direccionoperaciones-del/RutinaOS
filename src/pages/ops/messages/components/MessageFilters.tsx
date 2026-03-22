import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Filter, X } from "lucide-react";
import { DateRangePicker } from "@/components/common/DateRangePicker";

interface MessageFiltersProps {
  filterType: string;
  setFilterType: (val: string) => void;
  filterPriority: string;
  setFilterPriority: (val: string) => void;
  dateFrom: string;
  setDateFrom: (val: string) => void;
  dateTo: string;
  setDateTo: (val: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

export function MessageFilters({
  filterType, setFilterType,
  filterPriority, setFilterPriority,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  onClear, hasActiveFilters
}: MessageFiltersProps) {
  return (
    <Card className="bg-muted/20 border-primary/10">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Filter className="w-4 h-4" /> Filtros
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs text-destructive hover:bg-destructive/10">
              <X className="w-3 h-3 mr-1" /> Borrar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tipo</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full h-9 text-sm bg-background">
                <SelectValue placeholder="Tipo de mensaje" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="comunicado">Comunicados</SelectItem>
                <SelectItem value="mensaje">Mensajes Directos</SelectItem>
                <SelectItem value="sistema">Notificaciones</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Prioridad</Label>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-full h-9 text-sm bg-background">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                <SelectItem value="alta">Alta Prioridad</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <DateRangePicker 
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              compact={false}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}