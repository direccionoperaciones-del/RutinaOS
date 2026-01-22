import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Activity } from "lucide-react";
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
    <Card className="border-slate-200 border dark:border-slate-700/50">
      <CardHeader>
        <SectionHeader title="Actividad en Vivo" description="Últimos eventos registrados en el sistema." icon={Activity} />
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl bg-slate-100 dark:bg-slate-800" />)}
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground opacity-60">
              <Activity className="w-10 h-10 mb-2 mx-auto" />
              <p className="text-sm">Sin actividad reciente</p>
            </div>
          ) : (
            data.map((task) => (
              <div 
                key={task.id} 
                className="flex gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-2 rounded-lg"
              >
                <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                  task.estado.startsWith('completada') ? 'bg-emerald-500' : 'bg-amber-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {task.routine_templates?.nombre}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-medium text-slate-600 dark:text-slate-300">{task.pdv?.nombre}</span>
                    <span>•</span>
                    <span>{format(new Date(task.completado_at || task.created_at), 'HH:mm', { locale: es })}</span>
                  </div>
                </div>
                <div className="text-right">
                  {task.prioridad_snapshot === 'critica' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                      CRÍTICA
                    </span>
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