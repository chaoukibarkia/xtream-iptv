"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  Share,
  Info,
  MessageSquare,
  SkipBack,
  SkipForward,
  List,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import VideoPlayer from "@/components/player/video-player";
import { usePlayerStore } from "@/stores/playerStore";

// Local types for mock data
interface EpgProgram {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  category?: string;
}

interface MockChannel {
  id: string;
  name: string;
  type: string;
  categoryId: string;
  streamUrl: string;
  logoUrl?: string;
  backdropUrl?: string;
  epgChannelId?: string;
  isActive: boolean;
}

// Mock current program data
const mockCurrentProgram: EpgProgram = {
  id: "1",
  channelId: "cnn.us",
  title: "CNN Newsroom Live",
  description: "Live coverage of breaking news from around the world. Stay informed with up-to-the-minute reporting and analysis.",
  start: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // Started 30 min ago
  stop: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // Ends in 30 min
  category: "News",
};

const mockUpcomingPrograms: EpgProgram[] = [
  {
    id: "2",
    channelId: "cnn.us",
    title: "Anderson Cooper 360",
    description: "In-depth reporting and analysis of the day's biggest stories.",
    start: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    stop: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    category: "News",
  },
  {
    id: "3",
    channelId: "cnn.us",
    title: "The Situation Room",
    description: "Wolf Blitzer brings you breaking news, expert analysis.",
    start: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    stop: new Date(Date.now() + 150 * 60 * 1000).toISOString(),
    category: "News",
  },
];

// Mock channel data
const mockChannel: MockChannel = {
  id: "1",
  name: "CNN",
  type: "live",
  categoryId: "news",
  streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  logoUrl: "https://example.com/cnn.png",
  epgChannelId: "cnn.us",
  isActive: true,
};

const mockRelatedChannels: MockChannel[] = [
  { ...mockChannel, id: "2", name: "BBC News", streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  { ...mockChannel, id: "3", name: "Fox News", streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  { ...mockChannel, id: "4", name: "MSNBC", streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  { ...mockChannel, id: "5", name: "Sky News", streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
];

export default function WatchLivePage() {
  const router = useRouter();
  const params = useParams();
  const channelId = params.id as string;

  const [channel, setChannel] = useState<MockChannel>(mockChannel);
  const [currentProgram, setCurrentProgram] = useState<EpgProgram>(mockCurrentProgram);
  const [upcomingPrograms, setUpcomingPrograms] = useState<EpgProgram[]>(mockUpcomingPrograms);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showChannelList, setShowChannelList] = useState(false);

  const { addToWatchHistory, setCurrentStream } = usePlayerStore();

  useEffect(() => {
    // Set current stream when page loads
    setCurrentStream(channel.streamUrl, channel.name, "live", channel.id);
    addToWatchHistory({
      id: channel.id,
      streamId: channel.id,
      title: channel.name,
      type: "live",
      timestamp: Date.now(),
      progress: 0,
    });
  }, [channel, setCurrentStream, addToWatchHistory]);

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateProgress = (program: EpgProgram) => {
    const now = Date.now();
    const start = new Date(program.start).getTime();
    const end = new Date(program.stop).getTime();
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const handleChannelChange = (newChannel: MockChannel) => {
    setChannel(newChannel);
    router.replace(`/portal/watch/live/${newChannel.id}`);
  };

  const handlePreviousChannel = () => {
    const currentIndex = mockRelatedChannels.findIndex((c) => c.id === channel.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : mockRelatedChannels.length - 1;
    handleChannelChange(mockRelatedChannels[prevIndex]);
  };

  const handleNextChannel = () => {
    const currentIndex = mockRelatedChannels.findIndex((c) => c.id === channel.id);
    const nextIndex = currentIndex < mockRelatedChannels.length - 1 ? currentIndex + 1 : 0;
    handleChannelChange(mockRelatedChannels[nextIndex]);
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Video Player - Full Width */}
      <div className="relative aspect-video w-full max-h-[70vh] bg-black">
        <VideoPlayer
          src={channel.streamUrl}
          title={channel.name}
          poster={channel.backdropUrl}
          autoPlay
          onEnded={() => {}}
        />

        {/* Top Overlay - Back Button and Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>

            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="animate-pulse">
                LIVE
              </Badge>
              <span className="text-white font-medium">{channel.name}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setIsFavorite(!isFavorite)}
              >
                <Heart
                  className={`h-5 w-5 ${
                    isFavorite ? "fill-red-500 text-red-500" : ""
                  }`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setShowInfo(!showInfo)}
              >
                <Info className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setShowChannelList(!showChannelList)}
              >
                <List className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Channel Navigation */}
        <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-4 pointer-events-none">
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto"
            onClick={handlePreviousChannel}
          >
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto"
            onClick={handleNextChannel}
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Content Below Video */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-8">
          {/* Main Content */}
          <div className="flex-1">
            {/* Current Program Info */}
            <div className="mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {currentProgram.title}
                  </h1>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge variant="outline">{currentProgram.category}</Badge>
                    <span className="text-sm text-gray-400">
                      {formatTime(currentProgram.start)} -{" "}
                      {formatTime(currentProgram.stop)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-1000"
                    style={{ width: `${calculateProgress(currentProgram)}%` }}
                  />
                </div>
              </div>

              {showInfo && currentProgram.description && (
                <p className="text-gray-400 mt-4">{currentProgram.description}</p>
              )}
            </div>

            <Separator className="bg-gray-800" />

            {/* Upcoming Programs */}
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Coming Up Next
              </h2>
              <div className="space-y-3">
                {upcomingPrograms.map((program) => (
                  <Card
                    key={program.id}
                    className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-white">
                            {program.title}
                          </h3>
                          <p className="text-sm text-gray-400 mt-1">
                            {formatTime(program.start)} -{" "}
                            {formatTime(program.stop)}
                          </p>
                        </div>
                        <Badge variant="secondary">{program.category}</Badge>
                      </div>
                      {program.description && (
                        <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                          {program.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Channel List Sidebar */}
          {showChannelList && (
            <div className="w-80">
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    Related Channels
                  </h2>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {mockRelatedChannels.map((ch) => (
                        <div
                          key={ch.id}
                          className={`p-3 rounded-lg cursor-pointer transition-colors ${
                            ch.id === channel.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-gray-800 hover:bg-gray-700 text-white"
                          }`}
                          onClick={() => handleChannelChange(ch)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                              <span className="text-sm font-bold">
                                {ch.name.charAt(0)}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{ch.name}</p>
                              <p className="text-xs opacity-75 truncate">
                                Live Now
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
