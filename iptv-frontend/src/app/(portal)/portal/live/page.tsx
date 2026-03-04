"use client";

import { useState } from "react";
import { Play, Heart, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Channel {
  id: number;
  name: string;
  logo?: string;
  category: string;
  currentProgram?: string;
  isLive: boolean;
}

const categories = [
  "All",
  "Sports",
  "News",
  "Entertainment",
  "Movies",
  "Kids",
  "Music",
  "Documentary",
];

const mockChannels: Channel[] = [
  { id: 1, name: "ESPN HD", category: "Sports", currentProgram: "NBA: Lakers vs Celtics", isLive: true },
  { id: 2, name: "CNN", category: "News", currentProgram: "Breaking News", isLive: true },
  { id: 3, name: "HBO", category: "Movies", currentProgram: "Movie: Avatar 2", isLive: true },
  { id: 4, name: "FOX News", category: "News", currentProgram: "News Hour", isLive: true },
  { id: 5, name: "BBC One", category: "Entertainment", currentProgram: "Planet Earth III", isLive: true },
  { id: 6, name: "Discovery", category: "Documentary", currentProgram: "Shark Week", isLive: true },
  { id: 7, name: "National Geographic", category: "Documentary", currentProgram: "Wild Africa", isLive: true },
  { id: 8, name: "Cartoon Network", category: "Kids", currentProgram: "Adventure Time", isLive: true },
  { id: 9, name: "Nickelodeon", category: "Kids", currentProgram: "SpongeBob", isLive: true },
  { id: 10, name: "Disney Channel", category: "Kids", currentProgram: "Frozen", isLive: true },
  { id: 11, name: "MTV", category: "Music", currentProgram: "Top 20 Countdown", isLive: true },
  { id: 12, name: "VH1", category: "Music", currentProgram: "Classic Hits", isLive: true },
];

function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:border-primary cursor-pointer">
      {/* Thumbnail/Logo Area */}
      <div className="aspect-video bg-muted flex items-center justify-center relative">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="h-12 w-auto object-contain"
          />
        ) : (
          <span className="text-2xl font-bold text-muted-foreground">
            {channel.name.slice(0, 2)}
          </span>
        )}

        {/* Live Badge */}
        <Badge
          variant="live"
          className="absolute top-2 left-2 text-xs"
        >
          🔴 LIVE
        </Badge>

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100">
          <Button size="lg" className="rounded-full">
            <Play className="h-6 w-6 fill-current" />
          </Button>
        </div>
      </div>

      {/* Channel Info */}
      <div className="p-3">
        <h3 className="font-semibold truncate">{channel.name}</h3>
        <p className="text-sm text-muted-foreground truncate">
          {channel.currentProgram}
        </p>
      </div>
    </div>
  );
}

export default function LiveTVPage() {
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredChannels =
    selectedCategory === "All"
      ? mockChannels
      : mockChannels.filter((c) => c.category === selectedCategory);

  return (
    <div className="pb-24 md:pb-0">
      {/* Featured Channel Hero */}
      <div className="relative h-[48vh] sm:h-[50vh] bg-gradient-to-r from-background via-background/80 to-transparent">
        <div className="absolute inset-0 bg-[url('/hero-sports.jpg')] bg-cover bg-center opacity-30" />
        <div className="relative container h-full flex items-center">
          <div className="max-w-xl space-y-4 text-center sm:text-left">
            <Badge variant="live" className="text-sm mx-auto sm:mx-0">
              🔴 LIVE NOW
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
              NBA: Lakers vs Celtics
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              Watch the epic rivalry unfold as the Lakers take on the Celtics in
              this thrilling match-up.
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-3">
              <Button size="lg" className="gap-2 min-w-[140px]">
                <Play className="h-5 w-5 fill-current" />
                Watch Now
              </Button>
              <Button size="lg" variant="secondary" className="gap-2 min-w-[140px]">
                <Heart className="h-5 w-5" />
                Add to Favorites
              </Button>
              <Button size="lg" variant="outline" className="gap-2 min-w-[140px]">
                <Info className="h-5 w-5" />
                EPG Guide
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8 space-y-8">
        {/* Category Filter */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-4">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "secondary"}
                onClick={() => setSelectedCategory(category)}
                className="whitespace-nowrap"
              >
                {category}
              </Button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Channels Grid */}
        <div>
          <h2 className="text-2xl font-bold mb-4">
            {selectedCategory === "All" ? "All Channels" : selectedCategory}
          </h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {filteredChannels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
