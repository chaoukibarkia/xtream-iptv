'use client';

import { useState, useEffect } from 'react';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationsRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteReadNotifications,
  Notification as NotificationData,
  NotificationType
} from '@/lib/api/hooks/useNotifications';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  RefreshCw,
  Bell,
  Mail,
  MailOpen,
  Trash2,
  Eye,
  Filter,
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  CreditCard,
  Users,
  Server,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Using imported types from hooks

// Type-based styling and icons
const getTypeConfig = (type: NotificationType) => {
  switch (type) {
    case 'SUCCESS':
      return {
        icon: CheckCircle2,
        bgColor: 'bg-green-50',
        iconColor: 'text-green-600',
        badgeColor: 'bg-green-100 text-green-800',
        border: 'border-green-200',
      };
    case 'WARNING':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-yellow-50',
        iconColor: 'text-yellow-600',
        badgeColor: 'bg-yellow-100 text-yellow-800',
        border: 'border-yellow-200',
      };
    case 'ERROR':
      return {
        icon: XCircle,
        bgColor: 'bg-red-50',
        iconColor: 'text-red-600',
        badgeColor: 'bg-red-100 text-red-800',
        border: 'border-red-200',
      };
    case 'CREDIT':
      return {
        icon: CreditCard,
        bgColor: 'bg-blue-50',
        iconColor: 'text-blue-600',
        badgeColor: 'bg-blue-100 text-blue-800',
        border: 'border-blue-200',
      };
    case 'LINE':
      return {
        icon: Users,
        bgColor: 'bg-purple-50',
        iconColor: 'text-purple-600',
        badgeColor: 'bg-purple-100 text-purple-800',
        border: 'border-purple-200',
      };
    case 'SYSTEM':
      return {
        icon: Server,
        bgColor: 'bg-gray-50',
        iconColor: 'text-gray-600',
        badgeColor: 'bg-gray-100 text-gray-800',
        border: 'border-gray-200',
      };
    default:
      return {
        icon: Info,
        bgColor: 'bg-blue-50',
        iconColor: 'text-blue-600',
        badgeColor: 'bg-blue-100 text-blue-800',
        border: 'border-blue-200',
      };
  }
};

export default function NotificationsPage() {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<NotificationData | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<NotificationData | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;
  const { toast } = useToast();

  // Hooks
  const notificationsQuery = useNotifications();
  const unreadCountQuery = useUnreadNotificationCount();
  const markReadMutation = useMarkNotificationsRead();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const deleteNotificationMutation = useDeleteNotification();
  const deleteAllReadMutation = useDeleteReadNotifications();

  // Data extraction
  const notifications = notificationsQuery.data?.notifications || [];
  const unreadCount = unreadCountQuery.data?.count || 0;
  const loading = notificationsQuery.isLoading || unreadCountQuery.isLoading;
  const error = notificationsQuery.error || unreadCountQuery.error;

  // Filter notifications
  const filteredNotifications = notifications.filter(notification => {
    const matchesType = selectedType === 'all' || notification.type === selectedType;
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'read' ? notification.isRead : !notification.isRead);
    const matchesSearch = !searchTerm || 
      notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesType && matchesStatus && matchesSearch;
  });

  const handleMarkAsRead = async (notificationIds: number[]) => {
    try {
      await markReadMutation.mutateAsync(notificationIds);
      toast({ title: 'Success', description: 'Notifications marked as read' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to mark notifications as read', variant: 'destructive' });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
      toast({ title: 'Success', description: 'All notifications marked as read' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to mark all notifications as read', variant: 'destructive' });
    }
  };

  const handleDeleteNotification = async (notificationId: number) => {
    try {
      await deleteNotificationMutation.mutateAsync(notificationId);
      toast({ title: 'Success', description: 'Notification deleted' });
      setShowDeleteDialog(false);
      setNotificationToDelete(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete notification', variant: 'destructive' });
    }
  };

  const handleDeleteAllRead = async () => {
    try {
      await deleteAllReadMutation.mutateAsync();
      toast({ title: 'Success', description: 'All read notifications deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete read notifications', variant: 'destructive' });
    }
  };

  const handleNotificationClick = (notification: NotificationData) => {
    setSelectedNotification(notification);
    
    // Mark as read if unread
    if (!notification.isRead) {
      handleMarkAsRead([notification.id]);
    }
  };

  const notificationTypes: { value: string; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'INFO', label: 'Info' },
    { value: 'SUCCESS', label: 'Success' },
    { value: 'WARNING', label: 'Warning' },
    { value: 'ERROR', label: 'Error' },
    { value: 'CREDIT', label: 'Credit' },
    { value: 'LINE', label: 'Line' },
    { value: 'SYSTEM', label: 'System' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'read', label: 'Read' },
  ];

  const stats = {
    total: notifications.length,
    unread: unreadCount,
    read: notifications.length - unreadCount,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-2">
            Manage and view your system notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              notificationsQuery.refetch();
              unreadCountQuery.refetch();
            }}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button onClick={handleMarkAllAsRead} variant="outline" size="sm">
              <MailOpen className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          )}
          <Button
            onClick={handleDeleteAllRead}
            variant="outline" 
            size="sm"
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Read
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notifications</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.unread}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Read</CardTitle>
            <MailOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.read}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search notifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-full md:w-48">
              <Label>Type</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {notificationTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-48">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500">
              Error loading notifications: {error?.message || 'Unknown error'}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">No notifications found</p>
              <p className="text-sm">Your notifications will appear here</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredNotifications.map((notification) => {
                const typeConfig = getTypeConfig(notification.type);
                const IconComponent = typeConfig.icon;
                
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                      !notification.isRead && "bg-blue-50/50",
                      typeConfig.bgColor.replace('50', '25')
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("flex-shrink-0 p-2 rounded-full", typeConfig.bgColor)}>
                        <IconComponent className={cn("h-4 w-4", typeConfig.iconColor)} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                "font-medium",
                                !notification.isRead && "font-semibold"
                              )}>
                                {notification.title}
                              </h3>
                              {!notification.isRead && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge className={typeConfig.badgeColor}>
                                {notification.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(notification.createdAt), 'MMM dd, yyyy HH:mm')}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotificationToDelete(notification);
                                setShowDeleteDialog(true);
                              }}
                              className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Detail Dialog */}
      <Dialog open={!!selectedNotification} onOpenChange={() => setSelectedNotification(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && (
                <>
                  {(() => {
                    const typeConfig = getTypeConfig(selectedNotification.type);
                    const IconComponent = typeConfig.icon;
                    return <IconComponent className={cn("h-5 w-5", typeConfig.iconColor)} />;
                  })()}
                  {selectedNotification.title}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedNotification && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={getTypeConfig(selectedNotification.type).badgeColor}>
                  {selectedNotification.type}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(selectedNotification.createdAt), 'MMMM dd, yyyy HH:mm')}
                </span>
                {!selectedNotification.isRead && (
                  <Badge variant="secondary">Unread</Badge>
                )}
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm leading-relaxed">{selectedNotification.message}</p>
                {selectedNotification.link && (
                  <div className="mt-4">
                    <Button variant="outline" size="sm" asChild>
                      <a href={selectedNotification.link} target="_blank" rel="noopener noreferrer">
                        View Related Item
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Notification</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this notification? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setNotificationToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (notificationToDelete) {
                  handleDeleteNotification(notificationToDelete.id);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}