"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  Radio,
  Loader2,
  Calendar,
  AlertCircle,
  Search,
  Check,
  Plus,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEpgChannels, type EpgChannelInfo } from "@/lib/api/hooks/useEpg";

interface EpgSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  description?: string;
  showClearButton?: boolean;
  className?: string;
}

export function EpgSelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Select EPG channel...",
  label,
  description,
  showClearButton = true,
  className,
}: EpgSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manualEntry, setManualEntry] = useState("");

  const { data: channels, isLoading } = useEpgChannels(search || undefined);

  const handleSelect = (channelId: string) => {
    onChange(channelId === value ? null : channelId);
    setOpen(false);
    setSearch("");
    setManualEntry("");
  };

  const handleManualSubmit = () => {
    if (manualEntry.trim()) {
      onChange(manualEntry.trim());
      setOpen(false);
      setSearch("");
      setManualEntry("");
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const hasChannels = channels && channels.length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label className="flex items-center gap-2">
          <Radio className="h-4 w-4" />
          {label}
        </Label>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "w-full justify-between bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800",
          !value && "text-muted-foreground"
        )}
      >
        <div className="flex items-center gap-2 truncate">
          {value ? (
            <>
              <Radio className="h-4 w-4 text-green-500 shrink-0" />
              <span className="truncate">{value}</span>
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{placeholder}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {value && showClearButton && (
            <X
              className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={handleClear}
            />
          )}
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select EPG Channel</DialogTitle>
            <DialogDescription>
              Choose from imported EPG channels or enter a channel ID manually
            </DialogDescription>
          </DialogHeader>
          
          {/* Manual Entry Section */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Manual Entry</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter EPG channel ID..."
                value={manualEntry}
                onChange={(e) => setManualEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                }}
                className="flex-1"
              />
              <Button 
                type="button"
                size="sm" 
                onClick={handleManualSubmit}
                disabled={!manualEntry.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Use
              </Button>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Search EPG Channels */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Or select from imported channels</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search EPG channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="h-[250px] -mx-4">
            <div className="px-4 space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !hasChannels ? (
                <div className="flex flex-col items-center py-6 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p className="font-medium">No EPG channels found</p>
                  <p className="text-xs text-center mt-1 mb-3">
                    Import EPG data to see available channels, or use manual entry above
                  </p>
                  <Link href="/admin/epg" onClick={() => setOpen(false)}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Go to EPG Management
                    </Button>
                  </Link>
                </div>
              ) : (
                channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleSelect(channel.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors",
                      value === channel.id
                        ? "bg-primary/10 border border-primary/50"
                        : "bg-zinc-800/50 hover:bg-zinc-800 border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        {value === channel.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <Radio
                        className={cn(
                          "h-4 w-4 shrink-0",
                          channel.isAssigned && channel.assignedStreamId !== null
                            ? "text-yellow-500"
                            : "text-green-500"
                        )}
                      />
                      <span className="truncate text-sm">{channel.id}</span>
                    </div>
                    {channel.isAssigned && channel.assignedStreamName && (
                      <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                        {channel.assignedStreamName}
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Inline version for use within forms without label
export function EpgSelectorInline({
  value,
  onChange,
  disabled = false,
  placeholder = "Select EPG channel...",
  className,
}: Omit<EpgSelectorProps, "label" | "description">) {
  return (
    <EpgSelector
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  );
}

export default EpgSelector;
