'use client';

import { useState } from 'react';
import {
  useCreditTransactions,
  useCreditStats,
  useUpdatePaymentStatus,
  CreditTransaction,
  TransactionFilters,
} from '@/lib/api/hooks/useCredits';
import { useUsers } from '@/lib/api/hooks/useUsers';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  RefreshCw,
  Coins,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Receipt,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const transactionTypeConfig: Record<
  CreditTransaction['type'],
  { label: string; icon: React.ReactNode; color: string }
> = {
  TOP_UP: {
    label: 'Top Up',
    icon: <ArrowUpCircle className="h-4 w-4" />,
    color: 'text-green-600',
  },
  DEDUCTION: {
    label: 'Deduction',
    icon: <ArrowDownCircle className="h-4 w-4" />,
    color: 'text-red-600',
  },
  REFUND: {
    label: 'Refund',
    icon: <RotateCcw className="h-4 w-4" />,
    color: 'text-blue-600',
  },
  TRANSFER_IN: {
    label: 'Transfer In',
    icon: <ArrowLeftRight className="h-4 w-4" />,
    color: 'text-green-600',
  },
  TRANSFER_OUT: {
    label: 'Transfer Out',
    icon: <ArrowLeftRight className="h-4 w-4" />,
    color: 'text-orange-600',
  },
};

export default function CreditTransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    limit: 50,
  });
  const [selectedTransaction, setSelectedTransaction] = useState<CreditTransaction | null>(null);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [userComboboxOpen, setUserComboboxOpen] = useState(false);

  const { data, isLoading, refetch } = useCreditTransactions(filters);
  const { data: stats, refetch: refetchStats } = useCreditStats();
  const { data: usersData } = useUsers({ limit: 1000 });
  const updatePaymentStatus = useUpdatePaymentStatus();

  const handleUpdatePayment = async (isPaid: boolean) => {
    if (!selectedTransaction) return;

    try {
      await updatePaymentStatus.mutateAsync({
        transactionId: selectedTransaction.id,
        data: {
          isPaid,
          paymentNotes: paymentNotes || undefined,
        },
      });
      toast({
        title: 'Success',
        description: `Payment marked as ${isPaid ? 'paid' : 'unpaid'}`,
      });
      setSelectedTransaction(null);
      setPaymentNotes('');
      refetch();
      refetchStats();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update payment status',
        variant: 'destructive',
      });
    }
  };

  const getPaymentBadge = (isPaid: boolean | null) => {
    if (isPaid === null) return null;
    return isPaid ? (
      <Badge variant="default" className="bg-green-600">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Paid
      </Badge>
    ) : (
      <Badge variant="destructive">
        <Clock className="h-3 w-3 mr-1" />
        Unpaid
      </Badge>
    );
  };

  const transactions = data?.transactions || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Receipt className="h-8 w-8" />
            Credit Transactions
          </h1>
          <p className="text-muted-foreground">View and manage all credit transactions</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            refetch();
            refetchStats();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            <Coins className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCreditsInSystem || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Top-ups</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.totalTopUps || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.paidTopUps || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unpaid</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.unpaidTopUps || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deductions</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.totalDeductions || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Popover open={userComboboxOpen} onOpenChange={setUserComboboxOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={userComboboxOpen}
              className="w-[250px] justify-between"
            >
              {filters.userId
                ? usersData?.users?.find((user) => user.id === filters.userId)?.username
                : 'Filter by user...'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0">
            <Command>
              <CommandInput placeholder="Search users..." />
              <CommandList>
                <CommandEmpty>No user found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      setFilters((prev) => ({
                        ...prev,
                        userId: undefined,
                        page: 1,
                      }));
                      setUserComboboxOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        !filters.userId ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    All Users
                  </CommandItem>
                  {usersData?.users?.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={user.username}
                      onSelect={() => {
                        setFilters((prev) => ({
                          ...prev,
                          userId: user.id,
                          page: 1,
                        }));
                        setUserComboboxOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          filters.userId === user.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {user.username}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Select
          value={filters.type || 'all'}
          onValueChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              type: value === 'all' ? undefined : (value as CreditTransaction['type']),
              page: 1,
            }))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="TOP_UP">Top Up</SelectItem>
            <SelectItem value="DEDUCTION">Deduction</SelectItem>
            <SelectItem value="REFUND">Refund</SelectItem>
            <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
            <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.isPaid === undefined ? 'all' : filters.isPaid.toString()}
          onValueChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              isPaid: value === 'all' ? undefined : value === 'true',
              page: 1,
            }))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Payment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Paid</SelectItem>
            <SelectItem value="false">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => {
                  const config = transactionTypeConfig[tx.type];
                  return (
                    <TableRow key={tx.id}>
                      <TableCell>{format(new Date(tx.createdAt), 'MMM dd, yyyy HH:mm')}</TableCell>
                      <TableCell>
                        <span className="font-medium">{tx.user?.username || `User #${tx.userId}`}</span>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 ${config.color}`}>
                          {config.icon}
                          {config.label}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-mono font-medium ${
                            tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {tx.amount > 0 ? '+' : ''}
                          {tx.amount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {tx.balanceBefore} → {tx.balanceAfter}
                        </span>
                      </TableCell>
                      <TableCell>{getPaymentBadge(tx.isPaid)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {tx.description || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.type === 'TOP_UP' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTransaction(tx);
                              setPaymentNotes(tx.paymentNotes || '');
                            }}
                          >
                            Edit Payment
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
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
            {data.pagination.total} transactions
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page >= data.pagination.pages}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Update Payment Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Update Payment Status
            </DialogTitle>
            <DialogDescription>
              Update the payment status for this top-up transaction
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">User</p>
                <p className="font-medium">{selectedTransaction?.user?.username}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="font-medium text-green-600">+{selectedTransaction?.amount} credits</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <p>{getPaymentBadge(selectedTransaction?.isPaid ?? null)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="text-sm">
                  {selectedTransaction &&
                    format(new Date(selectedTransaction.createdAt), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentNotes">Payment Notes</Label>
              <Input
                id="paymentNotes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="e.g., Bank transfer ref: ABC123"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedTransaction(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleUpdatePayment(false)}
              disabled={updatePaymentStatus.isPending}
            >
              Mark Unpaid
            </Button>
            <Button
              onClick={() => handleUpdatePayment(true)}
              disabled={updatePaymentStatus.isPending}
            >
              {updatePaymentStatus.isPending && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              Mark Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
