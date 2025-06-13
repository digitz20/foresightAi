import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from '@/lib/utils';

type DashboardCardProps = {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
};

export default function DashboardCard({ title, icon: Icon, children, className, contentClassName, titleClassName }: DashboardCardProps) {
  return (
    <Card className={cn("shadow-lg hover:shadow-primary/20 transition-shadow duration-300", className)}>
      <CardHeader className="pb-4">
        <CardTitle className={cn("text-xl font-headline flex items-center gap-2", titleClassName)}>
          {Icon && <Icon className="h-6 w-6 text-primary" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={cn("pt-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
