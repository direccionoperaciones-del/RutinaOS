import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  colorBg?: string;
  colorText?: string;
  loading?: boolean;
}

export const StatCard = ({ title, value, description, icon: Icon, colorBg, colorText, loading }: StatCardProps) => (
  <Card className="overflow-hidden border-slate-200 shadow-soft hover:shadow-card-hover transition-all group">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-2xl transition-colors ${colorBg || "bg-slate-100"}`}>
          <Icon className={`h-6 w-6 transition-colors ${colorText || "text-slate-600"}`} />
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="h-3 w-3" />
          <span>LIVE</span>
        </div>
      </div>
      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-8 w-24 mb-1" />
        ) : (
          <h2 className="text-3xl font-bold text-movacheck-navy dark:text-white tracking-tight">{value}</h2>
        )}
        <p className="text-sm text-slate-500 font-medium mt-1">{title}</p>
        <p className="text-xs text-slate-400 mt-2 line-clamp-1">{description}</p>
      </div>
    </CardContent>
  </Card>
);