import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Users } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { UserPerformance } from "../types";

interface UserRankingProps {
  data: UserPerformance[];
}

export const UserRanking = ({ data }: UserRankingProps) => {
  return (
    <Card className="border-slate-200 border dark:border-slate-700/50">
      <CardHeader>
        <SectionHeader title="Top Rendimiento" description="Usuarios con mayor tasa de cumplimiento." icon={Users} />
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
          {data.map((user, idx) => (
            <div key={user.name} className="flex items-center gap-3">
              <div className="font-mono text-xs text-slate-400 w-4 font-bold">{idx + 1}</div>
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[150px]">{user.name}</span>
                  <span className="font-bold text-movacheck-blue dark:text-blue-400">{user.percentage}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-movacheck-blue dark:bg-blue-500 rounded-full transition-all duration-500" 
                    style={{ width: `${user.percentage}%`, opacity: 1 - (idx * 0.05) }}
                  />
                </div>
              </div>
            </div>
          ))}
          {data.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">Sin datos de rendimiento.</div>}
        </div>
      </CardContent>
    </Card>
  );
};