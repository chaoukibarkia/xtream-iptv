"use client";

import { useState } from "react";
import { Search, Loader2, Check, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useFetchLogos, useSaveLogo, LogoCandidate } from "@/lib/api/hooks/useStreams";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogoFetcherButtonProps {
  channelName: string;
  streamId?: number; // If provided, saves to DB; otherwise just returns URL
  onLogoSelected: (logoUrl: string) => void;
  disabled?: boolean;
}

export function LogoFetcherButton({
  channelName,
  streamId,
  onLogoSelected,
  disabled,
}: LogoFetcherButtonProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [logos, setLogos] = useState<LogoCandidate[]>([]);
  const [selectedLogo, setSelectedLogo] = useState<string | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);

  const fetchLogos = useFetchLogos();
  const saveLogo = useSaveLogo();

  const handleFetchLogos = async () => {
    if (!channelName || channelName.trim().length < 2) {
      toast({
        title: "Channel name required",
        description: "Enter a channel name first (at least 2 characters)",
        variant: "destructive",
      });
      return;
    }

    setIsOpen(true);
    setLogos([]);
    setSelectedLogo(null);

    try {
      const result = await fetchLogos.mutateAsync(channelName);
      setLogos(result.logos || []);
      if (result.logos.length === 0) {
        toast({
          title: "No logos found",
          description: "No matching logos found for this channel name",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error fetching logos",
        description: error.message || "Failed to search for logos",
        variant: "destructive",
      });
    }
  };

  const handleClickLogo = (logoUrl: string) => {
    // Just select/highlight the logo, don't save yet
    setSelectedLogo(logoUrl);
  };

  const handleSaveLogo = async () => {
    if (!selectedLogo) return;

    if (streamId) {
      // Save to DB and download locally
      try {
        const result = await saveLogo.mutateAsync({ streamId, logoUrl: selectedLogo, removeBackground });
        onLogoSelected(result.logoUrl);
        toast({
          title: "Logo saved",
          description: removeBackground 
            ? "Logo has been downloaded and background removed" 
            : "Logo has been downloaded and saved",
        });
        setIsOpen(false);
      } catch (error: any) {
        toast({
          title: "Error saving logo",
          description: error.message || "Failed to save logo",
          variant: "destructive",
        });
      }
    } else {
      // Just use the URL directly (for new streams)
      onLogoSelected(selectedLogo);
      setIsOpen(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleFetchLogos}
        disabled={disabled || fetchLogos.isPending}
        className="shrink-0"
      >
        {fetchLogos.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        <span className="ml-2 hidden sm:inline">Fetch Logo</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Channel Logo</DialogTitle>
            <DialogDescription>
              Found {logos.length} logo{logos.length !== 1 ? "s" : ""} for "{channelName}"
            </DialogDescription>
          </DialogHeader>

          {fetchLogos.isPending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Searching for logos...</span>
            </div>
          ) : logos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mb-4 opacity-50" />
              <p>No logos found</p>
              <p className="text-sm">Try a different channel name</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {logos.map((logo, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleClickLogo(logo.url)}
                    disabled={saveLogo.isPending}
                    className={`
                      relative p-4 rounded-lg border-2 transition-all
                      hover:border-primary hover:bg-accent
                      ${selectedLogo === logo.url ? "border-primary bg-accent ring-2 ring-primary" : "border-border"}
                      ${saveLogo.isPending ? "opacity-50 pointer-events-none" : ""}
                    `}
                  >
                    {saveLogo.isPending && selectedLogo === logo.url && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                    <div className="aspect-square bg-zinc-800 rounded flex items-center justify-center overflow-hidden mb-2">
                      <img
                        src={logo.url}
                        alt={logo.name}
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder-logo.png";
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{logo.source}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex items-center justify-between gap-4 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <input 
                type="checkbox"
                id="removeBackground" 
                checked={removeBackground}
                onChange={(e) => setRemoveBackground(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-primary"
              />
              <label 
                htmlFor="removeBackground" 
                className="text-sm font-medium leading-none cursor-pointer select-none"
              >
                Remove background
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveLogo}
                disabled={!selectedLogo || saveLogo.isPending}
              >
                {saveLogo.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Logo"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
