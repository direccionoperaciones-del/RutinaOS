import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ListChecks } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader } from "./SectionHeader";
import { ChartDataPoint } from "../types";

const CustomRoutineTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const total = data.cumples + data.fallas;
    const pctCumples = total > 0 ? Math.round((data.cumples / total) * 100) : 0;
    const pctFallas = 100 - pctCumples;

    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg text-xs">
        <p className="font-bold mb-2 text-slate-700">{label}</p>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="text-slate-600">Cumplimiento:</span>
          <span className="font-bold ml-auto">{data.cumples} ({pctCumples}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-200"></div>
          <span className="text-slate-600">Pendiente/Fallo:</span>
          <span className="font-bold ml-auto">{data.fallas} ({pctFallas}%)</span>
        </div>
      </div>
    );
  }
  return null;
};

interface RoutineChartProps {
  data: ChartDataPoint[];
  loading: boolean;
}

export const RoutineChart = ({ data, loading }: RoutineChartProps) => {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <SectionHeader title="Cumplimiento por Rutina" description="Top 8 rutinas con mayor índice de fallo." icon={ListChecks} />
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          {!loading && data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11, fill: '#64748B'}} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomRoutineTooltip />} cursor={{fill: 'transparent'}} />
                <Bar dataKey="cumples" name="Cumplimiento" stackId="a" fill="#34D399" radius={[0, 0, 0, 4]} barSize={16} />
                <Bar dataKey="fallas" name="Fallas/Pend" stackId="a" fill="#E2E8F0" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground bg-slate-50 rounded-xl">
              <p className="text-sm">Sin datos de rutinas</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};