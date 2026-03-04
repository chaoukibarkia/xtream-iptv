"use client";

import { useState, useEffect } from "react";
import {
  Radio,
  Loader2,
  Check,
  X,
  Calendar,
  Clock,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { EpgSelector } from "./epg-selector";
import { useStreamEpg, useAssignStreamEpg } from "@/lib/api/hooks/useEpg";
import { formatDistanceToNow, format } from "date-fns";

interface EpgAssignmentModalProps {
  // Support both naming conventions
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  onClose?: () => void;
  streamId: number;
  streamName: string;
  currentEpgChannelId?: string | null;
  onSuccess?: () => void;
}

export function EpgAssignmentModal({
  open,
  onOpenChange,
  isOpen,
  onClose,
  streamId,
  streamName,
  currentEpgChannelId,
  onSuccess,
}: EpgAssignmentModalProps) {
  const { toast } = useToast();
  
  // Normalize props - support both naming conventions
  const isDialogOpen = open ?? isOpen ?? false;
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else if (!newOpen && onClose) {
      onClose();
    }
  };
  
  const [selectedEpgChannel, setSelectedEpgChannel] = useState<string | null>(
    currentEpgChannelId || null
  );

  // Fetch stream EPG data
  const { data: streamEpg, isLoading: isLoadingEpg } = useStreamEpg(streamId);
  const assignEpg = useAssignStreamEpg();

  // Reset selection when modal opens with new stream
  useEffect(() => {
    if (isDialogOpen) {
      setSelectedEpgChannel(currentEpgChannelId || null);
    }
  }, [isDialogOpen, currentEpgChannelId]);

  const handleSave = async () => {
    try {
      const result = await assignEpg.mutateAsync({
        streamId,
        epgChannelId: selectedEpgChannel,
      });

      toast({
        title: selectedEpgChannel ? "EPG Assigned" : "EPG Removed",
        description: result.message,
      });

      onSuccess?.();
      handleOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update EPG assignment",
        variant: "destructive",
      });
    }
  };

  const handleRemove = async () => {
    setSelectedEpgChannel(null);
    try {
      const result = await assignEpg.mutateAsync({
        streamId,
        epgChannelId: null,
      });

      toast({
        title: "EPG Removed",
        description: result.message,
      });

      onSuccess?.();
      handleOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove EPG assignment",
        variant: "destructive",
      });
    }
  };

  const hasChanges = selectedEpgChannel !== (currentEpgChannelId || null);

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-green-500" />
            Assign EPG Channel
          </DialogTitle>
          <DialogDescription>
            Link an EPG (Electronic Program Guide) channel to &quot;{streamName}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Assignment */}
          {currentEpgChannelId && (
            <Card className="bg-zinc-800/50 border-zinc-700">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Current Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-green-500" />
                    <span className="font-mono text-sm">{currentEpgChannelId}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemove}
                    disabled={assignEpg.isPending}
                    className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* EPG Selector */}
          <div className="space-y-2">
            <EpgSelector
              value={selectedEpgChannel}
              onChange={setSelectedEpgChannel}
              label="EPG Channel"
              description="Select an EPG channel ID from the available list. Channels marked in yellow are already assigned to other streams."
              disabled={assignEpg.isPending}
            />
          </div>

          {/* Current program */}
          {streamEpg?.currentProgram && selectedEpgChannel === currentEpgChannelId && (
            <>
              <Separator className="bg-zinc-700" />
              <Card className="bg-green-950/20 border-green-800/30">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4 text-green-400 animate-pulse" />
                    Now Playing
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  {isLoadingEpg ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-green-900/20 border border-green-800/30">
                      <div className="flex flex-col items-center text-xs text-green-400 shrink-0">
                        <Clock className="h-3 w-3 mb-1" />
                        <span className="font-medium">{format(new Date(streamEpg.currentProgram.start), "HH:mm")}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="font-medium">{format(new Date(streamEpg.currentProgram.end), "HH:mm")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
                            LIVE
                          </Badge>
                        </div>
                        <p className="font-medium text-base">{streamEpg.currentProgram.title}</p>
                        {streamEpg.currentProgram.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {streamEpg.currentProgram.description}
                          </p>
                        )}
                        <p className="text-xs text-green-400 mt-2">
                          Ends {formatDistanceToNow(new Date(streamEpg.currentProgram.end), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Preview of upcoming programs */}
          {(streamEpg?.upcomingPrograms?.length || 0) > 0 && selectedEpgChannel === currentEpgChannelId && (
            <>
              <Separator className="bg-zinc-700" />
              <Card className="bg-zinc-800/30 border-zinc-700">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-400" />
                    Upcoming Programs
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Next {streamEpg?.upcomingPrograms?.length} programs from EPG
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-2 max-h-48 overflow-y-auto space-y-2">
                  {isLoadingEpg ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    streamEpg?.upcomingPrograms?.map((program) => (
                      <div
                        key={program.id}
                        className="flex items-start gap-3 p-2 rounded-lg bg-zinc-800/50 text-sm"
                      >
                        <div className="flex flex-col items-center text-xs text-muted-foreground shrink-0">
                          <Clock className="h-3 w-3 mb-1" />
                          <span>{format(new Date(program.start), "HH:mm")}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{program.title}</p>
                          {program.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {program.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(program.start), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* No EPG data warning */}
          {!isLoadingEpg && selectedEpgChannel && !streamEpg?.hasEpgData && selectedEpgChannel === currentEpgChannelId && (
            <Card className="bg-yellow-950/20 border-yellow-800/30">
              <CardContent className="py-3">
                <div className="flex items-center gap-2 text-yellow-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>No upcoming EPG data for this channel</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  EPG data may not have been imported yet, or the channel has no scheduled programs.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={assignEpg.isPending || !hasChanges}
          >
            {assignEpg.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {selectedEpgChannel ? "Assign EPG" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EpgAssignmentModal;
