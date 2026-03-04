"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Cpu,
  Gpu,
  Monitor,
  Zap,
  Settings2,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Code,
  Server,
  Activity,
  Film,
  Music,
  Layers,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import {
  useTranscodingProfiles,
  useCreateTranscodingProfile,
  useUpdateTranscodingProfile,
  useDeleteTranscodingProfile,
  useDuplicateTranscodingProfile,
  useSeedDefaultProfiles,
  useFfmpegPreview,
  useAbrProfiles,
  useCreateAbrProfile,
  useUpdateAbrProfile,
  useDeleteAbrProfile,
  useDuplicateAbrProfile,
  useSeedDefaultAbrProfiles,
  VIDEO_CODECS,
  AUDIO_CODECS,
  VIDEO_PRESETS,
  NVENC_PRESETS,
  NVENC_RC_MODES,
  RESOLUTION_PRESETS,
  BITRATE_PRESETS,
  AUDIO_BITRATE_PRESETS,
  ENCODING_MODES,
} from "@/lib/api/hooks/useTranscoding";
import type { TranscodingProfile, EncodingMode, AbrProfile, AbrVariant } from "@/types";

const defaultProfile: Partial<TranscodingProfile> = {
  name: "",
  description: "",
  encodingMode: "SOFTWARE",
  videoCodec: "h264",
  videoPreset: "medium",
  videoBitrateMode: "cbr",
  videoBitrate: 4000,
  resolutionPreset: "original",
  scalingAlgorithm: "lanczos",
  frameRateMode: "cfr",
  gopSize: 60,
  bFrames: 2,
  audioCodec: "aac",
  audioBitrate: 128,
  audioSampleRate: 48000,
  audioChannels: 2,
  nvencEnabled: false,
  nvencPreset: "p4",
  nvencRcMode: "cbr",
  qsvEnabled: false,
  vaapiEnabled: false,
  isDefault: false,
  isActive: true,
  requiresGpu: false,
  estimatedCpuLoad: 50,
};

const defaultAbrVariants: AbrVariant[] = [
  { name: "1080p", width: 1920, height: 1080, videoBitrate: 5000, audioBitrate: 192, maxBitrate: 6000 },
  { name: "720p", width: 1280, height: 720, videoBitrate: 3000, audioBitrate: 128, maxBitrate: 3500 },
  { name: "480p", width: 854, height: 480, videoBitrate: 1500, audioBitrate: 96, maxBitrate: 1800 },
];

// Helper to safely parse variants (may be JSON string or array)
const parseVariants = (variants: unknown): AbrVariant[] => {
  if (!variants) return [];
  if (Array.isArray(variants)) return variants;
  if (typeof variants === 'string') {
    try {
      const parsed = JSON.parse(variants);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const defaultAbrProfile: Partial<AbrProfile> = {
  name: "",
  description: "",
  encodingMode: "SOFTWARE",
  variants: defaultAbrVariants,
  audioCodec: "aac",
  audioSampleRate: 48000,
  audioChannels: 2,
  videoCodec: "h264",
  videoPreset: "fast",
  gopSize: 60,
  bFrames: 2,
  frameRateMode: "cfr",
  hlsSegmentDuration: 4,
  hlsPlaylistSize: 5,
  hlsDeleteThreshold: 1,
  nvencEnabled: false,
  nvencPreset: "p4",
  qsvEnabled: false,
  vaapiEnabled: false,
  isDefault: false,
  isActive: true,
  requiresGpu: false,
  estimatedCpuLoad: 100,
};

function EncodingModeIcon({ mode }: { mode: EncodingMode }) {
  switch (mode) {
    case "PASSTHROUGH":
      return <Zap className="h-4 w-4 text-yellow-400" />;
    case "NVENC":
      return <Gpu className="h-4 w-4 text-green-400" />;
    case "QSV":
      return <Cpu className="h-4 w-4 text-blue-400" />;
    case "VAAPI":
      return <Monitor className="h-4 w-4 text-purple-400" />;
    default:
      return <Cpu className="h-4 w-4 text-zinc-400" />;
  }
}

function ProfileForm({
  profile,
  onSave,
  onCancel,
  isLoading,
}: {
  profile: Partial<TranscodingProfile>;
  onSave: (data: Partial<TranscodingProfile>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<Partial<TranscodingProfile>>(profile);
  const [activeTab, setActiveTab] = useState("general");

  const { data: ffmpegCommand } = useFfmpegPreview(
    formData.id,
    "rtmp://source.example.com/live/stream"
  );

  const updateField = <K extends keyof TranscodingProfile>(
    field: K,
    value: TranscodingProfile[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEncodingModeChange = (mode: EncodingMode) => {
    const updates: Partial<TranscodingProfile> = { encodingMode: mode };
    
    if (mode === "PASSTHROUGH") {
      updates.videoCodec = "copy";
      updates.audioCodec = "copy";
      updates.requiresGpu = false;
      updates.estimatedCpuLoad = 5;
    } else if (mode === "NVENC") {
      updates.nvencEnabled = true;
      updates.qsvEnabled = false;
      updates.vaapiEnabled = false;
      updates.requiresGpu = true;
      updates.estimatedCpuLoad = 10;
      updates.videoCodec = "h264";
    } else if (mode === "QSV") {
      updates.nvencEnabled = false;
      updates.qsvEnabled = true;
      updates.vaapiEnabled = false;
      updates.requiresGpu = true;
      updates.estimatedCpuLoad = 15;
    } else if (mode === "VAAPI") {
      updates.nvencEnabled = false;
      updates.qsvEnabled = false;
      updates.vaapiEnabled = true;
      updates.requiresGpu = true;
      updates.estimatedCpuLoad = 15;
    } else {
      updates.nvencEnabled = false;
      updates.qsvEnabled = false;
      updates.vaapiEnabled = false;
      updates.requiresGpu = false;
      updates.estimatedCpuLoad = 60;
    }
    
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 bg-zinc-800/50">
          <TabsTrigger value="general" className="gap-2">
            <Settings2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-2">
            <Film className="h-4 w-4" />
            Video
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-2">
            <Music className="h-4 w-4" />
            Audio
          </TabsTrigger>
          <TabsTrigger value="hardware" className="gap-2">
            <Gpu className="h-4 w-4" />
            Hardware
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            <Code className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Profile Name *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g., H.264 1080p High Quality"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="encodingMode">Encoding Mode *</Label>
              <Select
                value={formData.encodingMode}
                onValueChange={(v) => handleEncodingModeChange(v as EncodingMode)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENCODING_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <div className="flex items-center gap-2">
                        <span>{mode.icon}</span>
                        <span>{mode.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Describe this profile's purpose..."
              className="bg-zinc-800 border-zinc-700 resize-none"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
            <div>
              <p className="font-medium">Default Profile</p>
              <p className="text-sm text-zinc-400">
                Use this profile for new streams by default
              </p>
            </div>
            <Switch
              checked={formData.isDefault || false}
              onCheckedChange={(v) => updateField("isDefault", v)}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
            <div>
              <p className="font-medium">Active</p>
              <p className="text-sm text-zinc-400">
                Enable this profile for use
              </p>
            </div>
            <Switch
              checked={formData.isActive !== false}
              onCheckedChange={(v) => updateField("isActive", v)}
            />
          </div>
        </TabsContent>

        <TabsContent value="video" className="space-y-4 mt-4">
          {formData.encodingMode !== "PASSTHROUGH" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Video Codec</Label>
                  <Select
                    value={formData.videoCodec}
                    onValueChange={(v) => updateField("videoCodec", v)}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIDEO_CODECS.filter((c) => c.value !== "copy").map((codec) => (
                        <SelectItem key={codec.value} value={codec.value}>
                          {codec.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select
                    value={formData.resolutionPreset || "original"}
                    onValueChange={(v) => {
                      updateField("resolutionPreset", v as any);
                      const presets: Record<string, { w?: number; h?: number }> = {
                        "480p": { w: 854, h: 480 },
                        "720p": { w: 1280, h: 720 },
                        "1080p": { w: 1920, h: 1080 },
                        "4k": { w: 3840, h: 2160 },
                        original: {},
                      };
                      const preset = presets[v];
                      if (preset) {
                        updateField("resolutionWidth", preset.w);
                        updateField("resolutionHeight", preset.h);
                      }
                    }}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTION_PRESETS.map((res) => (
                        <SelectItem key={res.value} value={res.value}>
                          {res.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bitrate Mode</Label>
                  <Select
                    value={formData.videoBitrateMode}
                    onValueChange={(v) => updateField("videoBitrateMode", v as any)}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cbr">CBR (Constant Bitrate)</SelectItem>
                      <SelectItem value="vbr">VBR (Variable Bitrate)</SelectItem>
                      <SelectItem value="crf">CRF (Quality-based)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.videoBitrateMode === "crf" ? (
                  <div className="space-y-2">
                    <Label>CRF Value ({formData.crfValue || 23})</Label>
                    <Slider
                      value={[formData.crfValue || 23]}
                      min={0}
                      max={51}
                      step={1}
                      onValueChange={([v]) => updateField("crfValue", v)}
                      className="mt-2"
                    />
                    <p className="text-xs text-zinc-500">
                      Lower = better quality, larger file. 18-28 recommended.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Video Bitrate</Label>
                    <Select
                      value={String(formData.videoBitrate || 4000)}
                      onValueChange={(v) => updateField("videoBitrate", parseInt(v))}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BITRATE_PRESETS.map((br) => (
                          <SelectItem key={br.value} value={String(br.value)}>
                            {br.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {formData.encodingMode === "SOFTWARE" && (
                <div className="space-y-2">
                  <Label>Encoder Preset</Label>
                  <Select
                    value={formData.videoPreset}
                    onValueChange={(v) => updateField("videoPreset", v)}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIDEO_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>GOP Size (Keyframe Interval)</Label>
                  <Input
                    type="number"
                    value={formData.gopSize || 60}
                    onChange={(e) => updateField("gopSize", parseInt(e.target.value) || 60)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-zinc-500">
                    Frames between keyframes. 60 = 2 sec at 30fps
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>B-Frames</Label>
                  <Input
                    type="number"
                    value={formData.bFrames || 2}
                    min={0}
                    max={16}
                    onChange={(e) => updateField("bFrames", parseInt(e.target.value) || 0)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-zinc-500">
                    0-16. More = better compression, higher latency
                  </p>
                </div>
              </div>
            </>
          )}

          {formData.encodingMode === "PASSTHROUGH" && (
            <div className="flex items-center justify-center p-8 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="text-center">
                <Zap className="h-12 w-12 mx-auto text-yellow-400 mb-4" />
                <h3 className="text-lg font-medium">Passthrough Mode</h3>
                <p className="text-sm text-zinc-400 mt-2">
                  Video will be copied without re-encoding.
                  <br />
                  No video settings are available in this mode.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audio" className="space-y-4 mt-4">
          {formData.encodingMode !== "PASSTHROUGH" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Audio Codec</Label>
                  <Select
                    value={formData.audioCodec}
                    onValueChange={(v) => updateField("audioCodec", v)}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIO_CODECS.map((codec) => (
                        <SelectItem key={codec.value} value={codec.value}>
                          {codec.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Audio Bitrate</Label>
                  <Select
                    value={String(formData.audioBitrate || 128)}
                    onValueChange={(v) => updateField("audioBitrate", parseInt(v))}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIO_BITRATE_PRESETS.map((br) => (
                        <SelectItem key={br.value} value={String(br.value)}>
                          {br.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sample Rate</Label>
                  <Select
                    value={String(formData.audioSampleRate || 48000)}
                    onValueChange={(v) => updateField("audioSampleRate", parseInt(v))}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="44100">44.1 kHz</SelectItem>
                      <SelectItem value="48000">48 kHz</SelectItem>
                      <SelectItem value="96000">96 kHz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Channels</Label>
                  <Select
                    value={String(formData.audioChannels || 2)}
                    onValueChange={(v) => updateField("audioChannels", parseInt(v))}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Mono (1)</SelectItem>
                      <SelectItem value="2">Stereo (2)</SelectItem>
                      <SelectItem value="6">5.1 Surround (6)</SelectItem>
                      <SelectItem value="8">7.1 Surround (8)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {formData.encodingMode === "PASSTHROUGH" && (
            <div className="flex items-center justify-center p-8 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="text-center">
                <Zap className="h-12 w-12 mx-auto text-yellow-400 mb-4" />
                <h3 className="text-lg font-medium">Passthrough Mode</h3>
                <p className="text-sm text-zinc-400 mt-2">
                  Audio will be copied without re-encoding.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="hardware" className="space-y-4 mt-4">
          {formData.encodingMode === "NVENC" && (
            <>
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gpu className="h-5 w-5 text-green-400" />
                  <h3 className="font-medium text-green-400">NVIDIA NVENC Settings</h3>
                </div>
                <p className="text-sm text-zinc-400">
                  Configure NVIDIA GPU hardware encoding options.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>NVENC Preset</Label>
                  <Select
                    value={formData.nvencPreset || "p4"}
                    onValueChange={(v) => updateField("nvencPreset", v)}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NVENC_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Rate Control Mode</Label>
                  <Select
                    value={formData.nvencRcMode || "cbr"}
                    onValueChange={(v) => updateField("nvencRcMode", v)}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NVENC_RC_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tuning</Label>
                  <Select
                    value={formData.nvencTuning || "hq"}
                    onValueChange={(v) => updateField("nvencTuning", v)}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hq">High Quality</SelectItem>
                      <SelectItem value="ll">Low Latency</SelectItem>
                      <SelectItem value="ull">Ultra Low Latency</SelectItem>
                      <SelectItem value="lossless">Lossless</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Lookahead Frames</Label>
                  <Input
                    type="number"
                    value={formData.nvencLookahead || 0}
                    min={0}
                    max={32}
                    onChange={(e) => updateField("nvencLookahead", parseInt(e.target.value) || 0)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            </>
          )}

          {formData.encodingMode === "QSV" && (
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-5 w-5 text-blue-400" />
                <h3 className="font-medium text-blue-400">Intel Quick Sync Settings</h3>
              </div>
              <p className="text-sm text-zinc-400">
                Intel Quick Sync hardware encoding is enabled.
              </p>
            </div>
          )}

          {formData.encodingMode === "VAAPI" && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Monitor className="h-5 w-5 text-purple-400" />
                  <h3 className="font-medium text-purple-400">VA-API Settings</h3>
                </div>
                <p className="text-sm text-zinc-400">
                  Linux VA-API hardware encoding is enabled.
                </p>
              </div>

              <div className="space-y-2">
                <Label>VA-API Device</Label>
                <Input
                  value={formData.vaapiDevice || "/dev/dri/renderD128"}
                  onChange={(e) => updateField("vaapiDevice", e.target.value)}
                  placeholder="/dev/dri/renderD128"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
          )}

          {(formData.encodingMode === "SOFTWARE" || formData.encodingMode === "PASSTHROUGH") && (
            <div className="flex items-center justify-center p-8 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="text-center">
                <Cpu className="h-12 w-12 mx-auto text-zinc-400 mb-4" />
                <h3 className="text-lg font-medium">
                  {formData.encodingMode === "PASSTHROUGH"
                    ? "No Hardware Acceleration"
                    : "CPU Encoding Mode"}
                </h3>
                <p className="text-sm text-zinc-400 mt-2">
                  {formData.encodingMode === "PASSTHROUGH"
                    ? "Passthrough mode doesn't use hardware encoding."
                    : "Software encoding uses CPU. Select NVENC, QSV, or VA-API for hardware acceleration."}
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Custom User-Agent</Label>
            <Input
              value={formData.customUserAgent || ""}
              onChange={(e) => updateField("customUserAgent", e.target.value)}
              placeholder="VLC/3.0.18 or Mozilla/5.0 ..."
              className="bg-zinc-800 border-zinc-700 font-mono text-sm"
            />
            <p className="text-xs text-zinc-500">
              Override the User-Agent header when fetching source streams using this profile
            </p>
          </div>

          <div className="space-y-2">
            <Label>Additional FFmpeg Parameters</Label>
            <Textarea
              value={formData.additionalParams || ""}
              onChange={(e) => updateField("additionalParams", e.target.value)}
              placeholder="-threads 4 -tune zerolatency"
              className="bg-zinc-800 border-zinc-700 font-mono text-sm resize-none"
              rows={3}
            />
            <p className="text-xs text-zinc-500">
              Custom FFmpeg parameters to append to the command
            </p>
          </div>

          <div className="space-y-2">
            <Label>Estimated CPU Load (%)</Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.estimatedCpuLoad || 50]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => updateField("estimatedCpuLoad", v)}
                className="flex-1"
              />
              <span className="text-sm font-mono w-12 text-right">
                {formData.estimatedCpuLoad || 50}%
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Estimated CPU usage for load balancing calculations
            </p>
          </div>

          {formData.id && ffmpegCommand && (
            <div className="space-y-2">
              <Label>Generated FFmpeg Command</Label>
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-700 font-mono text-xs text-zinc-300 overflow-x-auto">
                {ffmpegCommand}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(formData)}
          disabled={isLoading || !formData.name}
        >
          {isLoading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {formData.id ? "Update Profile" : "Create Profile"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================
// ABR PROFILE FORM
// ============================================

function AbrProfileForm({
  profile,
  onSave,
  onCancel,
  isLoading,
}: {
  profile: Partial<AbrProfile>;
  onSave: (data: Partial<AbrProfile>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<Partial<AbrProfile>>(() => {
    // Parse variants if string
    const variants = typeof profile.variants === 'string' 
      ? JSON.parse(profile.variants) 
      : profile.variants || defaultAbrVariants;
    return { ...profile, variants };
  });
  const [activeTab, setActiveTab] = useState("general");

  const variants = (formData.variants as AbrVariant[]) || [];

  const updateField = <K extends keyof AbrProfile>(
    field: K,
    value: AbrProfile[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateVariant = (index: number, field: keyof AbrVariant, value: number | string) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData((prev) => ({ ...prev, variants: newVariants }));
  };

  const addVariant = () => {
    const newVariants = [...variants, { name: "360p", width: 640, height: 360, videoBitrate: 800, audioBitrate: 64, maxBitrate: 1000 }];
    setFormData((prev) => ({ ...prev, variants: newVariants }));
  };

  const removeVariant = (index: number) => {
    const newVariants = variants.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, variants: newVariants }));
  };

  const handleEncodingModeChange = (mode: EncodingMode) => {
    const updates: Partial<AbrProfile> = { encodingMode: mode };
    
    if (mode === "NVENC") {
      updates.nvencEnabled = true;
      updates.qsvEnabled = false;
      updates.vaapiEnabled = false;
      updates.requiresGpu = true;
      updates.estimatedCpuLoad = 30;
    } else if (mode === "QSV") {
      updates.nvencEnabled = false;
      updates.qsvEnabled = true;
      updates.vaapiEnabled = false;
      updates.requiresGpu = true;
      updates.estimatedCpuLoad = 40;
    } else if (mode === "VAAPI") {
      updates.nvencEnabled = false;
      updates.qsvEnabled = false;
      updates.vaapiEnabled = true;
      updates.requiresGpu = true;
      updates.estimatedCpuLoad = 40;
    } else {
      updates.nvencEnabled = false;
      updates.qsvEnabled = false;
      updates.vaapiEnabled = false;
      updates.requiresGpu = false;
      updates.estimatedCpuLoad = 120;
    }
    
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 bg-zinc-800/50">
          <TabsTrigger value="general" className="gap-2">
            <Settings2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="variants" className="gap-2">
            <Layers className="h-4 w-4" />
            Variants
          </TabsTrigger>
          <TabsTrigger value="encoding" className="gap-2">
            <Film className="h-4 w-4" />
            Encoding
          </TabsTrigger>
          <TabsTrigger value="hls" className="gap-2">
            <Play className="h-4 w-4" />
            HLS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="abr-name">Profile Name *</Label>
              <Input
                id="abr-name"
                value={formData.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g., Standard ABR Profile"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Encoding Mode *</Label>
              <Select
                value={formData.encodingMode}
                onValueChange={(v) => handleEncodingModeChange(v as EncodingMode)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENCODING_MODES.filter(m => m.value !== "PASSTHROUGH").map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <div className="flex items-center gap-2">
                        <span>{mode.icon}</span>
                        <span>{mode.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Describe this ABR profile's purpose..."
              className="bg-zinc-800 border-zinc-700 resize-none"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div>
                <p className="font-medium">Default Profile</p>
                <p className="text-sm text-zinc-400">Use as default for new ABR streams</p>
              </div>
              <Switch
                checked={formData.isDefault || false}
                onCheckedChange={(v) => updateField("isDefault", v)}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div>
                <p className="font-medium">Active</p>
                <p className="text-sm text-zinc-400">Enable this profile</p>
              </div>
              <Switch
                checked={formData.isActive !== false}
                onCheckedChange={(v) => updateField("isActive", v)}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="variants" className="space-y-4 mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-medium">Quality Variants</h3>
              <p className="text-sm text-zinc-400">Define the quality levels for adaptive streaming</p>
            </div>
            <Button variant="outline" size="sm" onClick={addVariant}>
              <Plus className="h-4 w-4 mr-2" />
              Add Variant
            </Button>
          </div>

          <div className="space-y-3">
            {variants.map((variant, index) => (
              <Card key={index} className="bg-zinc-800/50 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="text-sm">
                      {variant.name || `Variant ${index + 1}`}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeVariant(index)}
                      disabled={variants.length <= 1}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={variant.name}
                        onChange={(e) => updateVariant(index, "name", e.target.value)}
                        className="bg-zinc-900 border-zinc-600 h-8 text-sm"
                        placeholder="720p"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Width</Label>
                      <Input
                        type="number"
                        value={variant.width}
                        onChange={(e) => updateVariant(index, "width", parseInt(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-600 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Height</Label>
                      <Input
                        type="number"
                        value={variant.height}
                        onChange={(e) => updateVariant(index, "height", parseInt(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-600 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Video (kbps)</Label>
                      <Input
                        type="number"
                        value={variant.videoBitrate}
                        onChange={(e) => updateVariant(index, "videoBitrate", parseInt(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-600 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Audio (kbps)</Label>
                      <Input
                        type="number"
                        value={variant.audioBitrate}
                        onChange={(e) => updateVariant(index, "audioBitrate", parseInt(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-600 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max (kbps)</Label>
                      <Input
                        type="number"
                        value={variant.maxBitrate || ""}
                        onChange={(e) => updateVariant(index, "maxBitrate", parseInt(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-600 h-8 text-sm"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="encoding" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Video Codec</Label>
              <Select
                value={formData.videoCodec}
                onValueChange={(v) => updateField("videoCodec", v)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h264">H.264 / AVC</SelectItem>
                  <SelectItem value="h265">H.265 / HEVC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Audio Codec</Label>
              <Select
                value={formData.audioCodec}
                onValueChange={(v) => updateField("audioCodec", v)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aac">AAC</SelectItem>
                  <SelectItem value="mp3">MP3</SelectItem>
                  <SelectItem value="opus">Opus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.encodingMode === "SOFTWARE" && (
            <div className="space-y-2">
              <Label>Encoder Preset</Label>
              <Select
                value={formData.videoPreset}
                onValueChange={(v) => updateField("videoPreset", v)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.encodingMode === "NVENC" && (
            <div className="space-y-2">
              <Label>NVENC Preset</Label>
              <Select
                value={formData.nvencPreset || "p4"}
                onValueChange={(v) => updateField("nvencPreset", v)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NVENC_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>GOP Size</Label>
              <Input
                type="number"
                value={formData.gopSize || 60}
                onChange={(e) => updateField("gopSize", parseInt(e.target.value) || 60)}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>B-Frames</Label>
              <Input
                type="number"
                value={formData.bFrames || 2}
                min={0}
                max={16}
                onChange={(e) => updateField("bFrames", parseInt(e.target.value) || 0)}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Sample Rate</Label>
              <Select
                value={String(formData.audioSampleRate || 48000)}
                onValueChange={(v) => updateField("audioSampleRate", parseInt(v))}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="44100">44.1 kHz</SelectItem>
                  <SelectItem value="48000">48 kHz</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hls" className="space-y-4 mt-4">
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-4">
            <h3 className="font-medium text-blue-400 mb-1">HLS Output Settings</h3>
            <p className="text-sm text-zinc-400">
              Configure HLS segment and playlist settings for adaptive bitrate streaming.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Segment Duration (seconds)</Label>
              <Input
                type="number"
                value={formData.hlsSegmentDuration || 4}
                min={1}
                max={10}
                onChange={(e) => updateField("hlsSegmentDuration", parseInt(e.target.value) || 4)}
                className="bg-zinc-800 border-zinc-700"
              />
              <p className="text-xs text-zinc-500">Lower = less latency, more requests</p>
            </div>
            <div className="space-y-2">
              <Label>Playlist Size</Label>
              <Input
                type="number"
                value={formData.hlsPlaylistSize || 5}
                min={3}
                max={20}
                onChange={(e) => updateField("hlsPlaylistSize", parseInt(e.target.value) || 5)}
                className="bg-zinc-800 border-zinc-700"
              />
              <p className="text-xs text-zinc-500">Number of segments in playlist</p>
            </div>
            <div className="space-y-2">
              <Label>Delete Threshold</Label>
              <Input
                type="number"
                value={formData.hlsDeleteThreshold || 1}
                min={0}
                max={10}
                onChange={(e) => updateField("hlsDeleteThreshold", parseInt(e.target.value) || 1)}
                className="bg-zinc-800 border-zinc-700"
              />
              <p className="text-xs text-zinc-500">Segments to keep after removal</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Estimated CPU Load (%)</Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.estimatedCpuLoad || 100]}
                min={0}
                max={200}
                step={10}
                onValueChange={([v]) => updateField("estimatedCpuLoad", v)}
                className="flex-1"
              />
              <span className="text-sm font-mono w-16 text-right">
                {formData.estimatedCpuLoad || 100}%
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              ABR encoding uses more CPU due to multiple output variants
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(formData)}
          disabled={isLoading || !formData.name || variants.length === 0}
        >
          {isLoading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {formData.id ? "Update ABR Profile" : "Create ABR Profile"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function TranscodingProfilesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"transcoding" | "abr">("transcoding");
  
  // Transcoding Profiles state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Partial<TranscodingProfile> | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateId, setDuplicateId] = useState<number | null>(null);

  // ABR Profiles state
  const [isAbrFormOpen, setIsAbrFormOpen] = useState(false);
  const [editingAbrProfile, setEditingAbrProfile] = useState<Partial<AbrProfile> | null>(null);
  const [deleteAbrId, setDeleteAbrId] = useState<number | null>(null);
  const [duplicateAbrName, setDuplicateAbrName] = useState("");
  const [duplicateAbrId, setDuplicateAbrId] = useState<number | null>(null);

  // Transcoding queries and mutations
  const { data: profiles, isLoading, refetch } = useTranscodingProfiles();
  const createMutation = useCreateTranscodingProfile();
  const updateMutation = useUpdateTranscodingProfile();
  const deleteMutation = useDeleteTranscodingProfile();
  const duplicateMutation = useDuplicateTranscodingProfile();
  const seedMutation = useSeedDefaultProfiles();

  // ABR queries and mutations
  const { data: abrProfiles, isLoading: isAbrLoading } = useAbrProfiles();
  const createAbrMutation = useCreateAbrProfile();
  const updateAbrMutation = useUpdateAbrProfile();
  const deleteAbrMutation = useDeleteAbrProfile();
  const duplicateAbrMutation = useDuplicateAbrProfile();
  const seedAbrMutation = useSeedDefaultAbrProfiles();

  const handleCreate = () => {
    setEditingProfile({ ...defaultProfile });
    setIsFormOpen(true);
  };

  const handleEdit = (profile: TranscodingProfile) => {
    setEditingProfile(profile);
    setIsFormOpen(true);
  };

  const handleSave = async (data: Partial<TranscodingProfile>) => {
    try {
      if (data.id) {
        await updateMutation.mutateAsync({ id: data.id, ...data });
        toast({ title: "Profile updated successfully" });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Profile created successfully" });
      }
      setIsFormOpen(false);
      setEditingProfile(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to save profile",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast({ title: "Profile deleted successfully" });
      setDeleteId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to delete profile",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateId) return;
    try {
      await duplicateMutation.mutateAsync({ id: duplicateId, name: duplicateName });
      toast({ title: "Profile duplicated successfully" });
      setDuplicateId(null);
      setDuplicateName("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to duplicate profile",
        variant: "destructive",
      });
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const result = await seedMutation.mutateAsync();
      toast({ title: result.message });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to seed profiles",
        variant: "destructive",
      });
    }
  };

  // ABR Profile handlers
  const handleCreateAbr = () => {
    setEditingAbrProfile({ ...defaultAbrProfile });
    setIsAbrFormOpen(true);
  };

  const handleEditAbr = (profile: AbrProfile) => {
    setEditingAbrProfile(profile);
    setIsAbrFormOpen(true);
  };

  const handleSaveAbr = async (data: Partial<AbrProfile>) => {
    try {
      if (data.id) {
        await updateAbrMutation.mutateAsync({ id: data.id, ...data });
        toast({ title: "ABR Profile updated successfully" });
      } else {
        await createAbrMutation.mutateAsync(data);
        toast({ title: "ABR Profile created successfully" });
      }
      setIsAbrFormOpen(false);
      setEditingAbrProfile(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to save ABR profile",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAbr = async () => {
    if (!deleteAbrId) return;
    try {
      await deleteAbrMutation.mutateAsync(deleteAbrId);
      toast({ title: "ABR Profile deleted successfully" });
      setDeleteAbrId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to delete ABR profile",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateAbr = async () => {
    if (!duplicateAbrId) return;
    try {
      await duplicateAbrMutation.mutateAsync({ id: duplicateAbrId, name: duplicateAbrName });
      toast({ title: "ABR Profile duplicated successfully" });
      setDuplicateAbrId(null);
      setDuplicateAbrName("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to duplicate ABR profile",
        variant: "destructive",
      });
    }
  };

  const handleSeedAbrDefaults = async () => {
    try {
      const result = await seedAbrMutation.mutateAsync();
      toast({ title: result.message });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to seed ABR profiles",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Encoding Profiles
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 mt-1">
            Configure transcoding and ABR settings for streams
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "transcoding" | "abr")}>
        <div className="overflow-x-auto">
          <TabsList className="bg-zinc-800/50 border border-zinc-700">
          <TabsTrigger value="transcoding" className="data-[state=active]:bg-zinc-700">
            <Settings2 className="h-4 w-4 mr-2" />
            Transcoding Profiles
          </TabsTrigger>
          <TabsTrigger value="abr" className="data-[state=active]:bg-zinc-700">
            <Layers className="h-4 w-4 mr-2" />
            ABR Profiles
          </TabsTrigger>
        </TabsList>
        </div>

        {/* Transcoding Profiles Tab */}
        <TabsContent value="transcoding" className="mt-6 space-y-6">
          {/* Header Actions */}
          <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={handleSeedDefaults}
              disabled={seedMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              Seed Defaults
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Profile
            </Button>
          </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Layers className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{profiles?.length || 0}</p>
                <p className="text-xs text-zinc-500">Total Profiles</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Gpu className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {profiles?.filter((p: TranscodingProfile) => p.requiresGpu).length || 0}
                </p>
                <p className="text-xs text-zinc-500">GPU Profiles</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Zap className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {profiles?.filter((p: TranscodingProfile) => p.encodingMode === "PASSTHROUGH").length || 0}
                </p>
                <p className="text-xs text-zinc-500">Passthrough</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Activity className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {profiles?.filter((p: TranscodingProfile) => p.isActive).length || 0}
                </p>
                <p className="text-xs text-zinc-500">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profiles Table */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle>All Profiles</CardTitle>
          <CardDescription>
            Manage transcoding profiles for streams
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : profiles?.length === 0 ? (
            <div className="text-center py-12">
              <Settings2 className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Profiles Yet</h3>
              <p className="text-zinc-400 mb-4">
                Create your first transcoding profile or seed the defaults.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleSeedDefaults}>
                  <Download className="h-4 w-4 mr-2" />
                  Seed Defaults
                </Button>
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Profile
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead>Profile</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Video</TableHead>
                  <TableHead>Audio</TableHead>
                  <TableHead>Streams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles?.map((profile: TranscodingProfile) => (
                  <TableRow key={profile.id} className="border-zinc-800">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-800">
                          <EncodingModeIcon mode={profile.encodingMode} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{profile.name}</span>
                            {profile.isDefault && (
                              <Badge variant="outline" className="text-xs">
                                Default
                              </Badge>
                            )}
                          </div>
                          {profile.description && (
                            <p className="text-xs text-zinc-500 truncate max-w-[200px]">
                              {profile.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          profile.encodingMode === "NVENC"
                            ? "border-green-500/30 text-green-400"
                            : profile.encodingMode === "PASSTHROUGH"
                            ? "border-yellow-500/30 text-yellow-400"
                            : profile.encodingMode === "QSV"
                            ? "border-blue-500/30 text-blue-400"
                            : "border-zinc-500/30 text-zinc-400"
                        }
                      >
                        {profile.encodingMode}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-mono">
                          {profile.videoCodec.toUpperCase()}
                        </span>
                        {profile.resolutionPreset && profile.resolutionPreset !== "original" && (
                          <span className="text-zinc-500 ml-1">
                            @ {profile.resolutionPreset}
                          </span>
                        )}
                        {profile.videoBitrate && (
                          <span className="text-zinc-500 ml-1">
                            {profile.videoBitrate / 1000}Mbps
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-mono">
                          {profile.audioCodec.toUpperCase()}
                        </span>
                        <span className="text-zinc-500 ml-1">
                          {profile.audioBitrate}kbps
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {profile.streamCount || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      {profile.isActive ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(profile)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setDuplicateId(profile.id);
                              setDuplicateName(`${profile.name} (Copy)`);
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteId(profile.id)}
                            className="text-red-400"
                            disabled={(profile.streamCount ?? 0) > 0}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {/* ABR Profiles Tab */}
        <TabsContent value="abr" className="mt-6 space-y-6">
          {/* Header Actions */}
          <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={handleSeedAbrDefaults}
              disabled={seedAbrMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              Seed Defaults
            </Button>
            <Button onClick={handleCreateAbr}>
              <Plus className="h-4 w-4 mr-2" />
              New ABR Profile
            </Button>
          </div>

          {/* ABR Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Layers className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{abrProfiles?.length || 0}</p>
                    <p className="text-xs text-zinc-500">Total ABR Profiles</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Activity className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {abrProfiles?.reduce((acc: number, p: AbrProfile) => acc + parseVariants(p.variants).length, 0) || 0}
                    </p>
                    <p className="text-xs text-zinc-500">Total Variants</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Gpu className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {abrProfiles?.filter((p: AbrProfile) => p.videoCodec === "h264_nvenc" || p.videoCodec === "hevc_nvenc").length || 0}
                    </p>
                    <p className="text-xs text-zinc-500">GPU Profiles</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    <Zap className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {abrProfiles?.filter((p: AbrProfile) => p.isActive).length || 0}
                    </p>
                    <p className="text-xs text-zinc-500">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ABR Profiles Table */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle>ABR Profiles</CardTitle>
              <CardDescription>
                Manage Adaptive Bitrate profiles for multi-quality streaming
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isAbrLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : abrProfiles?.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No ABR Profiles Yet</h3>
                  <p className="text-zinc-400 mb-4">
                    Create your first ABR profile or seed the defaults.
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button variant="outline" onClick={handleSeedAbrDefaults}>
                      <Download className="h-4 w-4 mr-2" />
                      Seed Defaults
                    </Button>
                    <Button onClick={handleCreateAbr}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create ABR Profile
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead>Profile</TableHead>
                      <TableHead>Variants</TableHead>
                      <TableHead>Video Codec</TableHead>
                      <TableHead>Audio</TableHead>
                      <TableHead>Streams</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abrProfiles?.map((profile: AbrProfile) => (
                      <TableRow key={profile.id} className="border-zinc-800">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-zinc-800">
                              <Layers className="h-5 w-5 text-purple-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{profile.name}</span>
                                {profile.isDefault && (
                                  <Badge variant="outline" className="text-xs">
                                    Default
                                  </Badge>
                                )}
                              </div>
                              {profile.description && (
                                <p className="text-xs text-zinc-500 truncate max-w-[200px]">
                                  {profile.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {parseVariants(profile.variants).slice(0, 3).map((v: AbrVariant) => (
                              <Badge key={v.name} variant="outline" className="text-xs">
                                {v.height}p
                              </Badge>
                            ))}
                            {parseVariants(profile.variants).length > 3 && (
                              <Badge variant="outline" className="text-xs text-zinc-500">
                                +{parseVariants(profile.variants).length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              profile.videoCodec?.includes("nvenc")
                                ? "border-green-500/30 text-green-400"
                                : profile.videoCodec?.includes("qsv")
                                ? "border-blue-500/30 text-blue-400"
                                : "border-zinc-500/30 text-zinc-400"
                            }
                          >
                            {profile.videoCodec?.toUpperCase() || "libx264"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <span className="font-mono">
                              {profile.audioCodec?.toUpperCase() || "AAC"}
                            </span>
                            <span className="text-zinc-500 ml-1">
                              {(Array.isArray(profile.variants) && profile.variants[0]?.audioBitrate) || 128}kbps
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {profile.streamCount || 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          {profile.isActive ? (
                            <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditAbr(profile)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDuplicateAbrId(profile.id);
                                  setDuplicateAbrName(`${profile.name} (Copy)`);
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteAbrId(profile.id)}
                                className="text-red-400"
                                disabled={(profile.streamCount ?? 0) > 0}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>
              {editingProfile?.id ? "Edit Profile" : "Create New Profile"}
            </DialogTitle>
            <DialogDescription>
              Configure transcoding settings for video and audio encoding.
            </DialogDescription>
          </DialogHeader>
          {editingProfile && (
            <ProfileForm
              profile={editingProfile}
              onSave={handleSave}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingProfile(null);
              }}
              isLoading={createMutation.isPending || updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateId !== null} onOpenChange={() => setDuplicateId(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Duplicate Profile</DialogTitle>
            <DialogDescription>
              Enter a name for the duplicated profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder="New profile name"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!duplicateName || duplicateMutation.isPending}
            >
              {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The profile will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ABR Create/Edit Dialog */}
      <Dialog open={isAbrFormOpen} onOpenChange={setIsAbrFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>
              {editingAbrProfile?.id ? "Edit ABR Profile" : "Create New ABR Profile"}
            </DialogTitle>
            <DialogDescription>
              Configure Adaptive Bitrate streaming settings with multiple quality variants.
            </DialogDescription>
          </DialogHeader>
          {editingAbrProfile && (
            <AbrProfileForm
              profile={editingAbrProfile}
              onSave={handleSaveAbr}
              onCancel={() => {
                setIsAbrFormOpen(false);
                setEditingAbrProfile(null);
              }}
              isLoading={createAbrMutation.isPending || updateAbrMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ABR Duplicate Dialog */}
      <Dialog open={duplicateAbrId !== null} onOpenChange={() => setDuplicateAbrId(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Duplicate ABR Profile</DialogTitle>
            <DialogDescription>
              Enter a name for the duplicated ABR profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                value={duplicateAbrName}
                onChange={(e) => setDuplicateAbrName(e.target.value)}
                placeholder="New ABR profile name"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateAbrId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicateAbr}
              disabled={!duplicateAbrName || duplicateAbrMutation.isPending}
            >
              {duplicateAbrMutation.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ABR Delete Confirmation */}
      <AlertDialog open={deleteAbrId !== null} onOpenChange={() => setDeleteAbrId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ABR Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The ABR profile will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAbr}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteAbrMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

