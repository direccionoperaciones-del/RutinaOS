import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader } from "./SectionHeader";
import { ChartDataPoint } from "../types";

interface AlertsChartProps {
  data: ChartDataPoint[];
  loading: boolean;
}

export const AlertsChart = ({ data, loading }: AlertsChartProps) => {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <SectionHeader title="Alertas Críticas" description="Incidencias y tareas críticas por día." icon={AlertTriangle} />
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          {!loading && data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#FEE2E2'}} contentStyle={{ borderRadius: '8px' }}/>
                <Bar dataKey="Alertas" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-slate-50 rounded-xl border-2 border-dashed">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 opacity-50" />
              <p className="text-sm">¡Sin alertas críticas!</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};