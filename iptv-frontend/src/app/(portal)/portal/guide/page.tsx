"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Info,
  Clock,
  Calendar,
  Star,
  Search,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EpgProgram } from "@/types";

// Local types for mock data
interface MockCategory {
  id: string;
  name: string;
  order: number;
}

interface MockChannel {
  id: string;
  name: string;
  type: string;
  categoryId: string;
  streamUrl: string;
  logoUrl?: string;
  epgChannelId?: string;
  isActive: boolean;
}

// Mock data for channels and EPG
const mockCategories: MockCategory[] = [
  { id: "1", name: "News", order: 1 },
  { id: "2", name: "Sports", order: 2 },
  { id: "3", name: "Entertainment", order: 3 },
  { id: "4", name: "Movies", order: 4 },
  { id: "5", name: "Kids", order: 5 },
];

const mockChannels: MockChannel[] = [
  {
    id: "1",
    name: "CNN",
    type: "live",
    categoryId: "1",
    streamUrl: "https://example.com/cnn.m3u8",
    logoUrl: "https://example.com/cnn.png",
    epgChannelId: "cnn.us",
    isActive: true,
  },
  {
    id: "2",
    name: "ESPN",
    type: "live",
    categoryId: "2",
    streamUrl: "https://example.com/espn.m3u8",
    logoUrl: "https://example.com/espn.png",
    epgChannelId: "espn.us",
    isActive: true,
  },
  {
    id: "3",
    name: "HBO",
    type: "live",
    categoryId: "4",
    streamUrl: "https://example.com/hbo.m3u8",
    logoUrl: "https://example.com/hbo.png",
    epgChannelId: "hbo.us",
    isActive: true,
  },
  {
    id: "4",
    name: "Cartoon Network",
    type: "live",
    categoryId: "5",
    streamUrl: "https://example.com/cn.m3u8",
    logoUrl: "https://example.com/cn.png",
    epgChannelId: "cartoonnetwork.us",
    isActive: true,
  },
];

// Generate mock EPG data for the next 24 hours
const generateMockEPG = (): EpgProgram[] => {
  const programs: EpgProgram[] = [];
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const programTitles: Record<string, string[]> = {
    "cnn.us": ["CNN Newsroom", "Anderson Cooper 360", "The Situation Room", "Erin Burnett OutFront", "CNN Tonight"],
    "espn.us": ["SportsCenter", "NFL Live", "NBA Countdown", "College GameDay", "Monday Night Football"],
    "hbo.us": ["Game of Thrones", "The Last of Us", "Succession", "House of the Dragon", "True Detective"],
    "cartoonnetwork.us": ["Adventure Time", "Regular Show", "The Amazing World of Gumball", "Teen Titans Go!", "Steven Universe"],
  };

  mockChannels.forEach((channel) => {
    const titles = programTitles[channel.epgChannelId || ""] || ["Program"];
    let currentTime = new Date(startOfDay);

    while (currentTime < new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
      const duration = [30, 60, 90, 120][Math.floor(Math.random() * 4)]; // Random duration
      const endTime = new Date(currentTime.getTime() + duration * 60 * 1000);
      const title = titles[Math.floor(Math.random() * titles.length)];

      programs.push({
        id: `${channel.id}-${currentTime.getTime()}`,
        channelId: channel.epgChannelId || "",
        title,
        description: `${title} - A great show on ${channel.name}. Enjoy the best entertainment.`,
        start: currentTime.toISOString(),
        stop: endTime.toISOString(),
        category: channel.categoryId === "2" ? "Sports" : channel.categoryId === "1" ? "News" : "Entertainment",
        icon: channel.logoUrl,
      });

      currentTime = endTime;
    }
  });

  return programs;
};

const HOUR_WIDTH = 200; // pixels per hour
const CHANNEL_HEIGHT = 80;
const TIMELINE_START_HOUR = 0;
const TIMELINE_HOURS = 24;

export default function EPGPage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedProgram, setSelectedProgram] = useState<EpgProgram | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [epgData] = useState<EpgProgram[]>(generateMockEPG);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const hoursSinceStart = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
      const scrollPosition = hoursSinceStart * HOUR_WIDTH - 200; // Center current time
      scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
    }
  }, []);

  const filteredChannels = useMemo(() => {
    return mockChannels.filter((channel) => {
      const matchesSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !selectedCategory || channel.categoryId === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const getChannelPrograms = (channelId: string) => {
    const channel = mockChannels.find((c) => c.id === channelId);
    if (!channel || !channel.epgChannelId) return [];
    return epgData.filter((p) => p.channelId === channel.epgChannelId);
  };

  const getCurrentProgram = (channelId: string) => {
    const programs = getChannelPrograms(channelId);
    const now = currentTime.getTime();
    return programs.find((p) => {
      const start = new Date(p.start).getTime();
      const end = new Date(p.stop).getTime();
      return now >= start && now < end;
    });
  };

  const getNextProgram = (channelId: string) => {
    const programs = getChannelPrograms(channelId);
    const now = currentTime.getTime();
    return programs.find((p) => new Date(p.start).getTime() > now);
  };

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const calculateProgramStyle = (program: EpgProgram) => {
    const startOfDay = new Date(currentTime);
    startOfDay.setHours(0, 0, 0, 0);

    const programStart = new Date(program.start);
    const programEnd = new Date(program.stop);

    const startOffset = (programStart.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
    const duration = (programEnd.getTime() - programStart.getTime()) / (1000 * 60 * 60);

    return {
      left: `${startOffset * HOUR_WIDTH}px`,
      width: `${duration * HOUR_WIDTH}px`,
    };
  };

  const isCurrentProgram = (program: EpgProgram) => {
    const now = currentTime.getTime();
    const start = new Date(program.start).getTime();
    const end = new Date(program.stop).getTime();
    return now >= start && now < end;
  };

  const isPastProgram = (program: EpgProgram) => {
    const now = currentTime.getTime();
    const end = new Date(program.stop).getTime();
    return now > end;
  };

  const scrollTimeline = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = HOUR_WIDTH * 2;
      scrollRef.current.scrollBy({
        left: direction === "right" ? scrollAmount : -scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const scrollToNow = () => {
    if (scrollRef.current) {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const hoursSinceStart = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
      const scrollPosition = hoursSinceStart * HOUR_WIDTH - 200;
      scrollRef.current.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: "smooth",
      });
    }
  };

  const playChannel = (channelId: string) => {
    router.push(`/portal/watch/live/${channelId}`);
  };

  const renderTimelineHeader = () => {
    const hours = [];
    for (let i = TIMELINE_START_HOUR; i < TIMELINE_START_HOUR + TIMELINE_HOURS; i++) {
      const hour = i % 24;
      hours.push(
        <div
          key={i}
          className="flex-shrink-0 border-r border-border px-2 text-sm text-muted-foreground"
          style={{ width: `${HOUR_WIDTH}px` }}
        >
          {hour.toString().padStart(2, "0")}:00
        </div>
      );
    }
    return hours;
  };

  const renderCurrentTimeLine = () => {
    const startOfDay = new Date(currentTime);
    startOfDay.setHours(0, 0, 0, 0);
    const hoursSinceStart = (currentTime.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
    const position = hoursSinceStart * HOUR_WIDTH;

    return (
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
        style={{ left: `${position}px` }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <h1 className="text-2xl font-bold">TV Guide</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {currentTime.toLocaleDateString([], {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                <Clock className="h-4 w-4 ml-4" />
                {formatTime(currentTime)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:gap-4">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-4 w-4" />
                    {selectedCategory
                      ? mockCategories.find((c) => c.id === selectedCategory)?.name
                      : "All Categories"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setSelectedCategory(null)}>
                    All Categories
                  </DropdownMenuItem>
                  {mockCategories.map((category) => (
                    <DropdownMenuItem
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      {category.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" size="sm" onClick={scrollToNow}>
                Now
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile List View */}
      <div className="md:hidden container mx-auto px-4 py-6 space-y-4">
        {filteredChannels.map((channel) => {
          const current = getCurrentProgram(channel.id);
          const next = getNextProgram(channel.id);

          return (
            <Card key={channel.id} className="overflow-hidden">
              <CardContent className="p-4 flex gap-3">
                <div className="relative w-14 h-14 rounded-full overflow-hidden bg-muted flex-shrink-0">
                  {channel.logoUrl ? (
                    <Image src={channel.logoUrl} alt={channel.name} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                      {channel.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold truncate">{channel.name}</p>
                    <Badge variant="secondary" className="text-xs">Live</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {current?.title || "No current program"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {current ? (
                        <>
                          <span>{formatTime(current.start)} - {formatTime(current.stop)}</span>
                          {next && <span className="truncate">• Next: {next.title}</span>}
                        </>
                      ) : (
                        next && <span>Next: {next.title}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => playChannel(channel.id)}>
                      <Play className="h-4 w-4 mr-2" />
                      Watch
                    </Button>
                    <Button size="sm" variant="outline" onClick={scrollToNow}>
                      Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* EPG Grid */}
      <div className="hidden md:flex">
        {/* Channel List - Fixed */}
        <div className="flex-shrink-0 w-48 bg-muted border-r">
          {/* Header spacer */}
          <div className="h-10 border-b bg-background flex items-center justify-center">
            <span className="text-sm font-medium">Channels</span>
          </div>

          {/* Channels */}
          <div className="space-y-px">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-3 px-3 h-20 border-b bg-background hover:bg-accent cursor-pointer transition-colors"
                onClick={() => playChannel(channel.id)}
              >
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                  {channel.logoUrl ? (
                    <Image
                      src={channel.logoUrl}
                      alt={channel.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                      {channel.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{channel.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getCurrentProgram(channel.id)?.title || "No info"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline and Programs - Scrollable */}
        <div className="flex-1 overflow-hidden">
          {/* Timeline Navigation */}
          <div className="flex items-center bg-background border-b">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollTimeline("left")}
              className="flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div
              ref={scrollRef}
              className="flex-1 overflow-x-auto scrollbar-hide"
              style={{ scrollbarWidth: "none" }}
            >
              {/* Timeline Header */}
              <div
                className="flex h-10 items-center"
                style={{ width: `${TIMELINE_HOURS * HOUR_WIDTH}px` }}
              >
                {renderTimelineHeader()}
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollTimeline("right")}
              className="flex-shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Programs Grid */}
          <div
            className="overflow-x-auto"
            ref={scrollRef}
            style={{ scrollbarWidth: "none" }}
          >
            <div
              className="relative"
              style={{ width: `${TIMELINE_HOURS * HOUR_WIDTH}px` }}
            >
              {renderCurrentTimeLine()}

              {filteredChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="relative h-20 border-b"
                  style={{ height: `${CHANNEL_HEIGHT}px` }}
                >
                  {getChannelPrograms(channel.id).map((program) => {
                    const style = calculateProgramStyle(program);
                    const isCurrent = isCurrentProgram(program);
                    const isPast = isPastProgram(program);

                    return (
                      <TooltipProvider key={program.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute top-1 bottom-1 rounded px-2 py-1 cursor-pointer transition-all overflow-hidden
                                ${isCurrent
                                  ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                                  : isPast
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-secondary hover:bg-secondary/80"
                                }
                              `}
                              style={style}
                              onClick={() => {
                                if (isCurrent) {
                                  playChannel(channel.id);
                                } else {
                                  setSelectedProgram(program);
                                }
                              }}
                            >
                              <p className="font-medium text-sm truncate">
                                {program.title}
                              </p>
                              <p className="text-xs opacity-75 truncate">
                                {formatTime(program.start)} - {formatTime(program.stop)}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-medium">{program.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatTime(program.start)} - {formatTime(program.stop)}
                            </p>
                            {program.description && (
                              <p className="text-sm mt-2">{program.description}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Program Detail Modal */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedProgram.title}</h2>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatTime(selectedProgram.start)} - {formatTime(selectedProgram.stop)}
                    </span>
                    {selectedProgram.category && (
                      <Badge variant="secondary">{selectedProgram.category}</Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedProgram(null)}
                >
                  ×
                </Button>
              </div>

              {selectedProgram.description && (
                <p className="text-sm text-muted-foreground mt-4">
                  {selectedProgram.description}
                </p>
              )}

              <div className="flex gap-2 mt-6">
                {isCurrentProgram(selectedProgram) && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const channel = mockChannels.find(
                        (c) => c.epgChannelId === selectedProgram.channelId
                      );
                      if (channel) {
                        playChannel(channel.id);
                      }
                    }}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Watch Now
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedProgram(null)}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
