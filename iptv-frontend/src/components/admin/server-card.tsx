"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ServerCardProps {
  server: {
    id: number;
    name: string;
    status: "online" | "offline" | "degraded" | "maintenance";
    cpuUsage: number;
    memoryUsage: number;
    bandwidthUsage: number;
    connections: number;
    maxConnections: number;
    region: string;
    countryCode: string;
  };
  onClick?: () => void;
}

const statusColors = {
  online: "bg-green-500",
  offline: "bg-red-500",
  degraded: "bg-yellow-500",
  maintenance: "bg-blue-500",
};

const statusLabels = {
  online: "Online",
  offline: "Offline",
  degraded: "Degraded",
  maintenance: "Maintenance",
};

export function ServerCard({ server, onClick }: ServerCardProps) {
  const getUsageColor = (usage: number) => {
    if (usage >= 90) return "bg-red-500";
    if (usage >= 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary",
        server.status === "offline" && "opacity-60"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                statusColors[server.status]
              )}
            />
            <CardTitle className="text-base font-medium">
              {server.name}
            </CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {server.countryCode} {server.region}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CPU */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">CPU</span>
            <span>{server.cpuUsage}%</span>
          </div>
          <Progress
            value={server.cpuUsage}
            className={cn("h-1.5", getUsageColor(server.cpuUsage))}
          />
        </div>

        {/* Memory */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">RAM</span>
            <span>{server.memoryUsage}%</span>
          </div>
          <Progress
            value={server.memoryUsage}
            className={cn("h-1.5", getUsageColor(server.memoryUsage))}
          />
        </div>

        {/* Bandwidth */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Bandwidth</span>
            <span>{server.bandwidthUsage}%</span>
          </div>
          <Progress
            value={server.bandwidthUsage}
            className={cn("h-1.5", getUsageColor(server.bandwidthUsage))}
          />
        </div>

        {/* Connections */}
        <div className="flex justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Connections</span>
          <span className="font-medium">
            {server.connections.toLocaleString()} /{" "}
            {server.maxConnections.toLocaleString()}
          </span>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center">
          <Badge
            variant={server.status === "online" ? "success" : "destructive"}
            className="text-xs"
          >
            {statusLabels[server.status]}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
