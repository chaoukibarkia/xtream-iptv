import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { TranscodingProfile, ServerCapabilities, AbrProfile } from "@/types";

// Types for API responses
interface ProfilesResponse {
  profiles: (TranscodingProfile & { streamCount: number })[];
}

interface ProfileResponse {
  profile: TranscodingProfile;
}

interface CompatibleServersResponse {
  profile: { id: number; name: string; requiresGpu: boolean };
  servers: ServerCapabilities[];
}

interface ServerCapabilitiesResponse {
  servers: ServerCapabilities[];
}

interface FfmpegPreviewResponse {
  command: string;
}

// Fetch all transcoding profiles
export function useTranscodingProfiles() {
  return useQuery({
    queryKey: ["transcoding-profiles"],
    queryFn: async () => {
      const response = await api.get<ProfilesResponse>("/admin/transcoding/profiles");
      return response.profiles;
    },
  });
}

// Fetch single profile
export function useTranscodingProfile(id: number | undefined) {
  return useQuery({
    queryKey: ["transcoding-profile", id],
    queryFn: async () => {
      const response = await api.get<ProfileResponse>(`/admin/transcoding/profiles/${id}`);
      return response.profile;
    },
    enabled: !!id,
  });
}

// Create profile
export function useCreateTranscodingProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: Partial<TranscodingProfile>) => {
      const response = await api.post<ProfileResponse>("/admin/transcoding/profiles", profile);
      return response.profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transcoding-profiles"] });
    },
  });
}

// Update profile
export function useUpdateTranscodingProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<TranscodingProfile> & { id: number }) => {
      const response = await api.put<ProfileResponse>(`/admin/transcoding/profiles/${id}`, data);
      return response.profile;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["transcoding-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["transcoding-profile", variables.id] });
    },
  });
}

// Delete profile
export function useDeleteTranscodingProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/transcoding/profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transcoding-profiles"] });
    },
  });
}

// Duplicate profile
export function useDuplicateTranscodingProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name?: string }) => {
      const response = await api.post<ProfileResponse>(`/admin/transcoding/profiles/${id}/duplicate`, { name });
      return response.profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transcoding-profiles"] });
    },
  });
}

// Seed default profiles
export function useSeedDefaultProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ message: string; profiles: TranscodingProfile[] }>(
        "/admin/transcoding/profiles/seed",
        {} // Empty object to satisfy Content-Type: application/json
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transcoding-profiles"] });
    },
  });
}

// Get FFmpeg command preview
export function useFfmpegPreview(id: number | undefined, inputUrl?: string) {
  return useQuery({
    queryKey: ["ffmpeg-preview", id, inputUrl],
    queryFn: async () => {
      const response = await api.post<FfmpegPreviewResponse>(
        `/admin/transcoding/profiles/${id}/preview`,
        { inputUrl }
      );
      return response.command;
    },
    enabled: !!id,
  });
}

// Get compatible servers for a profile
export function useCompatibleServers(profileId: number | undefined) {
  return useQuery({
    queryKey: ["compatible-servers", profileId],
    queryFn: async () => {
      const response = await api.get<CompatibleServersResponse>(
        `/admin/transcoding/profiles/${profileId}/compatible-servers`
      );
      return response;
    },
    enabled: !!profileId,
  });
}

// Get all server capabilities
export function useServerCapabilities() {
  return useQuery({
    queryKey: ["server-capabilities"],
    queryFn: async () => {
      const response = await api.get<ServerCapabilitiesResponse>("/admin/transcoding/servers/capabilities");
      return response.servers;
    },
  });
}

// ============================================
// ABR PROFILES (Adaptive Bitrate)
// ============================================

interface AbrProfilesResponse {
  profiles: (AbrProfile & { streamCount: number })[];
}

interface AbrProfileResponse {
  profile: AbrProfile;
}

// Fetch all ABR profiles
export function useAbrProfiles() {
  return useQuery({
    queryKey: ["abr-profiles"],
    queryFn: async () => {
      const response = await api.get<AbrProfilesResponse>("/admin/transcoding/abr-profiles");
      return response.profiles;
    },
  });
}

// Fetch single ABR profile
export function useAbrProfile(id: number | undefined) {
  return useQuery({
    queryKey: ["abr-profile", id],
    queryFn: async () => {
      const response = await api.get<AbrProfileResponse>(`/admin/transcoding/abr-profiles/${id}`);
      return response.profile;
    },
    enabled: !!id,
  });
}

// Create ABR profile
export function useCreateAbrProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: Partial<AbrProfile>) => {
      const response = await api.post<AbrProfileResponse>("/admin/transcoding/abr-profiles", profile);
      return response.profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abr-profiles"] });
    },
  });
}

// Update ABR profile
export function useUpdateAbrProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<AbrProfile> & { id: number }) => {
      const response = await api.put<AbrProfileResponse>(`/admin/transcoding/abr-profiles/${id}`, data);
      return response.profile;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["abr-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["abr-profile", variables.id] });
    },
  });
}

// Delete ABR profile
export function useDeleteAbrProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/transcoding/abr-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abr-profiles"] });
    },
  });
}

// Duplicate ABR profile
export function useDuplicateAbrProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await api.post<AbrProfileResponse>(`/admin/transcoding/abr-profiles/${id}/duplicate`, { name });
      return response.profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abr-profiles"] });
    },
  });
}

// Seed default ABR profiles
export function useSeedDefaultAbrProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ message: string; created: number }>("/admin/transcoding/abr-profiles/seed-defaults");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abr-profiles"] });
    },
  });
}

// Video codec options
export const VIDEO_CODECS = [
  { value: "copy", label: "Copy (No Transcoding)" },
  { value: "h264", label: "H.264 / AVC" },
  { value: "h265", label: "H.265 / HEVC" },
  { value: "vp9", label: "VP9" },
  { value: "av1", label: "AV1" },
];

// Audio codec options
export const AUDIO_CODECS = [
  { value: "copy", label: "Copy (No Transcoding)" },
  { value: "aac", label: "AAC" },
  { value: "mp3", label: "MP3" },
  { value: "opus", label: "Opus" },
  { value: "ac3", label: "AC3 / Dolby Digital" },
  { value: "eac3", label: "E-AC3 / Dolby Digital Plus" },
];

// Video presets (for software encoding)
export const VIDEO_PRESETS = [
  { value: "ultrafast", label: "Ultrafast (Low quality, fastest)" },
  { value: "superfast", label: "Superfast" },
  { value: "veryfast", label: "Very Fast" },
  { value: "faster", label: "Faster" },
  { value: "fast", label: "Fast" },
  { value: "medium", label: "Medium (Balanced)" },
  { value: "slow", label: "Slow" },
  { value: "slower", label: "Slower" },
  { value: "veryslow", label: "Very Slow (Best quality, slowest)" },
];

// NVENC presets
export const NVENC_PRESETS = [
  { value: "p1", label: "P1 (Fastest)" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
  { value: "p4", label: "P4 (Balanced)" },
  { value: "p5", label: "P5" },
  { value: "p6", label: "P6" },
  { value: "p7", label: "P7 (Best Quality)" },
];

// NVENC rate control modes
export const NVENC_RC_MODES = [
  { value: "constqp", label: "Constant QP" },
  { value: "vbr", label: "VBR" },
  { value: "cbr", label: "CBR" },
  { value: "vbr_minqp", label: "VBR Min QP" },
];

// Resolution presets
export const RESOLUTION_PRESETS = [
  { value: "original", label: "Original (No scaling)" },
  { value: "480p", label: "480p (854×480)" },
  { value: "720p", label: "720p HD (1280×720)" },
  { value: "1080p", label: "1080p Full HD (1920×1080)" },
  { value: "4k", label: "4K UHD (3840×2160)" },
];

// Bitrate presets
export const BITRATE_PRESETS = [
  { value: 1000, label: "1 Mbps (Low)" },
  { value: 2000, label: "2 Mbps" },
  { value: 3000, label: "3 Mbps (720p)" },
  { value: 4000, label: "4 Mbps" },
  { value: 5000, label: "5 Mbps" },
  { value: 6000, label: "6 Mbps (1080p)" },
  { value: 8000, label: "8 Mbps" },
  { value: 10000, label: "10 Mbps" },
  { value: 15000, label: "15 Mbps (4K)" },
  { value: 25000, label: "25 Mbps (4K High)" },
];

// Audio bitrate presets
export const AUDIO_BITRATE_PRESETS = [
  { value: 64, label: "64 kbps (Low)" },
  { value: 96, label: "96 kbps" },
  { value: 128, label: "128 kbps (Standard)" },
  { value: 192, label: "192 kbps (High)" },
  { value: 256, label: "256 kbps" },
  { value: 320, label: "320 kbps (Best)" },
];

// Encoding modes
export const ENCODING_MODES = [
  { value: "PASSTHROUGH", label: "Passthrough (No transcoding)", description: "Copy streams without re-encoding", icon: "⚡" },
  { value: "SOFTWARE", label: "CPU (Software)", description: "Software encoding using CPU", icon: "💻" },
  { value: "NVENC", label: "NVIDIA GPU (NVENC)", description: "Hardware encoding using NVIDIA GPU", icon: "🎮" },
  { value: "QSV", label: "Intel Quick Sync", description: "Hardware encoding using Intel iGPU", icon: "🔵" },
  { value: "VAAPI", label: "VA-API (Linux)", description: "Hardware encoding using VA-API", icon: "🐧" },
];

