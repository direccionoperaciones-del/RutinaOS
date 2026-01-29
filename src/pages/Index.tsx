import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Activity, BarChart3, Clock, AlertOctagon, Filter, X, Search, Calendar as CalendarIcon } from "lucide-react";
import { useDashboardData } from "./dashboard/hooks/useDashboardData";
import { StatCard } from "./dashboard/components/StatCard";
import { TrendChart } from "./dashboard/components/TrendChart";
import { AlertsChart } from "./dashboard/components/AlertsChart";
import { StatusChart } from "./dashboard/components/StatusChart";
import { RoutineChart } from "./dashboard/components/RoutineChart";
import { UserRanking } from "./dashboard/components/UserRanking";
import { RecentActivityList } from "./dashboard/components/RecentActivityList";
import { openDatePicker } from "@/lib/utils";

const Index = () => {
  const { 
    loading, stats, trendData, alertsData, statusData, routineData, performanceData, recentActivity,
    filters, options, profile 
  } = useDashboardData();

  const { 
    dateFrom, setDateFrom, dateTo, setDateTo, 
    selectedPdvs, setSelectedPdvs, selectedRoutines, setSelectedRoutines, 
    selectedUsers, setSelectedUsers, clearFilters, fetchData 
  } = filters;

  const hasActiveFilters = selectedPdvs.length > 0 || selectedRoutines.length > 0 || selectedUsers.length > 0;

  return (
    <div className="space-y-8 pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-movacheck-navy dark:text-white">Dashboard Operativo</h2>
          <p className="text-muted-foreground mt-1">
            {profile?.role === 'administrador' ? "Tus métricas de desempeño personal." : "Visión estratégica del cumplimiento."}
          </p>
        </div>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="text-red-600 border-red-200 bg-white hover:bg-red-50">
              <X className="w-4 h-4 mr-2" /> Limpiar
            </Button>
          )}
          <Button size="sm" onClick={fetchData} className="bg-movacheck-blue text-white hover:bg-blue-700 shadow-md">
            <Search className="w-4 h-4 mr-2" /> Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        <div className="xl:col-span-1 space-y-6">
          <Card className="bg-white dark:bg-card border-slate-200 h-fit sticky top-24">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base flex items-center gap-2 text-movacheck-blue">
                <Filter className="w-4 h-4" /> Filtros Activos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* FIX: Grid adaptable para fechas: 1col (mobile/desktop sidebar) - 2col (tablet) */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
                <div className="space-y-1.5 w-full min-w-0">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Desde</Label>
                  <div className="relative w-full">
                    <CalendarIcon 
                      className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary pointer-events-none"
                    />
                    <Input 
                      id="date-from-dash"
                      type="date" 
                      className="h-10 pl-10 text-sm w-full block bg-background min-w-0" 
                      value={dateFrom} 
                      onChange={(e) => setDateFrom(e.target.value)} 
                      onClick={() => openDatePicker('date-from-dash')} 
                    />
                  </div>
                </div>
                <div className="space-y-1.5 w-full min-w-0">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Hasta</Label>
                  <div className="relative w-full">
                    <CalendarIcon 
                      className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary pointer-events-none"
                    />
                    <Input 
                      id="date-to-dash"
                      type="date" 
                      className="h-10 pl-10 text-sm w-full block bg-background min-w-0" 
                      value={dateTo} 
                      onChange={(e) => setDateTo(e.target.value)} 
                      onClick={() => openDatePicker('date-to-dash')} 
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Punto de Venta</Label>
                <MultiSelect options={options.pdvs} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos los PDV" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Rutinas</Label>
                <MultiSelect options={options.routines} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Todas las Rutinas" />
              </div>
              {profile?.role !== 'administrador' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Responsable</Label>
                  <MultiSelect options={options.users} selected={selectedUsers} onChange={setSelectedUsers} placeholder="Todos los Usuarios" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-3 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Cumplimiento Global" value={`${stats.compliance}%`} description="Efectividad total" icon={Activity} colorBg={stats.compliance >= 90 ? "bg-emerald-100" : "bg-amber-100"} colorText={stats.compliance >= 90 ? "text-emerald-600" : "text-amber-600"} loading={loading} />
            <StatCard title="Total Tareas" value={stats.totalTasks} description="Volumen en periodo" icon={BarChart3} colorBg="bg-blue-100" colorText="text-blue-600" loading={loading} />
            <StatCard title="Pendientes" value={stats.pendingTasks} description="Por ejecutar hoy" icon={Clock} colorBg="bg-indigo-100" colorText="text-indigo-600" loading={loading} />
            <StatCard title="Alertas Críticas" value={stats.criticalAlerts} description="Prioridad Alta / Rechazos" icon={AlertOctagon} colorBg="bg-rose-100" colorText="text-rose-600" loading={loading} />
          </div>

          <TrendChart data={trendData} loading={loading} />

          <div className="grid gap-6 md:grid-cols-2">
            <AlertsChart data={alertsData} loading={loading} />
            <StatusChart data={statusData} loading={loading} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <RoutineChart data={routineData} loading={loading} />
            <UserRanking data={performanceData} />
          </div>

          <RecentActivityList data={recentActivity} loading={loading} />

        </div>
      </div>
    </div>
  );
};

export default Index;