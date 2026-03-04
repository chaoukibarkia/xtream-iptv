// IPTV Line Types (subscribers who watch streams)
export interface IptvLine {
  id: number;
  username: string;
  password: string;
  maxConnections: number;
  activeConnections?: number;
  expiresAt: string | null;
  status: 'active' | 'expired' | 'disabled' | 'banned';
  isTrial: boolean;
  ownerId?: number;
  owner?: User;
  bouquets?: Array<{ bouquetId: number; id?: number; bouquet?: Bouquet } | Bouquet>;
  createdAt: string;
  updatedAt: string;
  lastActivity?: string;
  
  // Notes
  adminNotes?: string;
  resellerNotes?: string;
  
  // Advanced settings
  forcedServerId?: number;
  isMinistraPortal?: boolean;
  isRestreamer?: boolean;
  isEnigmaDevice?: boolean;
  isMagDevice?: boolean;
  magStbLock?: string;
  ispLock?: boolean;
  ispDescription?: string;
  forcedCountry?: string;
  
  // Access output formats
  allowHls?: boolean;
  allowMpegts?: boolean;
  allowRtmp?: boolean;
  
  // Restrictions
  allowedIps?: string[];
  allowedUserAgents?: string[];
}

export type IptvLineStatus = 'active' | 'expired' | 'disabled' | 'banned';

// User Types (admins and resellers who manage the system)
export interface User {
  id: number;
  username: string;
  email?: string;
  password?: string;
  role: UserRole;
  status: UserStatus;
  credits?: number;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
  lastActivity?: string;
  createdLines?: IptvLine[];
  _count?: {
    iptvLines?: number;
    children?: number;
  };
}

export type OutputFormat = "m3u8" | "ts" | "rtmp";

export type UserStatus = "ACTIVE" | "DISABLED" | "BANNED";

// Legacy type for backwards compatibility
export interface Reseller {
  id: number;
  username: string;
  email?: string;
  credits: number;
  totalUsers: number;
  activeUsers: number;
  createdAt: string;
}

// Stream Types
export interface Stream {
  id: number;
  name: string;
  streamType: StreamType;
  categoryId: number;
  category?: Category;
  sourceUrl: string;
  backupUrls: string[];
  logoUrl?: string;
  epgChannelId?: string;
  isActive: boolean;
  alwaysOn?: boolean;
  health: number;
  transcodeProfile?: string;
  transcodeProfileId?: number;
  transcodingProfile?: TranscodingProfile;
  transcodeServerId?: number;
  abrProfileId?: number;
  abrProfile?: AbrProfile;
  tvArchiveEnabled: boolean;
  tvArchiveDuration?: number;
  customUserAgent?: string;
  customHeaders?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  tmdbId?: number;
  tmdbData?: TmdbMovie | TmdbSeries;
  serverAssignments?: ServerAssignment[];
}

export interface ServerAssignment {
  id: number;
  serverId: number;
  streamId: number;
  isActive: boolean;
  priority: number;
  server: {
    id: number;
    name: string;
    domain?: string;
    status: string;
    region?: string;
    type?: string;
  };
}

export type StreamType = "LIVE" | "VOD" | "SERIES" | "RADIO";

// Category Types
export interface Category {
  id: number;
  name: string;
  type: StreamType;
  parentId?: number;
  order: number;
  isActive: boolean;
  streamCount: number;
}

// Bouquet Types
export interface Bouquet {
  id: number;
  name: string;
  description?: string;
  categories: Category[];
  streams: Stream[];
  isActive: boolean;
  createdAt: string;
}

// Server Types
export interface Server {
  id: number;
  name: string;
  hostname: string;
  port: number;
  status: ServerStatus;
  region: string;
  countryCode: string;
  cpuUsage: number;
  memoryUsage: number;
  bandwidthUsage: number;
  maxBandwidth: number;
  activeConnections: number;
  maxConnections: number;
  streamCount: number;
  uptime: number;
  isMainServer: boolean;
  createdAt: string;
  lastHealthCheck: string;
}

export type ServerStatus = "online" | "offline" | "degraded" | "maintenance";

// Transcoding Profile Types
export type EncodingMode = "SOFTWARE" | "NVENC" | "QSV" | "VAAPI" | "PASSTHROUGH";

export interface TranscodingProfile {
  id: number;
  name: string;
  description?: string;
  
  // Encoding mode
  encodingMode: EncodingMode;
  
  // Video settings
  videoCodec: string;
  videoPreset: string;
  videoBitrate?: number;
  videoBitrateMode: "cbr" | "vbr" | "crf";
  crfValue?: number;
  maxBitrate?: number;
  bufferSize?: number;
  
  // Resolution
  resolutionWidth?: number;
  resolutionHeight?: number;
  resolutionPreset?: "480p" | "720p" | "1080p" | "4k" | "original";
  scalingAlgorithm: string;
  
  // Frame rate
  frameRate?: number;
  frameRateMode: "cfr" | "vfr" | "passthrough";
  
  // GOP
  gopSize: number;
  bFrames: number;
  
  // Audio settings
  audioCodec: string;
  audioBitrate: number;
  audioSampleRate: number;
  audioChannels: number;
  
  // NVENC
  nvencEnabled: boolean;
  nvencPreset?: string;
  nvencRcMode?: string;
  nvencTuning?: string;
  nvencBFrames?: number;
  nvencLookahead?: number;
  
  // QSV
  qsvEnabled: boolean;
  qsvPreset?: string;
  
  // VAAPI
  vaapiEnabled: boolean;
  vaapiDevice?: string;
  
  // Additional
  additionalParams?: string;
  customUserAgent?: string;
  isDefault: boolean;
  isActive: boolean;
  requiresGpu: boolean;
  estimatedCpuLoad: number;
  
  // Counts
  streamCount?: number;
  
  createdAt: string;
  updatedAt: string;
}

export interface ServerCapabilities {
  id: number;
  name: string;
  status: ServerStatus;
  hasNvenc: boolean;
  nvencGpuModel?: string;
  nvencMaxSessions: number;
  hasQsv: boolean;
  qsvModel?: string;
  hasVaapi: boolean;
  vaapiDevice?: string;
  currentTranscodes: number;
  maxTranscodes: number;
  cpuUsage: number;
  memoryUsage: number;
}

// ABR (Adaptive Bitrate) Profile Types
export interface AbrVariant {
  name: string;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  maxBitrate?: number;
}

export interface AbrProfile {
  id: number;
  name: string;
  description?: string;
  
  // Encoding mode
  encodingMode: EncodingMode;
  
  // Quality variants (parsed from JSON)
  variants: AbrVariant[] | string;
  
  // Audio settings
  audioCodec: string;
  audioSampleRate: number;
  audioChannels: number;
  
  // Video settings
  videoCodec: string;
  videoPreset: string;
  gopSize: number;
  bFrames: number;
  frameRateMode: string;
  
  // HLS specific
  hlsSegmentDuration: number;
  hlsPlaylistSize: number;
  hlsDeleteThreshold: number;
  
  // Hardware acceleration
  nvencEnabled: boolean;
  nvencPreset?: string;
  qsvEnabled: boolean;
  vaapiEnabled: boolean;
  vaapiDevice?: string;
  
  // Additional
  additionalParams?: string;
  isDefault: boolean;
  isActive: boolean;
  requiresGpu: boolean;
  estimatedCpuLoad: number;
  
  // Counts
  streamCount?: number;
  
  createdAt: string;
  updatedAt: string;
}

// EPG Types
export interface EpgProgram {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  category?: string;
  icon?: string;
}

export interface EpgChannel {
  id: string;
  name: string;
  icon?: string;
  programs: EpgProgram[];
}

// TMDB Types
export interface TmdbMovie {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate: string;
  runtime?: number;
  voteAverage: number;
  voteCount: number;
  genres: TmdbGenre[];
  cast: TmdbCast[];
  crew: TmdbCrew[];
  trailerUrl?: string;
}

export interface TmdbSeries {
  id: number;
  name: string;
  originalName: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  firstAirDate: string;
  lastAirDate?: string;
  numberOfSeasons: number;
  numberOfEpisodes: number;
  voteAverage: number;
  voteCount: number;
  genres: TmdbGenre[];
  cast: TmdbCast[];
  crew: TmdbCrew[];
  seasons: TmdbSeason[];
  status: string;
}

export interface TmdbSeason {
  id: number;
  seasonNumber: number;
  name: string;
  overview?: string;
  posterPath?: string;
  airDate?: string;
  episodeCount: number;
  episodes?: TmdbEpisode[];
}

export interface TmdbEpisode {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview?: string;
  stillPath?: string;
  airDate?: string;
  runtime?: number;
  voteAverage: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCast {
  id: number;
  name: string;
  character: string;
  profilePath?: string;
}

export interface TmdbCrew {
  id: number;
  name: string;
  job: string;
  department: string;
  profilePath?: string;
}

// VOD Types
export interface VodItem {
  id: number;
  stream: Stream;
  tmdbData?: TmdbMovie;
  addedAt: string;
  views: number;
  viewerCount?: number;
}

// Alias for VOD
export type VOD = VodItem;

// Series Types
export interface SeriesItem {
  id: number;
  name: string;
  categoryId: number;
  category?: Category;
  tmdbId?: number;
  tmdbData?: TmdbSeries;
  seasons: SeriesSeason[];
  isActive: boolean;
  createdAt: string;
}

export interface SeriesSeason {
  id: number;
  seriesId: number;
  seasonNumber: number;
  name: string;
  episodes: SeriesEpisode[];
}

export interface SeriesEpisode {
  id: number;
  seasonId: number;
  episodeNumber: number;
  name: string;
  overview?: string;
  sourceUrl?: string;
  isAvailable: boolean;
  airDate?: string;
  runtime?: number;
  tmdbEpisodeId?: number;
}

// Dashboard Stats
export interface DashboardStats {
  activeConnections: number;
  totalUsers: number;
  activeUsers: number;
  onlineStreams: number;
  totalStreams: number;
  bandwidthUsage: number;
  serverCount: number;
  onlineServers: number;
  connectionsTrend: number;
  usersTrend: number;
  vodCount: number;
  seriesCount: number;
}

export interface ConnectionHistory {
  timestamp: string;
  connections: number;
}

// Active Connection Types
export type ContentType = 'LIVE' | 'VOD' | 'SERIES' | 'RADIO';

export type ServerType = 'MAIN' | 'LOAD_BALANCER' | 'EDGE_STREAMER' | 'TRANSCODER';

export interface ActiveConnection {
  id: string;
  lineId: number;
  username: string;
  streamId: number;
  ipAddress: string;
  userAgent: string | null;
  countryCode: string | null;
  startedAt: string;
  contentType: ContentType;
  contentName: string | null;
  episodeId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  isHls: boolean;
  serverId: number | null;
  serverName: string | null;
  serverType: ServerType | null;
}

export interface ConnectionSummary {
  total: number;
  uniqueUsers: number;
  byContentType: Record<ContentType, number>;
  byCountry: Record<string, number>;
  byServer: Record<string, number>;
  recentConnections: ActiveConnection[];
}

export interface ActivityLog {
  id: number;
  type: ActivityType;
  message: string;
  userId?: number;
  username?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type ActivityType =
  | "user_created"
  | "user_login"
  | "user_logout"
  | "stream_added"
  | "stream_removed"
  | "server_added"
  | "server_offline"
  | "vod_synced"
  | "epg_updated"
  | "system_error";

// API Response Types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}

// Auth Types
export type AuthRole = "admin" | "reseller" | "sub_reseller";

export interface AuthUser {
  id: number;
  username: string;
  password: string;
  email?: string;
  role: AuthRole;
  token: string;
  expiresAt: string;
}

export type UserRole = "ADMIN" | "RESELLER" | "SUB_RESELLER";

// Player Types
export interface PlaybackState {
  streamId: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  quality: string;
  availableQualities: string[];
}

export interface WatchProgress {
  streamId: number;
  progress: number;
  duration: number;
  lastWatched: string;
}
