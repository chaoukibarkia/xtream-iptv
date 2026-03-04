"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Globe,
  Server,
  Shield,
  Database,
  Mail,
  Save,
  RefreshCw,
  Tv,
  Film,
  Users,
  Key,
  Clock,
  HardDrive,
  Network,
  Bell,
  Loader2,
  AlertCircle,
  Check,
  HeartPulse,
  Activity,
  Cpu,
  MemoryStick,
  Volume2,
  MonitorPlay,
  Timer,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useSettings, useUpdateSettings, useReloadSettings, usePreviewLines, useTestPreviewLine } from "@/lib/api/hooks/useSettings";
import { 
  useHealthMonitorConfig, 
  useUpdateHealthMonitorConfig,
  type HealthCheckConfig 
} from "@/lib/api/hooks/useHealthMonitor";
import { useStreams } from "@/lib/api/hooks/useStreams";
import { Play, Eye } from "lucide-react";

// Language options for TMDB
const TMDB_LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es-ES", name: "Spanish (Spain)" },
  { code: "es-MX", name: "Spanish (Mexico)" },
  { code: "fr-FR", name: "French" },
  { code: "de-DE", name: "German" },
  { code: "it-IT", name: "Italian" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "pt-PT", name: "Portuguese (Portugal)" },
  { code: "nl-NL", name: "Dutch" },
  { code: "pl-PL", name: "Polish" },
  { code: "ru-RU", name: "Russian" },
  { code: "ja-JP", name: "Japanese" },
  { code: "ko-KR", name: "Korean" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "zh-TW", name: "Chinese (Traditional)" },
  { code: "ar-SA", name: "Arabic" },
  { code: "tr-TR", name: "Turkish" },
  { code: "hi-IN", name: "Hindi" },
];

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { data: serverSettings, isLoading, error, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const reloadSettings = useReloadSettings();
  const { data: previewLinesData } = usePreviewLines();
  const testPreviewLine = useTestPreviewLine();
  const { data: streamsData } = useStreams({ pageSize: 50 });

  // Preview line state
  const [previewLineUsername, setPreviewLineUsername] = useState("");
  const [previewLinePassword, setPreviewLinePassword] = useState("");
  const [testStreamId, setTestStreamId] = useState<number | undefined>(undefined);
  const [previewTestResult, setPreviewTestResult] = useState<any>(null);

  const [settings, setSettings] = useState({
    // General
    siteName: "IPTV Streaming",
    siteUrl: "https://iptv.example.com",
    adminEmail: "admin@example.com",
    timezone: "UTC",
    language: "en",
    
    // Streaming
    defaultStreamFormat: "hls",
    hlsSegmentDuration: 6,
    hlsPlaylistLength: 5,
    transcodeEnabled: true,
    maxBitrate: 8000,
    bufferSize: 32,
    
    // Preview Line
    previewLineUsername: "",
    previewLinePassword: "",
    
    // Users
    allowRegistration: false,
    defaultUserExpiry: 30,
    maxConnections: 2,
    trialEnabled: false,
    trialDuration: 24,
    
    // Security
    jwtExpiry: 24,
    requireHttps: true,
    rateLimitEnabled: true,
    rateLimitRequests: 100,
    ipBlocking: true,
    
    // Database
    dbHost: "localhost",
    dbPort: 5432,
    dbName: "iptv_db",
    dbBackupEnabled: true,
    dbBackupInterval: 24,
    
    // TMDB
    tmdbApiKey: "••••••••••••••••",
    tmdbAutoFetch: true,
    tmdbLanguage: "en-US",
    
    // EPG
    epgUpdateInterval: 12,
    epgSources: ["xmltv.xml"],
    epgCacheDuration: 24,
    
    // Notifications
    emailEnabled: false,
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",

    // Source Status Checker
    sourceCheckerEnabled: true,
    sourceCheckerIntervalMinutes: 30,
    sourceCheckerBatchSize: 50,
    sourceCheckerHttpTimeoutMs: 10000,
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState(settings);

  // Load settings from server
  useEffect(() => {
    if (serverSettings) {
      const newSettings = { ...settings };
      
      // Map server settings to local state
      if (serverSettings.general) {
        if (serverSettings.general.siteName) newSettings.siteName = serverSettings.general.siteName;
        if (serverSettings.general.siteUrl) newSettings.siteUrl = serverSettings.general.siteUrl;
        if (serverSettings.general.adminEmail) newSettings.adminEmail = serverSettings.general.adminEmail;
        if (serverSettings.general.timezone) newSettings.timezone = serverSettings.general.timezone;
        if (serverSettings.general.language) newSettings.language = serverSettings.general.language;
      }
      
      if (serverSettings.streaming) {
        if (serverSettings.streaming.defaultFormat) newSettings.defaultStreamFormat = serverSettings.streaming.defaultFormat;
        if (serverSettings.streaming.hlsSegmentDuration) newSettings.hlsSegmentDuration = serverSettings.streaming.hlsSegmentDuration;
        if (serverSettings.streaming.hlsPlaylistLength) newSettings.hlsPlaylistLength = serverSettings.streaming.hlsPlaylistLength;
        if (serverSettings.streaming.transcodeEnabled !== undefined) newSettings.transcodeEnabled = serverSettings.streaming.transcodeEnabled;
        if (serverSettings.streaming.maxBitrate) newSettings.maxBitrate = serverSettings.streaming.maxBitrate;
        if (serverSettings.streaming.bufferSize) newSettings.bufferSize = serverSettings.streaming.bufferSize;
        // Preview line settings
        if ((serverSettings.streaming as any).previewLineUsername) {
          newSettings.previewLineUsername = (serverSettings.streaming as any).previewLineUsername;
          setPreviewLineUsername((serverSettings.streaming as any).previewLineUsername);
        }
        if ((serverSettings.streaming as any).previewLinePassword) {
          newSettings.previewLinePassword = (serverSettings.streaming as any).previewLinePassword;
          setPreviewLinePassword((serverSettings.streaming as any).previewLinePassword);
        }
      }
      
      if (serverSettings.users) {
        if (serverSettings.users.allowRegistration !== undefined) newSettings.allowRegistration = serverSettings.users.allowRegistration;
        if (serverSettings.users.defaultExpiry) newSettings.defaultUserExpiry = serverSettings.users.defaultExpiry;
        if (serverSettings.users.maxConnections) newSettings.maxConnections = serverSettings.users.maxConnections;
        if (serverSettings.users.trialEnabled !== undefined) newSettings.trialEnabled = serverSettings.users.trialEnabled;
        if (serverSettings.users.trialDuration) newSettings.trialDuration = serverSettings.users.trialDuration;
      }
      
      if (serverSettings.security) {
        if (serverSettings.security.jwtExpiry) newSettings.jwtExpiry = serverSettings.security.jwtExpiry;
        if (serverSettings.security.requireHttps !== undefined) newSettings.requireHttps = serverSettings.security.requireHttps;
        if (serverSettings.security.rateLimitEnabled !== undefined) newSettings.rateLimitEnabled = serverSettings.security.rateLimitEnabled;
        if (serverSettings.security.rateLimitRequests) newSettings.rateLimitRequests = serverSettings.security.rateLimitRequests;
        if (serverSettings.security.ipBlocking !== undefined) newSettings.ipBlocking = serverSettings.security.ipBlocking;
      }
      
      if (serverSettings.tmdb) {
        if (serverSettings.tmdb.apiKey) newSettings.tmdbApiKey = serverSettings.tmdb.apiKey;
        if (serverSettings.tmdb.autoFetch !== undefined) newSettings.tmdbAutoFetch = serverSettings.tmdb.autoFetch;
        if (serverSettings.tmdb.language) newSettings.tmdbLanguage = serverSettings.tmdb.language;
      }
      
      if (serverSettings.epg) {
        if (serverSettings.epg.updateInterval) newSettings.epgUpdateInterval = serverSettings.epg.updateInterval;
        if (serverSettings.epg.cacheDuration) newSettings.epgCacheDuration = serverSettings.epg.cacheDuration;
      }
      
      if (serverSettings.notifications) {
        if (serverSettings.notifications.emailEnabled !== undefined) newSettings.emailEnabled = serverSettings.notifications.emailEnabled;
        if (serverSettings.notifications.smtpHost) newSettings.smtpHost = serverSettings.notifications.smtpHost;
        if (serverSettings.notifications.smtpPort) newSettings.smtpPort = serverSettings.notifications.smtpPort;
        if (serverSettings.notifications.smtpUser) newSettings.smtpUser = serverSettings.notifications.smtpUser;
      }

      if (serverSettings.sourceChecker) {
        if (serverSettings.sourceChecker.enabled !== undefined) newSettings.sourceCheckerEnabled = serverSettings.sourceChecker.enabled;
        if (serverSettings.sourceChecker.intervalMinutes) newSettings.sourceCheckerIntervalMinutes = serverSettings.sourceChecker.intervalMinutes;
        if (serverSettings.sourceChecker.batchSize) newSettings.sourceCheckerBatchSize = serverSettings.sourceChecker.batchSize;
        if (serverSettings.sourceChecker.httpTimeoutMs) newSettings.sourceCheckerHttpTimeoutMs = serverSettings.sourceChecker.httpTimeoutMs;
      }

      setSettings(newSettings);
      setOriginalSettings(newSettings);
      setHasChanges(false);
    }
  }, [serverSettings]);

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setSettings((prev) => {
      const updated = { ...prev, [field]: value };
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings));
      return updated;
    });
  };

  // Map local field names to server key format
  const fieldToServerKey: Record<string, string> = {
    siteName: "general.siteName",
    siteUrl: "general.siteUrl",
    adminEmail: "general.adminEmail",
    timezone: "general.timezone",
    language: "general.language",
    defaultStreamFormat: "streaming.defaultFormat",
    hlsSegmentDuration: "streaming.hlsSegmentDuration",
    hlsPlaylistLength: "streaming.hlsPlaylistLength",
    transcodeEnabled: "streaming.transcodeEnabled",
    maxBitrate: "streaming.maxBitrate",
    bufferSize: "streaming.bufferSize",
    previewLineUsername: "streaming.previewLineUsername",
    previewLinePassword: "streaming.previewLinePassword",
    allowRegistration: "users.allowRegistration",
    defaultUserExpiry: "users.defaultExpiry",
    maxConnections: "users.maxConnections",
    trialEnabled: "users.trialEnabled",
    trialDuration: "users.trialDuration",
    jwtExpiry: "security.jwtExpiry",
    requireHttps: "security.requireHttps",
    rateLimitEnabled: "security.rateLimitEnabled",
    rateLimitRequests: "security.rateLimitRequests",
    ipBlocking: "security.ipBlocking",
    tmdbApiKey: "tmdb.apiKey",
    tmdbAutoFetch: "tmdb.autoFetch",
    tmdbLanguage: "tmdb.language",
    epgUpdateInterval: "epg.updateInterval",
    epgCacheDuration: "epg.cacheDuration",
    emailEnabled: "notifications.emailEnabled",
    smtpHost: "notifications.smtpHost",
    smtpPort: "notifications.smtpPort",
    smtpUser: "notifications.smtpUser",
    sourceCheckerEnabled: "sourceChecker.enabled",
    sourceCheckerIntervalMinutes: "sourceChecker.intervalMinutes",
    sourceCheckerBatchSize: "sourceChecker.batchSize",
    sourceCheckerHttpTimeoutMs: "sourceChecker.httpTimeoutMs",
  };

  // Handle testing the preview line
  const handleTestPreviewLine = async (streamId?: number) => {
    setPreviewTestResult(null);
    try {
      const result = await testPreviewLine.mutateAsync({
        streamId,
        username: settings.previewLineUsername || undefined,
        password: settings.previewLinePassword || undefined
      });
      setPreviewTestResult(result);
      if (result.success) {
        toast({
          title: "Test Successful",
          description: result.message || "Preview line is configured correctly.",
        });
      } else {
        toast({
          title: "Test Failed",
          description: result.error || "Preview line test failed.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || "Test failed";
      setPreviewTestResult({ success: false, error: errorMessage });
      toast({
        title: "Test Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Select a line from the dropdown
  const handleSelectPreviewLine = (line: { username: string }) => {
    // When selecting a line, we need to also get the password
    // Since we can't expose passwords in the list, user must enter it manually
    setPreviewLineUsername(line.username);
    handleInputChange("previewLineUsername", line.username);
  };

  const handleSave = async () => {
    // Find changed settings and map to server keys
    const changedSettings: Record<string, string | number | boolean | string[]> = {};
    
    for (const [field, value] of Object.entries(settings)) {
      const originalValue = (originalSettings as any)[field];
      if (value !== originalValue && fieldToServerKey[field]) {
        changedSettings[fieldToServerKey[field]] = value as string | number | boolean | string[];
      }
    }

    if (Object.keys(changedSettings).length === 0) {
      toast({
        title: "No changes",
        description: "No settings have been modified.",
      });
      return;
    }

    try {
      await updateSettings.mutateAsync(changedSettings);
      setOriginalSettings(settings);
      setHasChanges(false);
      toast({
        title: "Settings saved",
        description: `${Object.keys(changedSettings).length} setting(s) updated successfully.`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReload = async () => {
    try {
      await reloadSettings.mutateAsync();
      await refetch();
      toast({
        title: "Settings reloaded",
        description: "Settings cache has been refreshed.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to reload settings.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load settings</h2>
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : 'Unable to connect to the server'}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Configure your IPTV server settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleReload}
            disabled={reloadSettings.isPending}
            className="flex-1 sm:flex-none"
          >
            {reloadSettings.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Reload
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!hasChanges || updateSettings.isPending}
            className="flex-1 sm:flex-none"
          >
            {updateSettings.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : hasChanges ? (
              <Save className="mr-2 h-4 w-4" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {hasChanges ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <div className="overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex min-w-full sm:w-full sm:grid sm:grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="streaming">Streaming</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>
        </div>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic configuration for your IPTV server
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={settings.siteName}
                    onChange={(e) => handleInputChange("siteName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siteUrl">Site URL</Label>
                  <Input
                    id="siteUrl"
                    value={settings.siteUrl}
                    onChange={(e) => handleInputChange("siteUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Admin Email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={settings.adminEmail}
                    onChange={(e) => handleInputChange("adminEmail", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {settings.timezone}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-64 overflow-y-auto">
                      {["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo"].map((tz) => (
                        <DropdownMenuItem key={tz} onClick={() => handleInputChange("timezone", tz)}>
                          {tz}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Streaming Settings */}
        <TabsContent value="streaming">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tv className="h-5 w-5" />
                Streaming Configuration
              </CardTitle>
              <CardDescription>
                Configure streaming and transcoding settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="defaultStreamFormat">Default Stream Format</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {settings.defaultStreamFormat.toUpperCase()}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleInputChange("defaultStreamFormat", "hls")}>
                        HLS
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleInputChange("defaultStreamFormat", "mpegts")}>
                        MPEG-TS
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleInputChange("defaultStreamFormat", "rtmp")}>
                        RTMP
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hlsSegmentDuration">HLS Segment Duration (seconds)</Label>
                  <Input
                    id="hlsSegmentDuration"
                    type="number"
                    value={settings.hlsSegmentDuration}
                    onChange={(e) => handleInputChange("hlsSegmentDuration", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hlsPlaylistLength">HLS Playlist Length</Label>
                  <Input
                    id="hlsPlaylistLength"
                    type="number"
                    value={settings.hlsPlaylistLength}
                    onChange={(e) => handleInputChange("hlsPlaylistLength", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxBitrate">Max Bitrate (kbps)</Label>
                  <Input
                    id="maxBitrate"
                    type="number"
                    value={settings.maxBitrate}
                    onChange={(e) => handleInputChange("maxBitrate", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bufferSize">Buffer Size (MB)</Label>
                  <Input
                    id="bufferSize"
                    type="number"
                    value={settings.bufferSize}
                    onChange={(e) => handleInputChange("bufferSize", parseInt(e.target.value))}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Transcoding</Label>
                  <p className="text-sm text-muted-foreground">
                    Transcode streams to HLS format on-the-fly
                  </p>
                </div>
                <Checkbox
                  checked={settings.transcodeEnabled}
                  onCheckedChange={(checked) => handleInputChange("transcodeEnabled", !!checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Preview Line Configuration */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Admin Preview Line
              </CardTitle>
              <CardDescription>
                Configure an IPTV line to use for previewing streams in the admin panel. 
                This line will be used when testing or playing streams directly from the admin interface.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="previewLineUsername">Line Username</Label>
                  <div className="flex gap-2">
                    <Input
                      id="previewLineUsername"
                      value={settings.previewLineUsername}
                      onChange={(e) => {
                        handleInputChange("previewLineUsername", e.target.value);
                        setPreviewLineUsername(e.target.value);
                      }}
                      placeholder="Enter username"
                    />
                    {previewLinesData?.lines && previewLinesData.lines.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Users className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          {previewLinesData.lines.map((line) => (
                            <DropdownMenuItem
                              key={line.id}
                              onClick={() => handleSelectPreviewLine(line)}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{line.username}</span>
                                <span className="text-xs text-muted-foreground">
                                  {line.bouquetCount} bouquets • {line.maxConnections} connections
                                </span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="previewLinePassword">Line Password</Label>
                  <Input
                    id="previewLinePassword"
                    type="password"
                    value={settings.previewLinePassword}
                    onChange={(e) => {
                      handleInputChange("previewLinePassword", e.target.value);
                      setPreviewLinePassword(e.target.value);
                    }}
                    placeholder="Enter password"
                  />
                </div>
              </div>

              <Separator />

              {/* Test Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Test Preview Line</Label>
                    <p className="text-sm text-muted-foreground">
                      Verify that the configured line is valid and can access streams
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleTestPreviewLine()}
                    disabled={testPreviewLine.isPending || !settings.previewLineUsername || !settings.previewLinePassword}
                  >
                    {testPreviewLine.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Validate Line
                  </Button>
                </div>

                {/* Test with specific stream */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="testStreamSelect">Test with Specific Stream</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {testStreamId 
                            ? (streamsData as any)?.streams?.find((s: any) => s.id === testStreamId)?.name || `Stream #${testStreamId}`
                            : "Select a stream to test..."
                          }
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-80 max-h-64 overflow-y-auto">
                        {(streamsData as any)?.streams?.map((stream: any) => (
                          <DropdownMenuItem
                            key={stream.id}
                            onClick={() => setTestStreamId(stream.id)}
                          >
                            <div className="flex items-center gap-2">
                              {stream.streamType === 'VOD' ? (
                                <Film className="h-4 w-4" />
                              ) : (
                                <Tv className="h-4 w-4" />
                              )}
                              <div className="flex flex-col">
                                <span>{stream.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {stream.streamType} • ID: {stream.id}
                                </span>
                              </div>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button
                    variant="default"
                    onClick={() => handleTestPreviewLine(testStreamId)}
                    disabled={testPreviewLine.isPending || !testStreamId || !settings.previewLineUsername || !settings.previewLinePassword}
                    className="mt-6"
                  >
                    {testPreviewLine.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Test Stream
                  </Button>
                </div>

                {/* Test Results */}
                {previewTestResult && (
                  <div className={`p-4 rounded-lg border ${previewTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                    <div className="flex items-start gap-3">
                      {previewTestResult.success ? (
                        <Check className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                      )}
                      <div className="flex-1 space-y-2">
                        <p className={`font-medium ${previewTestResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                          {previewTestResult.success ? previewTestResult.message : previewTestResult.error}
                        </p>
                        {previewTestResult.line && (
                          <div className="text-sm space-y-1">
                            <p><span className="font-medium">Username:</span> {previewTestResult.line.username}</p>
                            <p><span className="font-medium">Status:</span> {previewTestResult.line.status}</p>
                            {previewTestResult.line.bouquetCount !== undefined && (
                              <p><span className="font-medium">Bouquets:</span> {previewTestResult.line.bouquetCount}</p>
                            )}
                            {previewTestResult.line.maxConnections && (
                              <p><span className="font-medium">Max Connections:</span> {previewTestResult.line.maxConnections}</p>
                            )}
                          </div>
                        )}
                        {previewTestResult.stream && (
                          <div className="text-sm space-y-1 mt-2 pt-2 border-t border-current/10">
                            <p><span className="font-medium">Stream:</span> {previewTestResult.stream.name}</p>
                            <p className="text-xs font-mono break-all opacity-75">{previewTestResult.stream.url}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Source Status Checking */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Source Status Checking
              </CardTitle>
              <CardDescription>
                Automatically check stream sources to detect offline channels.
                The system will periodically check all LIVE stream sources and track their availability.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Source Checking</Label>
                  <p className="text-sm text-muted-foreground">
                    Periodically check all LIVE stream sources for availability
                  </p>
                </div>
                <Switch
                  checked={settings.sourceCheckerEnabled}
                  onCheckedChange={(checked) => handleInputChange("sourceCheckerEnabled", checked)}
                />
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sourceCheckerIntervalMinutes">Check Interval (minutes)</Label>
                  <Input
                    id="sourceCheckerIntervalMinutes"
                    type="number"
                    min={5}
                    max={1440}
                    value={settings.sourceCheckerIntervalMinutes}
                    onChange={(e) => handleInputChange("sourceCheckerIntervalMinutes", parseInt(e.target.value))}
                    disabled={!settings.sourceCheckerEnabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to check all stream sources (5-1440 minutes)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sourceCheckerHttpTimeoutMs">HTTP Timeout (milliseconds)</Label>
                  <Input
                    id="sourceCheckerHttpTimeoutMs"
                    type="number"
                    min={1000}
                    max={60000}
                    value={settings.sourceCheckerHttpTimeoutMs}
                    onChange={(e) => handleInputChange("sourceCheckerHttpTimeoutMs", parseInt(e.target.value))}
                    disabled={!settings.sourceCheckerEnabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    Timeout for each source URL check (1000-60000ms)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Settings */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management Settings
              </CardTitle>
              <CardDescription>
                Configure user registration and access settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="defaultUserExpiry">Default Account Expiry (days)</Label>
                  <Input
                    id="defaultUserExpiry"
                    type="number"
                    value={settings.defaultUserExpiry}
                    onChange={(e) => handleInputChange("defaultUserExpiry", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxConnections">Max Simultaneous Connections</Label>
                  <Input
                    id="maxConnections"
                    type="number"
                    value={settings.maxConnections}
                    onChange={(e) => handleInputChange("maxConnections", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trialDuration">Trial Duration (hours)</Label>
                  <Input
                    id="trialDuration"
                    type="number"
                    value={settings.trialDuration}
                    onChange={(e) => handleInputChange("trialDuration", parseInt(e.target.value))}
                    disabled={!settings.trialEnabled}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Allow Registration</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow new users to register on the portal
                    </p>
                  </div>
                  <Checkbox
                    checked={settings.allowRegistration}
                    onCheckedChange={(checked) => handleInputChange("allowRegistration", !!checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Trial Accounts</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow users to create trial accounts
                    </p>
                  </div>
                  <Checkbox
                    checked={settings.trialEnabled}
                    onCheckedChange={(checked) => handleInputChange("trialEnabled", !!checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure security and authentication settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="jwtExpiry">JWT Token Expiry (hours)</Label>
                  <Input
                    id="jwtExpiry"
                    type="number"
                    value={settings.jwtExpiry}
                    onChange={(e) => handleInputChange("jwtExpiry", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rateLimitRequests">Rate Limit (requests/min)</Label>
                  <Input
                    id="rateLimitRequests"
                    type="number"
                    value={settings.rateLimitRequests}
                    onChange={(e) => handleInputChange("rateLimitRequests", parseInt(e.target.value))}
                    disabled={!settings.rateLimitEnabled}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require HTTPS</Label>
                    <p className="text-sm text-muted-foreground">
                      Force all connections to use HTTPS
                    </p>
                  </div>
                  <Checkbox
                    checked={settings.requireHttps}
                    onCheckedChange={(checked) => handleInputChange("requireHttps", !!checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Rate Limiting</Label>
                    <p className="text-sm text-muted-foreground">
                      Limit API requests per IP address
                    </p>
                  </div>
                  <Checkbox
                    checked={settings.rateLimitEnabled}
                    onCheckedChange={(checked) => handleInputChange("rateLimitEnabled", !!checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>IP Blocking</Label>
                    <p className="text-sm text-muted-foreground">
                      Block suspicious IP addresses automatically
                    </p>
                  </div>
                  <Checkbox
                    checked={settings.ipBlocking}
                    onCheckedChange={(checked) => handleInputChange("ipBlocking", !!checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Database Settings */}
        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Configuration
              </CardTitle>
              <CardDescription>
                Configure database connection and backup settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dbHost">Database Host</Label>
                  <Input
                    id="dbHost"
                    value={settings.dbHost}
                    onChange={(e) => handleInputChange("dbHost", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dbPort">Database Port</Label>
                  <Input
                    id="dbPort"
                    type="number"
                    value={settings.dbPort}
                    onChange={(e) => handleInputChange("dbPort", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dbName">Database Name</Label>
                  <Input
                    id="dbName"
                    value={settings.dbName}
                    onChange={(e) => handleInputChange("dbName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dbBackupInterval">Backup Interval (hours)</Label>
                  <Input
                    id="dbBackupInterval"
                    type="number"
                    value={settings.dbBackupInterval}
                    onChange={(e) => handleInputChange("dbBackupInterval", parseInt(e.target.value))}
                    disabled={!settings.dbBackupEnabled}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Automatic Backups</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically backup the database at regular intervals
                  </p>
                </div>
                <Checkbox
                  checked={settings.dbBackupEnabled}
                  onCheckedChange={(checked) => handleInputChange("dbBackupEnabled", !!checked)}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline">
                  <HardDrive className="mr-2 h-4 w-4" />
                  Backup Now
                </Button>
                <Button variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Restore Backup
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Settings */}
        <TabsContent value="integrations">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Film className="h-5 w-5" />
                  TMDB Integration
                </CardTitle>
                <CardDescription>
                  Configure The Movie Database integration for metadata
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tmdbApiKey">API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        id="tmdbApiKey"
                        type="password"
                        value={settings.tmdbApiKey}
                        onChange={(e) => handleInputChange("tmdbApiKey", e.target.value)}
                      />
                      <Button variant="outline">
                        <Key className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get your API key from{" "}
                      <a 
                        href="https://www.themoviedb.org/settings/api" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        themoviedb.org
                      </a>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tmdbLanguage">Language</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {TMDB_LANGUAGES.find(l => l.code === settings.tmdbLanguage)?.name || settings.tmdbLanguage}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="max-h-64 overflow-y-auto">
                        {TMDB_LANGUAGES.map((lang) => (
                          <DropdownMenuItem 
                            key={lang.code} 
                            onClick={() => handleInputChange("tmdbLanguage", lang.code)}
                          >
                            {lang.name} ({lang.code})
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <p className="text-xs text-muted-foreground">
                      Language for movie/TV show metadata from TMDB
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-fetch Metadata</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically fetch metadata for new VOD content
                    </p>
                  </div>
                  <Checkbox
                    checked={settings.tmdbAutoFetch}
                    onCheckedChange={(checked) => handleInputChange("tmdbAutoFetch", !!checked)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  EPG Settings
                </CardTitle>
                <CardDescription>
                  Configure Electronic Program Guide settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="epgUpdateInterval">Update Interval (hours)</Label>
                    <Input
                      id="epgUpdateInterval"
                      type="number"
                      value={settings.epgUpdateInterval}
                      onChange={(e) => handleInputChange("epgUpdateInterval", parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="epgCacheDuration">Cache Duration (hours)</Label>
                    <Input
                      id="epgCacheDuration"
                      type="number"
                      value={settings.epgCacheDuration}
                      onChange={(e) => handleInputChange("epgCacheDuration", parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Update EPG Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Configure email and notification settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send email notifications for important events
                  </p>
                </div>
                <Checkbox
                  checked={settings.emailEnabled}
                  onCheckedChange={(checked) => handleInputChange("emailEnabled", !!checked)}
                />
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtpHost">SMTP Host</Label>
                  <Input
                    id="smtpHost"
                    value={settings.smtpHost}
                    onChange={(e) => handleInputChange("smtpHost", e.target.value)}
                    disabled={!settings.emailEnabled}
                    placeholder="smtp.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort">SMTP Port</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    value={settings.smtpPort}
                    onChange={(e) => handleInputChange("smtpPort", parseInt(e.target.value))}
                    disabled={!settings.emailEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpUser">SMTP Username</Label>
                  <Input
                    id="smtpUser"
                    value={settings.smtpUser}
                    onChange={(e) => handleInputChange("smtpUser", e.target.value)}
                    disabled={!settings.emailEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPassword">SMTP Password</Label>
                  <Input
                    id="smtpPassword"
                    type="password"
                    disabled={!settings.emailEnabled}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button variant="outline" disabled={!settings.emailEnabled}>
                <Mail className="mr-2 h-4 w-4" />
                Send Test Email
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Monitoring Settings */}
        <TabsContent value="health">
          <HealthMonitorSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Health Monitor Settings Component
function HealthMonitorSettings() {
  const { toast } = useToast();
  const { data: configData, isLoading, error, refetch } = useHealthMonitorConfig();
  const updateConfig = useUpdateHealthMonitorConfig();
  
  const [localConfig, setLocalConfig] = useState<Partial<HealthCheckConfig>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize local config when data loads
  useEffect(() => {
    if (configData?.config) {
      setLocalConfig(configData.config);
      setHasChanges(false);
    }
  }, [configData]);

  const handleChange = <K extends keyof HealthCheckConfig>(
    key: K,
    value: HealthCheckConfig[K]
  ) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync(localConfig);
      setHasChanges(false);
      toast({
        title: "Settings saved",
        description: "Health monitor configuration updated successfully.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to save health monitor settings.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    if (configData?.config) {
      setLocalConfig(configData.config);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold">Failed to load health monitor config</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {error instanceof Error ? error.message : 'Unable to connect'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const config = localConfig;

  return (
    <div className="space-y-6">
      {/* Save/Reset buttons */}
      {hasChanges && (
        <div className="flex justify-end gap-2 sticky top-0 z-10 bg-background py-2">
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      )}

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Health Check Features
          </CardTitle>
          <CardDescription>
            Enable or disable specific health monitoring features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Activity className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-0.5">
                  <Label className="text-base">HTTP Reachability Checks</Label>
                  <p className="text-sm text-muted-foreground">
                    Check if stream source URLs are accessible
                  </p>
                </div>
              </div>
              <Switch
                checked={config.enableHttpChecks ?? true}
                onCheckedChange={(checked) => handleChange("enableHttpChecks", checked)}
              />
            </div>

            <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Cpu className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-0.5">
                  <Label className="text-base">Process Metrics Monitoring</Label>
                  <p className="text-sm text-muted-foreground">
                    Monitor FFmpeg CPU and memory usage
                  </p>
                </div>
              </div>
              <Switch
                checked={config.enableProcessMetrics ?? true}
                onCheckedChange={(checked) => handleChange("enableProcessMetrics", checked)}
              />
            </div>

            <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <MonitorPlay className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-0.5">
                  <Label className="text-base">Frozen Video Detection</Label>
                  <p className="text-sm text-muted-foreground">
                    Detect when video stream frames stop updating
                  </p>
                </div>
              </div>
              <Switch
                checked={config.enableFrozenChecks ?? true}
                onCheckedChange={(checked) => handleChange("enableFrozenChecks", checked)}
              />
            </div>

            <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Volume2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-0.5">
                  <Label className="text-base">Silent Audio Detection</Label>
                  <p className="text-sm text-muted-foreground">
                    Detect when audio track becomes silent
                  </p>
                </div>
              </div>
              <Switch
                checked={config.enableAudioChecks ?? true}
                onCheckedChange={(checked) => handleChange("enableAudioChecks", checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timing Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Timing & Intervals
          </CardTitle>
          <CardDescription>
            Configure how often health checks run and timeout values
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="checkInterval">Health Check Interval</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {((config.checkIntervalMs ?? 30000) / 1000).toFixed(0)}s
                </span>
              </div>
              <Slider
                id="checkInterval"
                min={10000}
                max={300000}
                step={5000}
                value={[config.checkIntervalMs ?? 30000]}
                onValueChange={([value]) => handleChange("checkIntervalMs", value)}
              />
              <p className="text-xs text-muted-foreground">
                How often to check stream health (10s - 5min)
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="probeTimeout">Probe Timeout</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {((config.probeTimeoutMs ?? 15000) / 1000).toFixed(0)}s
                </span>
              </div>
              <Slider
                id="probeTimeout"
                min={5000}
                max={60000}
                step={1000}
                value={[config.probeTimeoutMs ?? 15000]}
                onValueChange={([value]) => handleChange("probeTimeoutMs", value)}
              />
              <p className="text-xs text-muted-foreground">
                Timeout for FFmpeg probe operations (5s - 60s)
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="restartCooldown">Restart Cooldown</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {((config.restartCooldownMs ?? 60000) / 1000).toFixed(0)}s
                </span>
              </div>
              <Slider
                id="restartCooldown"
                min={30000}
                max={600000}
                step={10000}
                value={[config.restartCooldownMs ?? 60000]}
                onValueChange={([value]) => handleChange("restartCooldownMs", value)}
              />
              <p className="text-xs text-muted-foreground">
                Minimum time between automatic restarts (30s - 10min)
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="maxFailures">Max Consecutive Failures</Label>
              <Input
                id="maxFailures"
                type="number"
                min={1}
                max={10}
                value={config.maxConsecutiveFailures ?? 3}
                onChange={(e) => handleChange("maxConsecutiveFailures", parseInt(e.target.value) || 3)}
              />
              <p className="text-xs text-muted-foreground">
                Number of failed checks before triggering restart
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MemoryStick className="h-5 w-5" />
            Resource Thresholds
          </CardTitle>
          <CardDescription>
            Set limits for FFmpeg process resource usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="memoryThreshold">Memory Threshold</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {config.memoryThresholdMb ?? 2048} MB
                </span>
              </div>
              <Slider
                id="memoryThreshold"
                min={512}
                max={8192}
                step={256}
                value={[config.memoryThresholdMb ?? 2048]}
                onValueChange={([value]) => handleChange("memoryThresholdMb", value)}
              />
              <p className="text-xs text-muted-foreground">
                Restart stream if FFmpeg memory exceeds this limit
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="cpuThreshold">CPU Alert Threshold</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {config.cpuThresholdPercent ?? 90}%
                </span>
              </div>
              <Slider
                id="cpuThreshold"
                min={50}
                max={100}
                step={5}
                value={[config.cpuThresholdPercent ?? 90]}
                onValueChange={([value]) => handleChange("cpuThresholdPercent", value)}
              />
              <p className="text-xs text-muted-foreground">
                Log warning when CPU usage exceeds this threshold
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audio/Video Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Audio & Video Detection
          </CardTitle>
          <CardDescription>
            Configure thresholds for detecting audio silence and frozen video
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="silentDuration">Silent Audio Detection Duration</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {config.silentDetectionDuration ?? 10}s
                </span>
              </div>
              <Slider
                id="silentDuration"
                min={5}
                max={60}
                step={5}
                value={[config.silentDetectionDuration ?? 10]}
                onValueChange={([value]) => handleChange("silentDetectionDuration", value)}
                disabled={!config.enableAudioChecks}
              />
              <p className="text-xs text-muted-foreground">
                Duration to analyze for detecting silent audio
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="silentThreshold">Silent Audio Threshold</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {config.silentAudioThresholdDb ?? -60} dB
                </span>
              </div>
              <Slider
                id="silentThreshold"
                min={-80}
                max={-30}
                step={5}
                value={[config.silentAudioThresholdDb ?? -60]}
                onValueChange={([value]) => handleChange("silentAudioThresholdDb", value)}
                disabled={!config.enableAudioChecks}
              />
              <p className="text-xs text-muted-foreground">
                Audio below this level is considered silent
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="frozenDuration">Frozen Video Detection Duration</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {config.frozenDetectionDuration ?? 5}s
                </span>
              </div>
              <Slider
                id="frozenDuration"
                min={2}
                max={30}
                step={1}
                value={[config.frozenDetectionDuration ?? 5]}
                onValueChange={([value]) => handleChange("frozenDetectionDuration", value)}
                disabled={!config.enableFrozenChecks}
              />
              <p className="text-xs text-muted-foreground">
                Duration to analyze for detecting frozen video frames
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="frozenThreshold">Frozen Frame Threshold</Label>
              <Input
                id="frozenThreshold"
                type="number"
                step={0.0001}
                min={0.0001}
                max={0.1}
                value={config.frozenFrameThreshold ?? 0.001}
                onChange={(e) => handleChange("frozenFrameThreshold", parseFloat(e.target.value) || 0.001)}
                disabled={!config.enableFrozenChecks}
              />
              <p className="text-xs text-muted-foreground">
                Frame difference below this value indicates frozen video (0.0001 - 0.1)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
