import { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const SectionHeader = ({ title, description, icon: Icon }: SectionHeaderProps) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="p-2 bg-movacheck-blue/10 rounded-lg">
      <Icon className="w-5 h-5 text-movacheck-blue" />
    </div>
    <div>
      <h3 className="text-lg font-bold text-movacheck-navy dark:text-white leading-none">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  </div>
);