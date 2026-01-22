import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SectionHeader } from "./SectionHeader";
import { ChartDataPoint } from "../types";

interface TrendChartProps {
  data: ChartDataPoint[];
  loading: boolean;
}

export const TrendChart = ({ data, loading }: TrendChartProps) => {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <SectionHeader title="Tendencia Operativa" description="Evolución diaria de tareas totales, completadas y pendientes." icon={TrendingUp} />
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          {loading ? <Skeleton className="w-full h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                <Legend verticalAlign="top" height={36} iconType="circle"/>
                <Line type="monotone" dataKey="Total" stroke="#2563EB" strokeWidth={2} dot={false} activeDot={{r: 6}} />
                <Line type="monotone" dataKey="completed" name="Completadas" stroke="#34D399" strokeWidth={2} dot={false} activeDot={{r: 6}} />
                <Line type="monotone" dataKey="pending" name="Pendientes" stroke="#F59E0B" strokeWidth={2} dot={false} activeDot={{r: 6}} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};