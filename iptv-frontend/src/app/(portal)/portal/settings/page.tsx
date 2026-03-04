"use client";

import React, { useState } from "react";
import {
  User,
  Bell,
  Shield,
  Monitor,
  Globe,
  Palette,
  Volume2,
  Subtitles,
  Clock,
  HelpCircle,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { usePlayerStore } from "@/stores/playerStore";

export default function SettingsPage() {
  const { theme, setTheme } = useUIStore();
  const { user, logout } = useAuthStore();
  const { defaultQuality, setDefaultQuality, autoPlay, setAutoPlay, defaultVolume, setDefaultVolume } = usePlayerStore();

  const [formData, setFormData] = useState({
    name: user?.username || "John Doe",
    email: "john.doe@example.com",
    language: "English",
    timezone: "UTC-5 (Eastern Time)",
    subtitles: true,
    autoNext: true,
    notifications: {
      newContent: true,
      recommendations: false,
      systemUpdates: true,
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (field: string, value: boolean) => {
    setFormData((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [field]: value },
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account settings and preferences
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="w-full flex flex-wrap sm:flex-nowrap gap-2 overflow-x-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="playback">Playback</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
          </TabsList>

          {/* Profile Settings */}
          <TabsContent value="profile">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Profile Information
                  </CardTitle>
                  <CardDescription>
                    Update your personal information and account details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Display Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="language">Language</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            {formData.language}
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleInputChange("language", "English")}>
                            English
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInputChange("language", "Spanish")}>
                            Spanish
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInputChange("language", "French")}>
                            French
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInputChange("language", "German")}>
                            German
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            {formData.timezone}
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleInputChange("timezone", "UTC-8 (Pacific Time)")}>
                            UTC-8 (Pacific Time)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInputChange("timezone", "UTC-5 (Eastern Time)")}>
                            UTC-5 (Eastern Time)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInputChange("timezone", "UTC+0 (GMT)")}>
                            UTC+0 (GMT)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInputChange("timezone", "UTC+1 (CET)")}>
                            UTC+1 (CET)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button>Save Changes</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Subscription
                  </CardTitle>
                  <CardDescription>
                    View and manage your subscription
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Premium Plan</p>
                      <p className="text-sm text-muted-foreground">
                        Valid until December 31, 2024
                      </p>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Playback Settings */}
          <TabsContent value="playback">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Video Quality
                  </CardTitle>
                  <CardDescription>
                    Adjust video streaming quality settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label>Default Video Quality</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {["auto", "1080p", "720p", "480p"].map((quality) => (
                        <Button
                          key={quality}
                          variant={defaultQuality === quality ? "default" : "outline"}
                          className="w-full"
                          onClick={() => setDefaultQuality(quality as "auto" | "1080p" | "720p" | "480p" | "360p")}
                        >
                          {quality === "auto" ? "Auto" : quality}
                        </Button>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Auto will select the best quality based on your connection speed
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Auto-play Next Episode</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically play the next episode in a series
                      </p>
                    </div>
                    <Checkbox
                      checked={autoPlay}
                      onCheckedChange={(checked) => setAutoPlay(checked as boolean)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-5 w-5" />
                    Audio Settings
                  </CardTitle>
                  <CardDescription>
                    Configure audio preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Default Volume</Label>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(defaultVolume * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[defaultVolume * 100]}
                      onValueChange={(value) => setDefaultVolume(value[0] / 100)}
                      max={100}
                      step={1}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Subtitles className="h-5 w-5" />
                    Subtitles & Captions
                  </CardTitle>
                  <CardDescription>
                    Configure subtitle preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Show Subtitles by Default</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable subtitles when available
                      </p>
                    </div>
                    <Checkbox
                      checked={formData.subtitles}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, subtitles: checked as boolean }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Preferred Subtitle Language</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          English
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem>English</DropdownMenuItem>
                        <DropdownMenuItem>Spanish</DropdownMenuItem>
                        <DropdownMenuItem>French</DropdownMenuItem>
                        <DropdownMenuItem>German</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Appearance Settings */}
          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Theme
                </CardTitle>
                <CardDescription>
                  Customize the look and feel of the application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label>Color Theme</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      className="flex flex-col items-center gap-2 h-auto py-4"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="h-6 w-6" />
                      <span>Light</span>
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      className="flex flex-col items-center gap-2 h-auto py-4"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="h-6 w-6" />
                      <span>Dark</span>
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      className="flex flex-col items-center gap-2 h-auto py-4"
                      onClick={() => setTheme("system")}
                    >
                      <Monitor className="h-6 w-6" />
                      <span>System</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>New Content Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when new movies or episodes are available
                    </p>
                  </div>
                  <Checkbox
                    checked={formData.notifications.newContent}
                    onCheckedChange={(checked) =>
                      handleNotificationChange("newContent", checked as boolean)
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Personalized Recommendations</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive recommendations based on your watch history
                    </p>
                  </div>
                  <Checkbox
                    checked={formData.notifications.recommendations}
                    onCheckedChange={(checked) =>
                      handleNotificationChange("recommendations", checked as boolean)
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>System Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Important updates about the service
                    </p>
                  </div>
                  <Checkbox
                    checked={formData.notifications.systemUpdates}
                    onCheckedChange={(checked) =>
                      handleNotificationChange("systemUpdates", checked as boolean)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy Settings */}
          <TabsContent value="privacy">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Watch History
                  </CardTitle>
                  <CardDescription>
                    Manage your viewing history
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Your watch history is used to provide personalized recommendations
                    and resume playback functionality.
                  </p>
                  <Button variant="destructive">Clear Watch History</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Data & Privacy
                  </CardTitle>
                  <CardDescription>
                    Manage your data and privacy settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button variant="outline" className="w-full justify-between">
                    Download My Data
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between text-destructive">
                    Delete Account
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5" />
                    Help & Support
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-between">
                    Help Center
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between">
                    Contact Support
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between">
                    Terms of Service
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between">
                    Privacy Policy
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <Button
                    variant="outline"
                    className="w-full text-destructive"
                    onClick={logout}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
