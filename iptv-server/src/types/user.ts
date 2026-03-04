import { User, UserRole, UserStatus, IptvLine, IptvLineStatus } from '@prisma/client';

// ============================================
// IPTV Line Types (Xtream Codes API compatible)
// ============================================

export interface UserInfo {
  username: string;
  password: string;
  message: string;
  auth: 0 | 1;
  status: 'Active' | 'Banned' | 'Disabled' | 'Expired';
  exp_date: string | null;
  is_trial: '0' | '1';
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface ServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: 'http' | 'https';
  rtmp_port: string;
  timezone: string;
  timestamp_now: number;
  time_now: string;
}

export interface AuthResponse {
  user_info: UserInfo;
  server_info: ServerInfo;
}

// IPTV Line with bouquets for streaming authentication
export interface IptvLineWithBouquets extends IptvLine {
  bouquets: {
    bouquet: {
      id: number;
      name: string;
    };
  }[];
  owner?: {
    id: number;
    role: string;
  } | null;
}

// Map IptvLineStatus to Xtream Codes compatible status string
export function mapLineStatus(status: IptvLineStatus): 'Active' | 'Banned' | 'Disabled' | 'Expired' {
  const statusMap: Record<IptvLineStatus, 'Active' | 'Banned' | 'Disabled' | 'Expired'> = {
    active: 'Active',
    banned: 'Banned',
    disabled: 'Disabled',
    expired: 'Expired',
  };
  return statusMap[status];
}

// ============================================
// Registered User Types (Admin Panel)
// ============================================

// Registered user (admin/reseller) with hierarchy
export interface UserWithHierarchy extends User {
  children?: User[];
  parent?: User | null;
  _count?: {
    iptvLines: number;
    children: number;
  };
}

// Map UserRole to display string
export function mapUserRole(role: UserRole): 'admin' | 'reseller' | 'sub_reseller' {
  const roleMap: Record<UserRole, 'admin' | 'reseller' | 'sub_reseller'> = {
    ADMIN: 'admin',
    RESELLER: 'reseller',
    SUB_RESELLER: 'sub_reseller',
  };
  return roleMap[role];
}

// Map UserStatus for admin panel
export function mapUserStatus(status: UserStatus): 'Active' | 'Banned' | 'Disabled' | 'Expired' {
  const statusMap: Record<UserStatus, 'Active' | 'Banned' | 'Disabled' | 'Expired'> = {
    ACTIVE: 'Active',
    BANNED: 'Banned',
    DISABLED: 'Disabled',
    EXPIRED: 'Expired',
  };
  return statusMap[status];
}

// ============================================
// Utility Functions
// ============================================

export function formatUnixTimestamp(date: Date | string | null): string | null {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : new Date(date);
  return Math.floor(dateObj.getTime() / 1000).toString();
}

export function formatDateTime(date: Date | string): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toISOString().replace('T', ' ').slice(0, 19);
}

// Legacy alias for backwards compatibility
export type UserWithBouquets = IptvLineWithBouquets;
