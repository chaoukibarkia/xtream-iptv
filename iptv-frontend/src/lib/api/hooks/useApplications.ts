import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';

export interface Application {
  id: number;
  name: string;
  platform: 'ANDROID' | 'IOS' | 'WEB' | 'WINDOWS' | 'MAC';
  version: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  isActive: boolean;
  uploadNotes: string | null;
  uploadedBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface LatestAppInfo {
  name: string;
  platform: string;
  version: string;
  downloadUrl: string;
  fileSize: number;
  uploadNotes: string | null;
}

export function useApplications() {
  return useQuery<Application[]>({
    queryKey: ['applications'],
    queryFn: async () => {
      const response = await api.get<{ applications: Application[] }>('/api/admin/applications');
      return response.applications;
    },
  });
}

export function useLatestApplication(platform: string) {
  return useQuery<LatestAppInfo>({
    queryKey: ['latest-application', platform],
    queryFn: async () => {
      const response = await api.get<LatestAppInfo>(`/api/public/applications/${platform}/latest`);
      return response;
    },
    enabled: !!platform,
  });
}

interface UploadAppData {
  name: string;
  platform: 'ANDROID' | 'IOS' | 'WEB' | 'WINDOWS' | 'MAC';
  version: string;
  uploadNotes?: string;
  file: File;
}

export function useUploadApplication() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: UploadAppData) => {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('platform', data.platform);
      formData.append('version', data.version);
      formData.append('uploadNotes', data.uploadNotes || '');
      formData.append('file', data.file);

      const response = await api.post<any>('/api/admin/applications/upload', formData);
      
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useUpdateApplicationActive() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await api.put<{ application: Application }>(`/api/admin/applications/${id}/active`, {
        applicationId: id,
        isActive,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete<{ success: boolean; message: string }>(`/api/admin/applications/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}
