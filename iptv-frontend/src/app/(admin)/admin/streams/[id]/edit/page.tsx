"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  X,
  Server,
  ShieldCheck,
  Activity,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Loader2,
  Settings2,
  Cpu,
  Zap,
  Play,
  Tv,
  Film,
  Radio,
  Image as ImageIcon,
  AlertCircle,
  Save,
  Package,
  Layers,
  Globe,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import { useStreamDetails, useUpdateStream, useTestStream } from "@/lib/api/hooks/useStreams";
import { useCategories } from "@/lib/api/hooks/useDashboard";
import { useServers } from "@/lib/api/hooks/useServers";
import { api } from "@/lib/api/client";
import { useTranscodingProfiles, useAbrProfiles } from "@/lib/api/hooks/useTranscoding";
import { useBouquets } from "@/lib/api/hooks/useBouquets";
import { BouquetTreeSelect } from "@/components/admin/bouquet-tree-select";
import { EpgSelector } from "@/components/admin/epg-selector";
import { ServerHierarchySelector } from "@/components/admin/server-hierarchy-selector";
import { LogoFetcherButton } from "@/components/admin/logo-fetcher-button";
import { StreamLogo, StreamLogoContainer } from "@/components/ui/stream-logo";
import type { TranscodingProfile, AbrProfile } from "@/types";

interface ServerData {
  id: number;
  name: string;
  status: string;
  region?: string;
  type?: string;
  hasNvenc?: boolean;
  hasQsv?: boolean;
  hasVaapi?: boolean;
}

const streamTypeIcons = {
  LIVE: Tv,
  VOD: Film,
  SERIES: Film,
  RADIO: Radio,
};

export default function EditStreamPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const streamId = parseInt(params.id as string);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    sourceUrl: "",
    backupUrls: [] as string[],
    customUserAgent: "",
    analyzeDuration: undefined as number | undefined,
    probeSize: undefined as number | undefined,
    streamType: "LIVE" as "LIVE" | "VOD" | "SERIES" | "RADIO",
    categoryId: 0,
    logoUrl: "",
    epgChannelId: null as string | null,
    isActive: true,
    alwaysOn: false,
    serverIds: [] as number[],
    originServerId: undefined as number | undefined,
    childServerIds: [] as number[],
    cascadeConfig: [] as Array<{ serverId: number; pullFromServerId: number; tier: number }>,
    transcodeProfileId: undefined as number | undefined,
    transcodeServerId: undefined as number | undefined,
    abrProfileId: undefined as number | undefined,
    bouquetIds: [] as number[],
  });
  const [newBackupUrl, setNewBackupUrl] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // API hooks
  const { data, isLoading, error } = useStreamDetails(streamId, {
    includeHealth: false,
    includeProbe: false,
  });
  const stream = data?.stream;

  const { data: categories } = useCategories(formData.streamType);
  const { data: serversData } = useServers();
  const { data: transcodingProfiles } = useTranscodingProfiles();
  const { data: abrProfiles } = useAbrProfiles();
  const { data: bouquetsData } = useBouquets();
  const updateStream = useUpdateStream();
  const testStream = useTestStream();

  // Extract servers from API response (handle both response formats)
  const servers: ServerData[] = useMemo(() => {
    if (!serversData) return [];
    // API returns { servers: [...] } format
    const serverList = (serversData as any)?.servers || (serversData as any)?.data || [];
    if (!Array.isArray(serverList)) return [];
    return serverList as ServerData[];
  }, [serversData]);
  const bouquets = bouquetsData || [];

  // Get unique countries from categories (parent categories with countryCode)
  const countries = useMemo(() => {
    if (!categories) return [];
    const countryMap = new Map<string, { code: string; name: string; flagSvgUrl: string | null; categoryId: number }>();
    
    categories.forEach(cat => {
      if (cat.countryCode && !cat.parentId) {
        // This is a country-level category (no parent = top level)
        if (!countryMap.has(cat.countryCode)) {
          countryMap.set(cat.countryCode, {
            code: cat.countryCode,
            name: cat.name,
            flagSvgUrl: cat.flagSvgUrl,
            categoryId: cat.id,
          });
        }
      }
    });
    
    // Sort by sortOrder first, then by name
    return Array.from(countryMap.values()).sort((a, b) => {
      const catA = categories.find(c => c.id === a.categoryId);
      const catB = categories.find(c => c.id === b.categoryId);
      const orderA = catA?.sortOrder ?? 999;
      const orderB = catB?.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [categories]);

  // Get subcategories for the selected country
  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    
    if (!selectedCountry) {
      // If no country selected, show all active categories
      return categories.filter(cat => cat.isActive);
    }
    
    // Find the parent category for the selected country by countryCode
    const parentCategory = categories.find(cat => cat.countryCode === selectedCountry && !cat.parentId);
    
    if (parentCategory) {
      // Return only categories that are children of this country (have parentId = parent category id)
      const children = categories.filter(cat => 
        cat.isActive && cat.parentId === parentCategory.id
      );
      
      // If no children, include the parent itself
      if (children.length === 0) {
        return [parentCategory].filter(cat => cat.isActive);
      }
      
      return children;
    }
    
    // Fallback: filter by countryCode directly
    return categories.filter(cat => cat.isActive && cat.countryCode === selectedCountry);
  }, [categories, selectedCountry]);

  // Initialize form data when stream is loaded
  useEffect(() => {
    if (stream && !isInitialized) {
      setFormData({
        name: stream.name,
        sourceUrl: stream.sourceUrl,
        backupUrls: stream.backupUrls || [],
        customUserAgent: (stream as any).customUserAgent || "",
        analyzeDuration: (stream as any).analyzeDuration || undefined,
        probeSize: (stream as any).probeSize || undefined,
        streamType: stream.streamType,
        categoryId: stream.categoryId,
        logoUrl: stream.logoUrl || "",
        epgChannelId: (stream as any).epgChannelId || null,
        isActive: stream.isActive,
        alwaysOn: (stream as any).alwaysOn || false,
        serverIds: stream.serverAssignments?.map((sa) => sa.server.id) || [],
        originServerId: (() => {
          // Try to get from serverDistribution first (most reliable)
          const originDist = (stream as any).serverDistribution
            ?.find((d: any) => d.role === 'ORIGIN');
          if (originDist) return originDist.serverId;
          // Fallback to direct field if available
          return (stream as any).originServerId || undefined;
        })(),
        childServerIds: (stream as any).serverDistribution
          ?.filter((d: any) => d.role === 'CHILD')
          ?.map((d: any) => d.serverId) || [],
        cascadeConfig: (() => {
          const originDist = (stream as any).serverDistribution
            ?.find((d: any) => d.role === 'ORIGIN');
          const originServerId = originDist?.serverId || (stream as any).originServerId;
          return (stream as any).serverDistribution
            ?.filter((d: any) => d.role === 'CHILD')
            ?.map((d: any) => ({
              serverId: d.serverId,
              pullFromServerId: d.pullFromServerId || originServerId,
              tier: d.tier || 1,
            })) || [];
        })(),
        transcodeProfileId: stream.transcodeProfileId || undefined,
        transcodeServerId: (stream as any).transcodeServerId || undefined,
        abrProfileId: (stream as any).abrProfileId || undefined,
        bouquetIds: (stream as any).bouquets?.map((b: any) => b.bouquet.id) || [],
      });
      setIsInitialized(true);
    }
  }, [stream, isInitialized]);

  // Set the selected country based on the stream's current category
  useEffect(() => {
    if (stream && categories && formData.categoryId && !selectedCountry) {
      const currentCategory = categories.find(cat => cat.id === formData.categoryId);
      if (currentCategory) {
        if (currentCategory.countryCode) {
          // Category has a country code
          setSelectedCountry(currentCategory.countryCode);
        } else if (currentCategory.parentId) {
          // Category has a parent, check if parent has country code
          const parentCategory = categories.find(cat => cat.id === currentCategory.parentId);
          if (parentCategory?.countryCode) {
            setSelectedCountry(parentCategory.countryCode);
          }
        }
      }
    }
  }, [stream, categories, formData.categoryId, selectedCountry]);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAddBackupUrl = () => {
    if (newBackupUrl && !formData.backupUrls.includes(newBackupUrl)) {
      setFormData({
        ...formData,
        backupUrls: [...formData.backupUrls, newBackupUrl],
      });
      setNewBackupUrl("");
    }
  };

  const handleRemoveBackupUrl = (index: number) => {
    setFormData({
      ...formData,
      backupUrls: formData.backupUrls.filter((_, i) => i !== index),
    });
  };

  const handleMoveBackupUrl = (index: number, direction: "up" | "down") => {
    const newUrls = [...formData.backupUrls];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newUrls.length) return;
    [newUrls[index], newUrls[newIndex]] = [newUrls[newIndex], newUrls[index]];
    setFormData({ ...formData, backupUrls: newUrls });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newUrls = [...formData.backupUrls];
    const [draggedItem] = newUrls.splice(draggedIndex, 1);
    newUrls.splice(dropIndex, 0, draggedItem);
    setFormData({ ...formData, backupUrls: newUrls });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleTestStream = async () => {
    if (!formData.sourceUrl) {
      toast({
        title: "Error",
        description: "Please enter a source URL to test",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await testStream.mutateAsync(formData.sourceUrl);
      toast({
        title: result.success ? "Stream is working" : "Stream test failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({
        title: "Test failed",
        description: "Unable to test the stream",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({
        title: "Error",
        description: "Please enter a stream name",
        variant: "destructive",
      });
      return;
    }

    if (!formData.sourceUrl) {
      toast({
        title: "Error",
        description: "Please enter a source URL",
        variant: "destructive",
      });
      return;
    }

    try {
      // Update basic stream data first
      await updateStream.mutateAsync({
        id: streamId,
        data: {
          name: formData.name,
          sourceUrl: formData.sourceUrl,
          backupUrls: formData.backupUrls,
          customUserAgent: formData.customUserAgent || undefined,
          analyzeDuration: formData.analyzeDuration,
          probeSize: formData.probeSize,
          categoryId: formData.categoryId,
          logoUrl: formData.logoUrl || undefined,
          epgChannelId: formData.epgChannelId || undefined,
          isActive: formData.isActive,
          serverIds: formData.serverIds,
          originServerId: formData.originServerId,
          childServerIds: formData.childServerIds,
          transcodeProfileId: formData.transcodeProfileId || undefined,
          transcodeServerId: formData.transcodeServerId || undefined,
          abrProfileId: formData.abrProfileId || undefined,
          bouquetIds: formData.bouquetIds,
        },
      });

      // If origin server is configured, update cascade distribution
      // Always send the cascade config when origin is set (even if empty cascade means just origin server)
      if (formData.originServerId) {
        try {
          await api.put(`/admin/streams/${streamId}/distribution/cascade`, {
            originServerId: formData.originServerId,
            cascade: formData.cascadeConfig.map(c => ({
              serverId: c.serverId,
              pullFromServerId: c.pullFromServerId,
            })),
          });
          console.log('Cascade distribution updated:', {
            originServerId: formData.originServerId,
            cascade: formData.cascadeConfig,
          });
        } catch (cascadeError: any) {
          console.error('Failed to update cascade distribution:', cascadeError);
          toast({
            title: "Warning",
            description: "Stream updated but cascade distribution failed: " + (cascadeError.message || "Unknown error"),
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Stream updated",
        description: `${formData.name} has been updated successfully.`,
      });

      router.push(`/admin/streams/${streamId}`);
    } catch {
      toast({
        title: "Error",
        description: "Failed to update stream.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Stream Not Found</h2>
        <p className="text-muted-foreground">
          The stream you are looking for does not exist.
        </p>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const Icon = streamTypeIcons[stream.streamType as keyof typeof streamTypeIcons] || Tv;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <StreamLogoContainer className="h-12 w-12">
              <StreamLogo 
                logoUrl={stream.logoUrl} 
                alt={stream.name}
                className="h-10 w-10 object-contain"
              />
            </StreamLogoContainer>
            <div>
              <h1 className="text-2xl font-bold">Edit Stream</h1>
              <p className="text-muted-foreground">
                Editing {stream.name}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateStream.isPending || !formData.name || !formData.sourceUrl}
          >
            {updateStream.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-2 space-y-6"
        >
          {/* Basic Info */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
              <CardDescription>
                Update the stream name and source URL
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Stream Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter stream name"
                  className="bg-zinc-800/50 border-zinc-700"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sourceUrl">Primary Source URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="sourceUrl"
                    value={formData.sourceUrl}
                    onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                    placeholder="http://example.com/stream.m3u8"
                    className="flex-1 bg-zinc-800/50 border-zinc-700"
                  />
                  <Button
                    variant="outline"
                    onClick={handleTestStream}
                    disabled={testStream.isPending || !formData.sourceUrl}
                  >
                    {testStream.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="customUserAgent">Custom User-Agent (optional)</Label>
                <Input
                  id="customUserAgent"
                  value={formData.customUserAgent}
                  onChange={(e) => setFormData({ ...formData, customUserAgent: e.target.value })}
                  placeholder="VLC/3.0.18 or Mozilla/5.0 ..."
                  className="bg-zinc-800/50 border-zinc-700 font-mono text-sm"
                />
                <p className="text-xs text-zinc-500">Override the User-Agent header when fetching the source stream</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="analyzeDuration">Analyze Duration (µs)</Label>
                  <Input
                    id="analyzeDuration"
                    type="number"
                    value={formData.analyzeDuration ?? ""}
                    onChange={(e) => setFormData({ ...formData, analyzeDuration: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="500000 (default)"
                    className="bg-zinc-800/50 border-zinc-700 font-mono text-sm"
                  />
                  <p className="text-xs text-zinc-500">FFmpeg stream analysis duration. Lower = faster start, higher = more reliable</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="probeSize">Probe Size (bytes)</Label>
                  <Input
                    id="probeSize"
                    type="number"
                    value={formData.probeSize ?? ""}
                    onChange={(e) => setFormData({ ...formData, probeSize: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="1000000 (default)"
                    className="bg-zinc-800/50 border-zinc-700 font-mono text-sm"
                  />
                  <p className="text-xs text-zinc-500">FFmpeg probe buffer size. Lower = faster start, higher = more reliable</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="streamType">Stream Type</Label>
                  <Select value={formData.streamType} disabled>
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LIVE">
                        <div className="flex items-center gap-2">
                          <Tv className="h-4 w-4" />
                          Live TV
                        </div>
                      </SelectItem>
                      <SelectItem value="VOD">
                        <div className="flex items-center gap-2">
                          <Film className="h-4 w-4" />
                          VOD
                        </div>
                      </SelectItem>
                      <SelectItem value="RADIO">
                        <div className="flex items-center gap-2">
                          <Radio className="h-4 w-4" />
                          Radio
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500">Stream type cannot be changed</p>
                </div>
              </div>

              {/* Country and Category Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="country" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Country
                  </Label>
                  <Select
                    value={selectedCountry || "all"}
                    onValueChange={(v) => {
                      const newCountry = v === "all" ? null : v;
                      setSelectedCountry(newCountry);
                      // Reset category when country changes (unless switching to "all")
                      if (newCountry !== null) {
                        // Check if current category belongs to new country
                        const currentCat = categories?.find(c => c.id === formData.categoryId);
                        const belongsToNewCountry = currentCat && (
                          currentCat.countryCode === newCountry ||
                          categories?.find(c => c.id === currentCat.parentId)?.countryCode === newCountry
                        );
                        if (!belongsToNewCountry) {
                          setFormData({ ...formData, categoryId: 0 });
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-zinc-400" />
                          All Countries
                        </div>
                      </SelectItem>
                      {countries.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          <div className="flex items-center gap-2">
                            {country.flagSvgUrl ? (
                              <img 
                                src={country.flagSvgUrl} 
                                alt={country.code}
                                className="h-4 w-5 object-cover rounded-sm"
                              />
                            ) : (
                              <Globe className="h-4 w-4 text-zinc-400" />
                            )}
                            {country.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="categoryId">Category</Label>
                  <Select
                    value={formData.categoryId ? formData.categoryId.toString() : ""}
                    onValueChange={(v) => setFormData({ ...formData, categoryId: parseInt(v) })}
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCategories.length === 0 ? (
                        <div className="py-2 px-2 text-sm text-muted-foreground">
                          No categories available
                        </div>
                      ) : (
                        filteredCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>
                            <div className="flex items-center gap-2">
                              {cat.flagSvgUrl && (
                                <img 
                                  src={cat.flagSvgUrl} 
                                  alt=""
                                  className="h-3 w-4 object-cover rounded-sm"
                                />
                              )}
                              {cat.name}
                              <span className="text-zinc-500 text-xs ml-1">
                                ({cat._count.streams})
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="logoUrl" className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Logo URL (optional)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="logoUrl"
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    className="bg-zinc-800/50 border-zinc-700 flex-1"
                  />
                  <LogoFetcherButton
                    channelName={formData.name}
                    streamId={streamId}
                    onLogoSelected={(url) => setFormData({ ...formData, logoUrl: url })}
                    disabled={!formData.name || formData.name.length < 2}
                  />
                </div>
              </div>

              {/* EPG Channel Assignment (only for LIVE/RADIO) */}
              {(formData.streamType === "LIVE" || formData.streamType === "RADIO") && (
                <div className="grid gap-2">
                  <EpgSelector
                    value={formData.epgChannelId}
                    onChange={(value) => setFormData({ ...formData, epgChannelId: value })}
                    label="EPG Channel (optional)"
                    description="Link an EPG channel to display program guide information"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Backup Sources */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-500" />
                Backup Sources (Failover)
              </CardTitle>
              <CardDescription>
                Add backup URLs for automatic failover when the primary source fails.
                Drag to reorder priority (first = highest priority).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* List of existing backup URLs */}
              {formData.backupUrls.length > 0 && (
                <div className="space-y-2">
                  {formData.backupUrls.map((url, index) => (
                    <div
                      key={`backup-${index}-${url}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 rounded-lg p-3 transition-all cursor-move
                        ${draggedIndex === index ? "opacity-50 bg-zinc-800" : "bg-zinc-800/50"}
                        ${dragOverIndex === index && draggedIndex !== index ? "border-2 border-primary border-dashed" : "border border-zinc-700"}
                        hover:bg-zinc-800
                      `}
                    >
                      <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-zinc-700 rounded">
                        <GripVertical className="h-4 w-4 text-zinc-500" />
                      </div>

                      <Badge
                        variant={index === 0 ? "default" : "secondary"}
                        className="text-xs min-w-[24px] justify-center"
                      >
                        {index + 1}
                      </Badge>

                      <span className="text-sm truncate flex-1 px-2 text-zinc-300" title={url}>
                        {url}
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleMoveBackupUrl(index, "up")}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleMoveBackupUrl(index, "down")}
                          disabled={index === formData.backupUrls.length - 1}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveBackupUrl(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new backup URL */}
              <div className="flex gap-2">
                <Input
                  placeholder="http://backup.example.com/stream.m3u8"
                  value={newBackupUrl}
                  onChange={(e) => setNewBackupUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddBackupUrl();
                    }
                  }}
                  className="bg-zinc-800/50 border-zinc-700"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddBackupUrl}
                  disabled={!newBackupUrl}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {formData.backupUrls.length > 0 && (
                <p className="text-xs text-green-500">
                  ✓ {formData.backupUrls.length} backup source(s) configured for failover
                </p>
              )}
            </CardContent>
          </Card>

          {/* Transcoding */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-purple-500" />
                Transcoding Settings
              </CardTitle>
              <CardDescription>
                Select a transcoding profile for this stream. Leave empty for passthrough (no transcoding).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={formData.transcodeProfileId?.toString() || "none"}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    transcodeProfileId: v === "none" ? undefined : parseInt(v),
                  })
                }
              >
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                  <SelectValue placeholder="Select profile (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span>No Transcoding (Passthrough)</span>
                    </div>
                  </SelectItem>
                  {transcodingProfiles
                    ?.filter((p: TranscodingProfile) => p.isActive)
                    .map((profile: TranscodingProfile) => (
                      <SelectItem key={profile.id} value={profile.id.toString()}>
                        <div className="flex items-center gap-2">
                          {profile.requiresGpu ? (
                            <Cpu className="h-4 w-4 text-green-500" />
                          ) : profile.encodingMode === "PASSTHROUGH" ? (
                            <Zap className="h-4 w-4 text-yellow-500" />
                          ) : (
                            <Cpu className="h-4 w-4 text-blue-500" />
                          )}
                          <span>{profile.name}</span>
                          {profile.resolutionPreset && profile.resolutionPreset !== "original" && (
                            <Badge variant="outline" className="text-[10px] ml-1">
                              {profile.resolutionPreset}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {formData.transcodeProfileId && (
                <div className="space-y-2">
                  <Label className="text-sm">Transcoding Server</Label>
                  <p className="text-xs text-zinc-500">
                    Select the server where transcoding should run. Leave empty for automatic selection.
                  </p>
                  <Select
                    value={formData.transcodeServerId?.toString() || "auto"}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        transcodeServerId: v === "auto" ? undefined : parseInt(v),
                      })
                    }
                  >
                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                      <SelectValue placeholder="Auto-select server" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        <span className="flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          Auto-select (Load Balanced)
                        </span>
                      </SelectItem>
                      {servers
                        .filter((s) => s.status === "ONLINE")
                        .map((server) => {
                          const selectedProfile = transcodingProfiles?.find(
                            (p: TranscodingProfile) => p.id === formData.transcodeProfileId
                          );
                          const hasGpu = server.hasNvenc || server.hasQsv || server.hasVaapi;
                          const isCompatible = !selectedProfile?.requiresGpu || hasGpu;

                          return (
                            <SelectItem
                              key={server.id}
                              value={server.id.toString()}
                              disabled={!isCompatible}
                            >
                              <div className="flex items-center gap-2">
                                <Server className="h-4 w-4" />
                                <span>{server.name}</span>
                                {hasGpu && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] text-green-500 border-green-500/30"
                                  >
                                    GPU
                                  </Badge>
                                )}
                                {!isCompatible && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] text-red-500 border-red-500/30"
                                  >
                                    No GPU
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ABR Profile (Adaptive Bitrate) */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-cyan-500" />
                Adaptive Bitrate (ABR)
              </CardTitle>
              <CardDescription>
                Enable multi-quality streaming. The player will automatically switch between quality levels based on viewer bandwidth.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={formData.abrProfileId?.toString() || "none"}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    abrProfileId: v === "none" ? undefined : parseInt(v),
                  })
                }
              >
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                  <SelectValue placeholder="Select ABR profile (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span>No ABR (Single Quality)</span>
                    </div>
                  </SelectItem>
                  {abrProfiles?.map((profile: AbrProfile) => {
                    const variants = typeof profile.variants === 'string' 
                      ? JSON.parse(profile.variants) 
                      : profile.variants;
                    const variantNames = variants?.map((v: { name: string }) => v.name).join(', ') || '';
                    
                    return (
                      <SelectItem key={profile.id} value={profile.id.toString()}>
                        <div className="flex items-center gap-2">
                          {profile.requiresGpu ? (
                            <Cpu className="h-4 w-4 text-green-500" />
                          ) : (
                            <Layers className="h-4 w-4 text-cyan-500" />
                          )}
                          <span>{profile.name}</span>
                          {variantNames && (
                            <Badge variant="outline" className="text-[10px] ml-1">
                              {variantNames}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {formData.abrProfileId && (
                <div className="rounded-lg bg-cyan-950/20 border border-cyan-900/30 p-3">
                  <p className="text-xs text-cyan-400">
                    ✓ ABR enabled - viewers will get adaptive quality based on their connection speed
                  </p>
                </div>
              )}

              {!abrProfiles?.length && (
                <p className="text-xs text-zinc-500">
                  No ABR profiles configured. Create ABR profiles in the Transcoding section.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Server Distribution (Origin + Child Servers) */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-500" />
                Server Distribution
              </CardTitle>
              <CardDescription>
                Configure server distribution to optimize bandwidth. Select an origin server that pulls from the external source, 
                then add child servers that pull from the origin instead of the internet. This reduces external bandwidth usage and costs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {servers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-zinc-500">
                  <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No servers available</p>
                  <p className="text-xs">Add servers in the Servers section first</p>
                </div>
              ) : (
                <ServerHierarchySelector
                  servers={servers}
                  originServerId={formData.originServerId}
                  childServerIds={formData.childServerIds}
                  cascadeConfig={formData.cascadeConfig}
                  onOriginChange={(serverId) => 
                    setFormData(prev => ({ ...prev, originServerId: serverId }))
                  }
                  onChildrenChange={(serverIds) => 
                    setFormData(prev => ({ ...prev, childServerIds: serverIds }))
                  }
                  onCascadeChange={(cascade) => 
                    setFormData(prev => ({ ...prev, cascadeConfig: cascade }))
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Bouquet Assignment */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-500" />
                Bouquet Assignment
              </CardTitle>
              <CardDescription>
                Select which bouquets (channel packages) should include this stream.
                Users subscribed to these bouquets will have access to this content.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BouquetTreeSelect
                bouquets={bouquets}
                selectedIds={formData.bouquetIds}
                onSelectionChange={(ids) => setFormData({ ...formData, bouquetIds: ids })}
              />

              {formData.bouquetIds.length > 0 && (
                <p className="text-xs text-purple-500 mt-3">
                  ✓ {formData.bouquetIds.length} bouquet(s) selected for this stream
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Preview */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-video bg-zinc-800 rounded-lg flex items-center justify-center overflow-hidden">
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt="Stream logo"
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="text-center text-zinc-500">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No logo set</p>
                  </div>
                )}
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Name</span>
                  <span className="font-medium">{formData.name || "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Type</span>
                  <Badge variant="outline">{formData.streamType}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Backups</span>
                  <span>{formData.backupUrls.length} configured</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Servers</span>
                  <span>{formData.serverIds.length || "Auto"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">ABR</span>
                  <span>{formData.abrProfileId ? "Enabled" : "Off"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">EPG</span>
                  <span className={formData.epgChannelId ? "text-green-400" : ""}>
                    {formData.epgChannelId || "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Bouquets</span>
                  <span>{formData.bouquetIds.length || "None"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Toggle */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="isActive" className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    Stream Active
                  </Label>
                  <p className="text-xs text-zinc-500">
                    Enable or disable this stream
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Always-On Toggle (only for LIVE streams) */}
          {formData.streamType === "LIVE" && (
            <Card className="bg-gradient-to-br from-emerald-950/30 to-zinc-950 border-emerald-900/30">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="alwaysOn" className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-500" />
                      Always-On (24/7)
                    </Label>
                    <p className="text-xs text-zinc-500">
                      Keep this stream running continuously for instant playback.
                    </p>
                  </div>
                  <Switch
                    id="alwaysOn"
                    checked={formData.alwaysOn}
                    onCheckedChange={(checked) => setFormData({ ...formData, alwaysOn: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleTestStream}
                disabled={testStream.isPending || !formData.sourceUrl}
              >
                {testStream.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Test Source URL
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/admin/streams/${streamId}`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                View Stream Details
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

