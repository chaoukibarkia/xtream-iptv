'use client';

import { useState } from 'react';
import { useApplications, useUploadApplication, useUpdateApplicationActive, useDeleteApplication, Application } from '@/lib/api/hooks/useApplications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  RefreshCw,
  Trash2,
  Download,
  Smartphone,
  Monitor,
  Globe,
  Apple,
  Laptop,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const PLATFORM_CONFIG = {
  ANDROID: {
    icon: Smartphone,
    label: 'Android',
    extension: '.apk',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  IOS: {
    icon: Apple,
    label: 'iOS',
    extension: '.ipa',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  },
  WEB: {
    icon: Globe,
    label: 'Web',
    extension: '.zip',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  WINDOWS: {
    icon: Laptop,
    label: 'Windows',
    extension: '.exe',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
  },
  MAC: {
    icon: Monitor,
    label: 'macOS',
    extension: '.dmg',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
  },
};

export default function ApplicationsPage() {
  const { toast } = useToast();
  const { data: applications, isLoading, error, refetch } = useApplications();
  const uploadMutation = useUploadApplication();
  const updateActiveMutation = useUpdateApplicationActive();
  const deleteMutation = useDeleteApplication();

  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [appToDelete, setAppToDelete] = useState<Application | null>(null);

  const [uploadForm, setUploadForm] = useState({
    name: 'ZEBRA',
    platform: 'ANDROID' as 'ANDROID' | 'IOS' | 'WEB' | 'WINDOWS' | 'MAC',
    version: '',
    uploadNotes: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const config = PLATFORM_CONFIG[uploadForm.platform];
      if (!file.name.endsWith(config.extension)) {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: `Please select a ${config.extension} file for ${config.label}`,
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Please select a file to upload',
      });
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        ...uploadForm,
        file: selectedFile,
      });
      
      toast({
        title: 'Application uploaded successfully',
        description: `${uploadForm.name} v${uploadForm.version} has been uploaded`,
      });
      
      setShowUploadDialog(false);
      setSelectedFile(null);
      setUploadForm({
        ...uploadForm,
        version: '',
        uploadNotes: '',
      });
      
      refetch();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.response?.data?.error || 'Failed to upload application',
      });
    }
  };

  const handleToggleActive = async (app: Application) => {
    try {
      await updateActiveMutation.mutateAsync({
        id: app.id,
        isActive: !app.isActive,
      });
      
      toast({
        title: 'Application updated',
        description: `${app.name} is now ${!app.isActive ? 'active' : 'inactive'}`,
      });
      
      refetch();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.response?.data?.error || 'Failed to update application',
      });
    }
  };

  const handleDelete = async () => {
    if (!appToDelete) return;

    try {
      await deleteMutation.mutateAsync(appToDelete.id);
      
      toast({
        title: 'Application deleted',
        description: `${appToDelete.name} v${appToDelete.version} has been deleted`,
      });
      
      setShowDeleteDialog(false);
      setAppToDelete(null);
      
      refetch();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.response?.data?.error || 'Failed to delete application',
      });
    }
  };

  const getPublicDownloadUrl = (app: Application) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://10.10.0.12:3001';
    return `${baseUrl}/apps/${app.platform.toLowerCase()}/${app.fileName}`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Applications</h1>
          <p className="text-muted-foreground">Manage IPTV application versions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload Application
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Application</DialogTitle>
                <DialogDescription>
                  Upload a new version of your IPTV application
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <Label htmlFor="name">Application Name</Label>
                  <Input
                    id="name"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select
                    value={uploadForm.platform}
                    onValueChange={(value: any) => setUploadForm({ ...uploadForm, platform: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label} ({config.extension})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    placeholder="e.g., 1.0.0"
                    value={uploadForm.version}
                    onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Release Notes (Optional)</Label>
                  <Input
                    id="notes"
                    placeholder="What's new in this version?"
                    value={uploadForm.uploadNotes}
                    onChange={(e) => setUploadForm({ ...uploadForm, uploadNotes: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="file">Application File</Label>
                  <Input
                    id="file"
                    type="file"
                    accept={PLATFORM_CONFIG[uploadForm.platform].extension}
                    onChange={handleFileSelect}
                    required
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowUploadDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploadMutation.isPending}>
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uploaded Applications</CardTitle>
          <CardDescription>
            Manage and distribute application versions to users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load applications
            </div>
          ) : !applications || applications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No applications uploaded yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Download URL</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => {
                  const config = PLATFORM_CONFIG[app.platform];
                  const PlatformIcon = config.icon;
                  return (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.name}</TableCell>
                      <TableCell>
                        <Badge className={cn('gap-1', config.bgColor, config.textColor)}>
                          <PlatformIcon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{app.version}</Badge>
                      </TableCell>
                      <TableCell>{formatFileSize(app.fileSize)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(app)}
                          disabled={updateActiveMutation.isPending}
                        >
                          {app.isActive ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-400" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{format(new Date(app.createdAt), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(getPublicDownloadUrl(app), '_blank')}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAppToDelete(app);
                            setShowDeleteDialog(true);
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {appToDelete?.name} v{appToDelete?.version}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
