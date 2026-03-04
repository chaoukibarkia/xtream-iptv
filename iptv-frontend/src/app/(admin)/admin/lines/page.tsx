'use client';

import { useState, useEffect } from 'react';
import { useLines, useCreateLine, useUpdateLine, useDeleteLine, CreateLineData, UpdateLineData } from '@/lib/api/hooks/useLines';
import { useBouquets } from '@/lib/api/hooks/useBouquets';
import { useUsers } from '@/lib/api/hooks/useUsers';
import { IptvLine, Bouquet } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  RefreshCw,
  Search,
  Copy,
  Key,
  Calendar,
  Globe,
  Shield,
  Settings,
  FolderTree,
  MoreHorizontal,
  Eye,
  Ban,
  ShieldBan,
  ShieldCheck,
  Download,
  List,
  Tv,
  Film,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface LineFormData {
  // Details Tab
  username: string;
  password: string;
  ownerId: string;
  maxConnections: number;
  expiresAt: string;
  adminNotes: string;
  resellerNotes: string;
  
  // Advanced Tab
  forcedServerId: string;
  isMinistraPortal: boolean;
  isRestreamer: boolean;
  isEnigmaDevice: boolean;
  isMagDevice: boolean;
  isTrial: boolean;
  magStbLock: string;
  ispLock: boolean;
  ispDescription: string;
  forcedCountry: string;
  allowHls: boolean;
  allowMpegts: boolean;
  allowRtmp: boolean;
  
  // Restrictions Tab
  allowedIps: string;
  allowedUserAgents: string;
  
  // Bouquets Tab
  bouquetIds: number[];
  
  // Status
  status: 'active' | 'expired' | 'disabled' | 'banned';
}

const initialFormData: LineFormData = {
  username: '',
  password: '',
  ownerId: '',
  maxConnections: 1,
  expiresAt: '',
  adminNotes: '',
  resellerNotes: '',
  forcedServerId: '',
  isMinistraPortal: false,
  isRestreamer: false,
  isEnigmaDevice: false,
  isMagDevice: false,
  isTrial: false,
  magStbLock: '',
  ispLock: false,
  ispDescription: '',
  forcedCountry: '',
  allowHls: true,
  allowMpegts: true,
  allowRtmp: true,
  allowedIps: '',
  allowedUserAgents: '',
  bouquetIds: [],
  status: 'active',
};

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function LinesPage() {
  const { data: lines, isLoading, refetch } = useLines();
  const { data: bouquets, isLoading: bouquetsLoading } = useBouquets();
  const { data: users } = useUsers();
  const createLine = useCreateLine();
  const updateLine = useUpdateLine();
  const deleteLine = useDeleteLine();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<any | null>(null);
  const [deleteConfirmLine, setDeleteConfirmLine] = useState<any | null>(null);
  const [formData, setFormData] = useState<LineFormData>(initialFormData);
  const [activeTab, setActiveTab] = useState('details');
  const [searchTerm, setSearchTerm] = useState('');
  const [bouquetSearch, setBouquetSearch] = useState('');

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isDialogOpen && editingLine) {
      // Editing mode - populate form
      setFormData({
        username: editingLine.username,
        password: editingLine.password,
        ownerId: editingLine.ownerId?.toString() || '',
        maxConnections: editingLine.maxConnections,
        expiresAt: editingLine.expiresAt ? format(new Date(editingLine.expiresAt), "yyyy-MM-dd") : '',
        adminNotes: editingLine.adminNotes || '',
        resellerNotes: editingLine.resellerNotes || '',
        forcedServerId: editingLine.forcedServerId?.toString() || '',
        isMinistraPortal: editingLine.isMinistraPortal || false,
        isRestreamer: editingLine.isRestreamer || false,
        isEnigmaDevice: editingLine.isEnigmaDevice || false,
        isMagDevice: editingLine.isMagDevice || false,
        isTrial: editingLine.isTrial || false,
        magStbLock: editingLine.magStbLock || '',
        ispLock: editingLine.ispLock || false,
        ispDescription: editingLine.ispDescription || '',
        forcedCountry: editingLine.forcedCountry || '',
        allowHls: editingLine.allowHls !== false,
        allowMpegts: editingLine.allowMpegts !== false,
        allowRtmp: editingLine.allowRtmp !== false,
        allowedIps: editingLine.allowedIps?.join('\n') || '',
        allowedUserAgents: editingLine.allowedUserAgents?.join('\n') || '',
        bouquetIds: editingLine.bouquets?.map((b: any) => b.bouquetId || b.id) || [],
        status: editingLine.status,
      });
    } else if (isDialogOpen) {
      // Create mode - reset form
      setFormData(initialFormData);
    }
    setActiveTab('details');
  }, [isDialogOpen, editingLine]);

  const handleOpenCreate = () => {
    setEditingLine(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (line: IptvLine | any) => {
    setEditingLine(line);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const lineData: CreateLineData | UpdateLineData = {
      username: formData.username,
      password: formData.password,
      ownerId: formData.ownerId ? parseInt(formData.ownerId) : undefined,
      maxConnections: formData.maxConnections,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
      adminNotes: formData.adminNotes || undefined,
      resellerNotes: formData.resellerNotes || undefined,
      forcedServerId: formData.forcedServerId ? parseInt(formData.forcedServerId) : undefined,
      isMinistraPortal: formData.isMinistraPortal,
      isRestreamer: formData.isRestreamer,
      isEnigmaDevice: formData.isEnigmaDevice,
      isMagDevice: formData.isMagDevice,
      isTrial: formData.isTrial,
      magStbLock: formData.magStbLock || undefined,
      ispLock: formData.ispLock,
      ispDescription: formData.ispDescription || undefined,
      forcedCountry: formData.forcedCountry || undefined,
      allowHls: formData.allowHls,
      allowMpegts: formData.allowMpegts,
      allowRtmp: formData.allowRtmp,
      allowedIps: formData.allowedIps ? formData.allowedIps.split('\n').filter(ip => ip.trim()) : undefined,
      allowedUserAgents: formData.allowedUserAgents ? formData.allowedUserAgents.split('\n').filter(ua => ua.trim()) : undefined,
      bouquetIds: formData.bouquetIds,
      status: formData.status,
    };

    try {
      if (editingLine) {
        await updateLine.mutateAsync({ id: editingLine.id, data: lineData as UpdateLineData });
        toast({ title: 'Success', description: 'Line updated successfully' });
      } else {
        await createLine.mutateAsync(lineData as CreateLineData);
        toast({ title: 'Success', description: 'Line created successfully' });
      }
      setIsDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save line',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmLine) return;

    try {
      await deleteLine.mutateAsync(deleteConfirmLine.id);
      toast({ title: 'Success', description: 'Line deleted successfully' });
      setDeleteConfirmLine(null);
      refetch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete line',
        variant: 'destructive'
      });
    }
  };

  const handleResetPassword = async (line: any) => {
    try {
      const response = await fetch(`/api/admin/lines/${line.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to reset password');
      }
      const data = await response.json();
      toast({
        title: 'Password Reset',
        description: `New password for ${line.username}: ${data.password}`
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password',
        variant: 'destructive'
      });
    }
  };

  const handleKillConnections = async (line: any) => {
    try {
      const response = await fetch(`/api/admin/lines/${line.id}/kill-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to kill connections');
      }
      const data = await response.json();
      toast({
        title: 'Connections Killed',
        description: `Killed ${data.killedCount || 0} connections for ${line.username}`
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to kill connections',
        variant: 'destructive'
      });
    }
  };

  const generateCredentials = () => {
    setFormData(prev => ({
      ...prev,
      username: generateRandomString(8),
      password: generateRandomString(12),
    }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: `${label} copied to clipboard` });
  };

  const handleBanLine = async (line: any, ban: boolean) => {
    try {
      const response = await fetch(`/api/admin/lines/${line.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ban ? 'banned' : 'active' })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update line status');
      }
      toast({ title: ban ? 'Line Banned' : 'Line Unbanned', description: `${line.username} has been ${ban ? 'banned' : 'unbanned'}` });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update line status',
        variant: 'destructive'
      });
    }
  };

  const handleDownloadPlaylist = (line: any, type: 'full' | 'live' | 'vod') => {
    // Use NEXT_PUBLIC_STREAMING_URL for playlist downloads, fallback to current origin
    const serverUrl = process.env.NEXT_PUBLIC_STREAMING_URL ||
      (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}` : '');
    let url: string;
    switch (type) {
      case 'live':
        url = `${serverUrl}/live/${line.username}/${line.password}?type=m3u_plus&output=ts`;
        break;
      case 'vod':
        url = `${serverUrl}/vod/${line.username}/${line.password}?type=m3u_plus`;
        break;
      default:
        url = `${serverUrl}/get.php?username=${line.username}&password=${line.password}&type=m3u_plus&output=ts`;
    }
    window.open(url, '_blank');
  };

  const toggleBouquet = (bouquetId: number) => {
    setFormData(prev => ({
      ...prev,
      bouquetIds: prev.bouquetIds.includes(bouquetId)
        ? prev.bouquetIds.filter(id => id !== bouquetId)
        : [...prev.bouquetIds, bouquetId]
    }));
  };

  const selectAllBouquets = () => {
    if (bouquets) {
      setFormData(prev => ({
        ...prev,
        bouquetIds: bouquets.map(b => b.id)
      }));
    }
  };

  const deselectAllBouquets = () => {
    setFormData(prev => ({
      ...prev,
      bouquetIds: []
    }));
  };

  const filteredLines = lines?.filter(line => 
    line.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    line.password.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredBouquets = bouquets?.filter(bouquet =>
    bouquet.name.toLowerCase().includes(bouquetSearch.toLowerCase())
  ) || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      expired: 'secondary',
      disabled: 'outline',
      banned: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const usersData = users as any;
  const usersList = Array.isArray(usersData) ? usersData : (usersData?.items || usersData?.users || []);
  const resellers = usersList.filter((u: any) => u.role === 'RESELLER' || u.role === 'SUB_RESELLER' || u.role === 'ADMIN') || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            IPTV Lines
          </h1>
          <p className="text-muted-foreground">Manage subscriber lines and credentials</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Line
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Lines</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lines?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {lines?.filter(l => l.status === 'active').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <Calendar className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {lines?.filter(l => l.status === 'expired').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Banned</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {lines?.filter(l => l.status === 'banned').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username or password..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Lines Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Max Conn.</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Bouquets</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    No lines found
                  </TableCell>
                </TableRow>
              ) : (
                filteredLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-mono">{line.id}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {line.username}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(line.username, 'Username')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{line.password}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(line.password, 'Password')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(line.status)}</TableCell>
                    <TableCell>{line.maxConnections}</TableCell>
                    <TableCell>
                      {line.expiresAt 
                        ? format(new Date(line.expiresAt), 'MMM dd, yyyy')
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {line.bouquets?.length || 0} bouquets
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(line.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenEdit(line)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Line
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(line)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleKillConnections(line)}>
                            <Ban className="mr-2 h-4 w-4" />
                            Kill Connections
                          </DropdownMenuItem>
                          {line.status === 'banned' ? (
                            <DropdownMenuItem onClick={() => handleBanLine(line, false)}>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Unban Line
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleBanLine(line, true)}>
                              <ShieldBan className="mr-2 h-4 w-4" />
                              Ban Line
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Download className="mr-2 h-4 w-4" />
                              Download Playlist
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem onClick={() => handleDownloadPlaylist(line, 'full')}>
                                <List className="mr-2 h-4 w-4" />
                                Full Playlist
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadPlaylist(line, 'live')}>
                                <Tv className="mr-2 h-4 w-4" />
                                Live Only
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadPlaylist(line, 'vod')}>
                                <Film className="mr-2 h-4 w-4" />
                                VOD Only
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteConfirmLine(line)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLine ? 'Edit Line' : 'Create New Line'}
            </DialogTitle>
            <DialogDescription>
              {editingLine 
                ? 'Update the line settings below'
                : 'Configure the new IPTV line settings'
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="advanced" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced
                </TabsTrigger>
                <TabsTrigger value="restrictions" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Restrictions
                </TabsTrigger>
                <TabsTrigger value="bouquets" className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4" />
                  Bouquets
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="username"
                        value={formData.username}
                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                        placeholder="Enter username"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="password"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={generateCredentials}>
                    <Key className="h-4 w-4 mr-2" />
                    Generate Random Credentials
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ownerId">Owner (Reseller)</Label>
                    <Select
                      value={formData.ownerId || "none"}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, ownerId: value === "none" ? "" : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No owner</SelectItem>
                        {resellers.map((user: { id: number; username: string; role: string }) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.username} ({user.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxConnections">Max Connections</Label>
                    <Input
                      id="maxConnections"
                      type="number"
                      min={1}
                      value={formData.maxConnections}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxConnections: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiresAt">Expiry Date</Label>
                    <input
                      id="expiresAt"
                      type="date"
                      value={formData.expiresAt ? formData.expiresAt.split('T')[0] : ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value ? `${e.target.value}T23:59:59` : '' }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: 'active' | 'expired' | 'disabled' | 'banned') => 
                        setFormData(prev => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminNotes">Admin Notes</Label>
                  <Textarea
                    id="adminNotes"
                    value={formData.adminNotes}
                    onChange={(e) => setFormData(prev => ({ ...prev, adminNotes: e.target.value }))}
                    placeholder="Notes visible only to admins..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resellerNotes">Reseller Notes</Label>
                  <Textarea
                    id="resellerNotes"
                    value={formData.resellerNotes}
                    onChange={(e) => setFormData(prev => ({ ...prev, resellerNotes: e.target.value }))}
                    placeholder="Notes visible to resellers..."
                    rows={3}
                  />
                </div>
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value="advanced" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="forcedServerId">Forced Connection/Server</Label>
                    <Input
                      id="forcedServerId"
                      value={formData.forcedServerId}
                      onChange={(e) => setFormData(prev => ({ ...prev, forcedServerId: e.target.value }))}
                      placeholder="Server ID (leave empty for auto)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="forcedCountry">Forced Country</Label>
                    <Input
                      id="forcedCountry"
                      value={formData.forcedCountry}
                      onChange={(e) => setFormData(prev => ({ ...prev, forcedCountry: e.target.value }))}
                      placeholder="e.g., US, UK, DE"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isMinistraPortal"
                      checked={formData.isMinistraPortal}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, isMinistraPortal: !!checked }))
                      }
                    />
                    <Label htmlFor="isMinistraPortal">Ministra/Stalker Portal</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isRestreamer"
                      checked={formData.isRestreamer}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, isRestreamer: !!checked }))
                      }
                    />
                    <Label htmlFor="isRestreamer">Restreamer</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isEnigmaDevice"
                      checked={formData.isEnigmaDevice}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, isEnigmaDevice: !!checked }))
                      }
                    />
                    <Label htmlFor="isEnigmaDevice">Enigma Device</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isMagDevice"
                      checked={formData.isMagDevice}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, isMagDevice: !!checked }))
                      }
                    />
                    <Label htmlFor="isMagDevice">MAG Device</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isTrial"
                      checked={formData.isTrial}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, isTrial: !!checked }))
                      }
                    />
                    <Label htmlFor="isTrial">Trial Account</Label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="magStbLock">MAG STB Lock</Label>
                    <Input
                      id="magStbLock"
                      value={formData.magStbLock}
                      onChange={(e) => setFormData(prev => ({ ...prev, magStbLock: e.target.value }))}
                      placeholder="MAC address for STB lock"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ispDescription">ISP Description</Label>
                    <Input
                      id="ispDescription"
                      value={formData.ispDescription}
                      onChange={(e) => setFormData(prev => ({ ...prev, ispDescription: e.target.value }))}
                      placeholder="ISP name for lock"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ispLock"
                    checked={formData.ispLock}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, ispLock: !!checked }))
                    }
                  />
                  <Label htmlFor="ispLock">Enable ISP Lock</Label>
                </div>

                <div className="space-y-2">
                  <Label>Access Output Formats</Label>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="allowHls"
                        checked={formData.allowHls}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, allowHls: !!checked }))
                        }
                      />
                      <Label htmlFor="allowHls">HLS (m3u8)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="allowMpegts"
                        checked={formData.allowMpegts}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, allowMpegts: !!checked }))
                        }
                      />
                      <Label htmlFor="allowMpegts">MPEG-TS</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="allowRtmp"
                        checked={formData.allowRtmp}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, allowRtmp: !!checked }))
                        }
                      />
                      <Label htmlFor="allowRtmp">RTMP</Label>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Restrictions Tab */}
              <TabsContent value="restrictions" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="allowedIps">Allowed IP Addresses</Label>
                  <p className="text-sm text-muted-foreground">
                    Enter one IP address per line. Leave empty to allow all IPs.
                  </p>
                  <Textarea
                    id="allowedIps"
                    value={formData.allowedIps}
                    onChange={(e) => setFormData(prev => ({ ...prev, allowedIps: e.target.value }))}
                    placeholder="192.168.1.100&#10;10.0.0.50&#10;..."
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allowedUserAgents">Allowed User-Agents</Label>
                  <p className="text-sm text-muted-foreground">
                    Enter one user-agent per line. Leave empty to allow all user-agents.
                  </p>
                  <Textarea
                    id="allowedUserAgents"
                    value={formData.allowedUserAgents}
                    onChange={(e) => setFormData(prev => ({ ...prev, allowedUserAgents: e.target.value }))}
                    placeholder="VLC/3.0.16&#10;Kodi/19.4&#10;..."
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>
              </TabsContent>

              {/* Bouquets Tab */}
              <TabsContent value="bouquets" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search bouquets..."
                      value={bouquetSearch}
                      onChange={(e) => setBouquetSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={selectAllBouquets}>
                      Select All
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={deselectAllBouquets}>
                      Deselect All
                    </Button>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {formData.bouquetIds.length} bouquet(s) selected
                </div>

                <div className="border rounded-lg max-h-80 overflow-y-auto">
                  {bouquetsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Loading bouquets...</span>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Streams</TableHead>
                          <TableHead>Series</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBouquets.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8">
                              No bouquets found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredBouquets.map((bouquet) => {
                            const isSelected = formData.bouquetIds.includes(bouquet.id);
                            return (
                              <TableRow 
                                key={bouquet.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => toggleBouquet(bouquet.id)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleBouquet(bouquet.id)}
                                    className="h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                                  />
                                </TableCell>
                                <TableCell className="font-mono">{bouquet.id}</TableCell>
                                <TableCell className="font-medium">{bouquet.name}</TableCell>
                                <TableCell>{(bouquet as any).streamCount || (bouquet as any)._count?.streams || (bouquet as any).streams?.length || 0}</TableCell>
                                <TableCell>{(bouquet as any).seriesCount || (bouquet as any)._count?.series || 0}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createLine.isPending || updateLine.isPending}
              >
                {createLine.isPending || updateLine.isPending ? 'Saving...' : 'Save Line'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmLine} onOpenChange={() => setDeleteConfirmLine(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Line</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the line "{deleteConfirmLine?.username}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
