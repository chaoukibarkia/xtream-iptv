'use client';

import { useState } from 'react';
import {
  useActivationCodes,
  useActivationCodeStats,
  useGenerateActivationCodes,
  useRevokeActivationCode,
  useActivationEligibleUsers,
  EligibleUser,
  ActivationCode,
  ActivationCodeFilters,
  CreateActivationCodesData,
} from '@/lib/api/hooks/useActivationCodes';
import { useBouquets } from '@/lib/api/hooks/useBouquets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Copy,
  Key,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Ticket,
  Download,
  ChevronsUpDown,
  Check,
  User,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface GenerateFormData {
  count: number;
  bouquetIds: number[];
  maxConnections: number;
  subscriptionDays: number;
  isTrial: boolean;
  codeValidityDays: string;
  deductCredits: boolean;
}

const initialFormData: GenerateFormData = {
  count: 1,
  bouquetIds: [],
  maxConnections: 1,
  subscriptionDays: 30,
  isTrial: false,
  codeValidityDays: '',
  deductCredits: false,
};

export default function ActivationCodesPage() {
  const [filters, setFilters] = useState<ActivationCodeFilters>({
    page: 1,
    limit: 50,
  });
  const { data, isLoading, refetch } = useActivationCodes(filters);
  const { data: stats, refetch: refetchStats } = useActivationCodeStats();
  const { data: bouquets, isLoading: bouquetsLoading } = useBouquets();
  const generateCodes = useGenerateActivationCodes();
  const revokeCode = useRevokeActivationCode();

  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState<ActivationCode | null>(null);
  const [formData, setFormData] = useState<GenerateFormData>(initialFormData);
  const [searchTerm, setSearchTerm] = useState('');
  const [bouquetSearch, setBouquetSearch] = useState('');

  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<EligibleUser | null>(null);
  const { data: eligibleUsersData } = useActivationEligibleUsers(ownerSearch || undefined);
  const eligibleUsers = eligibleUsersData?.users ?? [];

  const handleOpenGenerate = () => {
    setFormData(initialFormData);
    setGeneratedCodes(null);
    setSelectedOwner(null);
    setOwnerSearch('');
    setIsGenerateDialogOpen(true);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    const generateData: CreateActivationCodesData = {
      count: formData.count,
      bouquetIds: formData.bouquetIds,
      maxConnections: formData.maxConnections,
      subscriptionDays: formData.subscriptionDays,
      isTrial: formData.isTrial,
      codeValidityDays: formData.codeValidityDays ? parseInt(formData.codeValidityDays) : undefined,
      createdById: selectedOwner?.id,
      deductCredits: formData.deductCredits,
    };

    try {
      const result = await generateCodes.mutateAsync(generateData);
      setGeneratedCodes(result.codes);
      toast({ title: 'Success', description: `Generated ${result.count} activation code(s)` });
      refetch();
      refetchStats();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate codes';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleRevoke = async () => {
    if (!deleteConfirmCode) return;

    try {
      await revokeCode.mutateAsync(deleteConfirmCode.id);
      toast({ title: 'Success', description: 'Code revoked successfully' });
      setDeleteConfirmCode(null);
      refetch();
      refetchStats();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to revoke code';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: `${label} copied to clipboard` });
  };

  const copyAllCodes = () => {
    if (generatedCodes) {
      navigator.clipboard.writeText(generatedCodes.join('\n'));
      toast({ title: 'Copied', description: `${generatedCodes.length} codes copied to clipboard` });
    }
  };

  const downloadCodes = () => {
    if (generatedCodes) {
      const blob = new Blob([generatedCodes.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activation-codes-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const toggleBouquet = (bouquetId: number) => {
    setFormData((prev) => ({
      ...prev,
      bouquetIds: prev.bouquetIds.includes(bouquetId)
        ? prev.bouquetIds.filter((id) => id !== bouquetId)
        : [...prev.bouquetIds, bouquetId],
    }));
  };

  const selectAllBouquets = () => {
    if (bouquets) {
      setFormData((prev) => ({
        ...prev,
        bouquetIds: bouquets.map((b) => b.id),
      }));
    }
  };

  const deselectAllBouquets = () => {
    setFormData((prev) => ({
      ...prev,
      bouquetIds: [],
    }));
  };

  const codes = data?.codes || [];
  const filteredCodes = codes.filter(
    (code) =>
      code.code.includes(searchTerm) ||
      code.usedByLine?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBouquets =
    bouquets?.filter((bouquet) =>
      bouquet.name.toLowerCase().includes(bouquetSearch.toLowerCase())
    ) || [];

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      UNUSED: { variant: 'default', icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
      USED: { variant: 'secondary', icon: <Clock className="h-3 w-3 mr-1" /> },
      EXPIRED: { variant: 'outline', icon: <XCircle className="h-3 w-3 mr-1" /> },
      REVOKED: { variant: 'destructive', icon: <Ban className="h-3 w-3 mr-1" /> },
    };
    const cfg = config[status] || { variant: 'default', icon: null };
    return (
      <Badge variant={cfg.variant} className="flex items-center w-fit">
        {cfg.icon}
        {status}
      </Badge>
    );
  };

  const formatCode = (code: string) => {
    return code;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Ticket className="h-8 w-8" />
            Activation Codes
          </h1>
          <p className="text-muted-foreground">Generate and manage activation codes for subscribers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleOpenGenerate}>
            <Plus className="h-4 w-4 mr-2" />
            Generate Codes
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unused</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.unused || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Used</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.used || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <XCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.expired || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revoked</CardTitle>
            <Ban className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.revoked || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code or username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => {
            if (value === 'all') {
              setFilters((prev) => ({ ...prev, status: undefined }));
              return;
            }

            const status = value as ActivationCodeFilters['status'];
            setFilters((prev) => ({ ...prev, status }));
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="UNUSED">Unused</SelectItem>
            <SelectItem value="USED">Used</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="REVOKED">Revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Codes Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Max Conn.</TableHead>
                <TableHead>Bouquets</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Used By</TableHead>
                <TableHead>Code Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredCodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    No activation codes found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCodes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{formatCode(code.code)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(code.code, 'Code')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(code.status)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {code.subscriptionDays} days
                        {code.isTrial && (
                          <Badge variant="outline" className="text-xs ml-1">Trial</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{code.maxConnections}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{code.bouquetIds.length} bouquets</Badge>
                    </TableCell>
                    <TableCell>
                      {code.createdBy ? (
                        <span className="font-medium">{code.createdBy.username}</span>
                      ) : (
                        <span className="text-muted-foreground">#{code.createdById}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {code.usedByLine ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{code.usedByLine.username}</span>
                          {code.usedAt && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(code.usedAt), 'MMM dd, yyyy')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {code.codeExpiresAt
                        ? format(new Date(code.codeExpiresAt), 'MMM dd, yyyy')
                        : 'Never'}
                    </TableCell>
                    <TableCell>{format(new Date(code.createdAt), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      {code.status === 'UNUSED' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmCode(code)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data?.pagination && data.pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{' '}
            {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
            {data.pagination.total} codes
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page >= data.pagination.pages}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Generate Dialog */}
      <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Generate Activation Codes
            </DialogTitle>
            <DialogDescription>
              Configure the settings for new activation codes
            </DialogDescription>
          </DialogHeader>

          {generatedCodes ? (
            // Show generated codes
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Generated {generatedCodes.length} code(s)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyAllCodes}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadCodes}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto bg-muted/50">
                <div className="font-mono text-sm space-y-1">
                  {generatedCodes.map((code, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span>{formatCode(code)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(code, 'Code')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGeneratedCodes(null)}>
                  Generate More
                </Button>
                <Button onClick={() => setIsGenerateDialogOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            // Show generation form
            <form onSubmit={handleGenerate}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Owner (Reseller)</Label>
                  <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={ownerOpen}
                        className="w-full justify-between"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <User className="h-4 w-4 shrink-0" />
                          {selectedOwner ? selectedOwner.username : 'Select owner (optional)'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search users..."
                          value={ownerSearch}
                          onValueChange={setOwnerSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No user found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => {
                                setSelectedOwner(null);
                                setOwnerOpen(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  selectedOwner === null ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              Use my account
                            </CommandItem>
                            {eligibleUsers.map((u) => (
                              <CommandItem
                                key={u.id}
                                value={u.username}
                                onSelect={() => {
                                  setSelectedOwner(u);
                                  setOwnerOpen(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    selectedOwner?.id === u.id ? 'opacity-100' : 'opacity-0'
                                  }`}
                                />
                                {u.username}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Admin can generate codes for any reseller. Resellers can generate for sub-resellers.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="count">Number of Codes</Label>
                    <Input
                      id="count"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.count}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          count: parseInt(e.target.value) || 1,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subscriptionDays">Subscription Days</Label>
                    <Input
                      id="subscriptionDays"
                      type="number"
                      min={1}
                      max={3650}
                      value={formData.subscriptionDays}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          subscriptionDays: parseInt(e.target.value) || 30,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxConnections">Max Connections</Label>
                    <Input
                      id="maxConnections"
                      type="number"
                      min={1}
                      max={10}
                      value={formData.maxConnections}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          maxConnections: parseInt(e.target.value) || 1,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codeValidityDays">Code Validity (days)</Label>
                    <Input
                      id="codeValidityDays"
                      type="number"
                      min={1}
                      max={365}
                      value={formData.codeValidityDays}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          codeValidityDays: e.target.value,
                        }))
                      }
                      placeholder="Leave empty for no expiry"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isTrial"
                    checked={formData.isTrial}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, isTrial: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isTrial">Trial Account</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="deductCredits"
                    checked={formData.deductCredits}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, deductCredits: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="deductCredits">Deduct credits</Label>
                </div>

                {/* Bouquets Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Bouquets</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={selectAllBouquets}>
                        Select All
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={deselectAllBouquets}>
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search bouquets..."
                      value={bouquetSearch}
                      onChange={(e) => setBouquetSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {formData.bouquetIds.length} bouquet(s) selected
                  </p>

                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {bouquetsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredBouquets.length === 0 ? (
                      <p className="text-center py-4 text-muted-foreground">No bouquets found</p>
                    ) : (
                      <div className="p-2 space-y-1">
                        {filteredBouquets.map((bouquet) => (
                          <label
                            key={bouquet.id}
                            className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.bouquetIds.includes(bouquet.id)}
                              onChange={() => toggleBouquet(bouquet.id)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm">{bouquet.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsGenerateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={generateCodes.isPending}>
                  {generateCodes.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      Generate Codes
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmCode} onOpenChange={() => setDeleteConfirmCode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Activation Code</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke code &quot;{deleteConfirmCode?.code}&quot;? This action cannot
              be undone and the code will no longer be usable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-red-600 hover:bg-red-700">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
