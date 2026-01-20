import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

const StatCard = ({ title, value, description, icon: Icon, trend }: any) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">
        {title}
      </CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">
        {description}
      </p>
    </CardContent>
  </Card>
);

const Index = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Resumen de operaciones y cumplimiento en tiempo real.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Cumplimiento Hoy" 
          value="92%" 
          description="+2.1% respecto ayer" 
          icon={Activity}
        />
        <StatCard 
          title="Tareas Completadas" 
          value="145" 
          description="De 158 programadas" 
          icon={CheckCircle2}
        />
        <StatCard 
          title="Alertas Críticas" 
          value="3" 
          description="Requieren atención inmediata" 
          icon={AlertTriangle}
        />
        <StatCard 
          title="Tiempo Promedio" 
          value="18m" 
          description="Por rutina ejecutada" 
          icon={Clock}
        />
      </div>

      {/* Content Placeholders */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Resumen Semanal</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-md">
              Gráfico de Barras (Próximamente con Chart.js)
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center">
                  <span className="relative flex h-2 w-2 mr-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">Apertura de Caja - PDV Central</p>
                    <p className="text-sm text-muted-foreground">Hace {i * 15} minutos por Juan Pérez</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;