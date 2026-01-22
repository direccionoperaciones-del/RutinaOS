export interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  compliance: number;
  criticalAlerts: number;
}

export interface ChartDataPoint {
  name: string;
  [key: string]: any;
}

export interface StatusDataPoint {
  name: string;
  value: number;
  color: string;
}

export interface UserPerformance {
  name: string;
  total: number;
  completed: number;
  percentage: number;
}

export interface FilterOptions {
  pdvs: { label: string; value: string }[];
  routines: { label: string; value: string }[];
  users: { label: string; value: string }[];
}