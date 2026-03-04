import { StreamType } from '@prisma/client';

export interface LiveStreamItem {
  num: number;
  name: string;
  stream_type: 'live';
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string | null;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: 0 | 1;
  direct_source: string;
  tv_archive_duration: number;
}

export interface VodStreamItem {
  num: number;
  name: string;
  stream_type: 'movie';
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
  viewer_count?: number;
}

export interface SeriesItem {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}

export interface CategoryItem {
  category_id: string;
  category_name: string;
  parent_id: number;
  country_code?: string;
  flag_svg_url?: string;
}

export interface SeriesInfo {
  seasons: SeasonInfo[];
  info: {
    name: string;
    cover: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    last_modified: string;
    rating: string;
    rating_5based: number;
    backdrop_path: string[];
    youtube_trailer: string;
    episode_run_time: string;
    category_id: string;
  };
  episodes: Record<string, EpisodeInfo[]>;
}

export interface SeasonInfo {
  air_date: string;
  episode_count: number;
  id: number;
  name: string;
  overview: string;
  season_number: number;
  cover: string;
  cover_big: string;
}

export interface EpisodeInfo {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    movie_image: string;
    plot: string;
    releasedate: string;
    rating: number;
    duration_secs: number;
    duration: string;
  };
  custom_sid: string;
  added: string;
  season: number;
  direct_source: string;
}

export interface VodInfo {
  info: {
    movie_image: string;
    tmdb_id: number;
    backdrop_path: string[];
    youtube_trailer: string;
    genre: string;
    plot: string;
    cast: string;
    rating: string;
    director: string;
    releasedate: string;
    duration_secs: number;
    duration: string;
    video: Record<string, unknown>;
    audio: Record<string, unknown>;
    bitrate: number;
    viewer_count?: number;
  };
  movie_data: {
    stream_id: number;
    name: string;
    added: string;
    category_id: string;
    container_extension: string;
    custom_sid: string;
    direct_source: string;
  };
}

export interface ShortEpg {
  epg_listings: EpgListing[];
}

export interface EpgListing {
  id: string;
  epg_id: string;
  title: string;
  lang: string;
  start: string;
  end: string;
  description: string;
  channel_id: string;
  start_timestamp: string;
  stop_timestamp: string;
  now_playing: 0 | 1;
  has_archive: 0 | 1;
}

export function mapStreamType(type: StreamType): 'live' | 'movie' | 'series' | 'radio' {
  const typeMap: Record<StreamType, 'live' | 'movie' | 'series' | 'radio'> = {
    LIVE: 'live',
    VOD: 'movie',
    SERIES: 'series',
    RADIO: 'radio',
  };
  return typeMap[type];
}
