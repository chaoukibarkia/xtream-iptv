import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: number;
  trendLabel?: string;
  icon?: LucideIcon;
  iconColor?: string;
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  trend,
  trendLabel = "vs last period",
  icon: Icon,
  iconColor = "text-primary",
  className,
}: StatsCardProps) {
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {Icon && (
            <div
              className={cn(
                "rounded-lg bg-muted p-2",
                iconColor
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="text-3xl font-bold">{value}</p>
          
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}

          {trend !== undefined && (
            <div className="mt-2 flex items-center gap-1">
              {isPositive && <TrendingUp className="h-4 w-4 text-green-500" />}
              {isNegative && <TrendingDown className="h-4 w-4 text-red-500" />}
              <span
                className={cn(
                  "text-sm font-medium",
                  isPositive && "text-green-500",
                  isNegative && "text-red-500",
                  !isPositive && !isNegative && "text-muted-foreground"
                )}
              >
                {isPositive && "+"}
                {trend}%
              </span>
              <span className="text-sm text-muted-foreground">{trendLabel}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
