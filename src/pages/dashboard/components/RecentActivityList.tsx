import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentActivityListProps {
  data: any[];
  loading: boolean;
}

export const RecentActivityList = ({ data, loading }: RecentActivityListProps) => {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <SectionHeader title="Actividad en Vivo" description="Últimos eventos registrados en el sistema." icon={Activity} />
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground opacity-60">
              <Activity className="w-10 h-10 mb-2 mx-auto" />
              <p className="text-sm">Sin actividad reciente</p>
            </div>
          ) : (
            data.map((task) => (
              <div key={task.id} className="flex gap-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors px-2 rounded-lg">
                <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                  task.estado.startsWith('completada') ? 'bg-emerald-500' : 'bg-amber-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {task.routine_templates?.nombre}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span className="font-medium">{task.pdv?.nombre}</span>
                    <span>•</span>
                    <span>{format(new Date(task.completado_at || task.created_at), 'HH:mm', { locale: es })}</span>
                  </div>
                </div>
                <div className="text-right">
                  {task.prioridad_snapshot === 'critica' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">CRÍTICA</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};