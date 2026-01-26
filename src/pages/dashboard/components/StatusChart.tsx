import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PieChart as PieChartIcon } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SectionHeader } from "./SectionHeader";
import { StatusDataPoint } from "../types";

interface StatusChartProps {
  data: StatusDataPoint[];
  loading: boolean;
}

export const StatusChart = ({ data, loading }: StatusChartProps) => {
  // Calculamos el total para los porcentajes
  const total = useMemo(() => data.reduce((acc, curr) => acc + curr.value, 0), [data]);

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <SectionHeader title="Estado de Ejecución" description="Desglose por tipo de cumplimiento." icon={PieChartIcon} />
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full flex items-center justify-center">
          {!loading && data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => {
                    const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                    return [`${value} (${percent}%)`]; // Muestra: 8 (45.5%)
                  }}
                />
                <Legend 
                  verticalAlign="middle" 
                  align="right" 
                  layout="vertical" 
                  iconType="circle"
                  formatter={(value, entry: any) => {
                    const { payload } = entry;
                    const percent = total > 0 ? ((payload.value / total) * 100).toFixed(0) : 0;
                    return (
                      <span className="text-slate-600 dark:text-slate-300 ml-1 font-medium text-sm">
                        {value} <span className="text-xs text-muted-foreground font-normal">({percent}%)</span>
                      </span>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-muted-foreground">
              <p className="text-sm">Sin datos para mostrar</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};