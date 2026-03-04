// ============================================
// TMDB API Response Types
// ============================================

// Movie Types
export interface TmdbMovie {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string | null;
  tagline: string | null;
  release_date: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  status: string;
  original_language: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: TmdbGenre[];
  production_companies: TmdbCompany[];
  production_countries: TmdbCountry[];
  spoken_languages: TmdbLanguage[];
  budget: number;
  revenue: number;
  homepage: string | null;
  belongs_to_collection: TmdbCollection | null;
}

export interface TmdbMovieSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  genre_ids: number[];
}

// TV Show Types
export interface TmdbTvShow {
  id: number;
  name: string;
  original_name: string;
  overview: string | null;
  tagline: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  status: string;
  type: string;
  original_language: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  in_production: boolean;
  genres: TmdbGenre[];
  networks: TmdbNetwork[];
  production_companies: TmdbCompany[];
  created_by: TmdbCreator[];
  seasons: TmdbSeasonSummary[];
  homepage: string | null;
}

export interface TmdbTvSearchResult {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  origin_country: string[];
}

export interface TmdbSeasonSummary {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
}

export interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episodes: TmdbEpisode[];
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  crew: TmdbCrewMember[];
  guest_stars: TmdbCastMember[];
}

// Credits Types
export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
  known_for_department?: string;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

// Video Types
export interface TmdbVideos {
  results: TmdbVideo[];
}

export interface TmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

// Common Types
export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country?: string;
}

export interface TmdbNetwork {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country?: string;
}

export interface TmdbCountry {
  iso_3166_1: string;
  name: string;
}

export interface TmdbLanguage {
  iso_639_1: string;
  name: string;
  english_name?: string;
}

export interface TmdbCreator {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface TmdbCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbKeywords {
  keywords?: TmdbKeyword[]; // For movies
  results?: TmdbKeyword[]; // For TV shows
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

export interface TmdbExternalIds {
  imdb_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
  tvdb_id?: number | null;
  freebase_id?: string | null;
  freebase_mid?: string | null;
}

export interface TmdbContentRatings {
  results: {
    iso_3166_1: string;
    rating: string;
  }[];
}

// Search/Pagination Types
export interface TmdbPaginatedResponse<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

export type TmdbMovieSearchResponse = TmdbPaginatedResponse<TmdbMovieSearchResult>;
export type TmdbTvSearchResponse = TmdbPaginatedResponse<TmdbTvSearchResult>;

// Find Response (by external ID)
export interface TmdbFindResponse {
  movie_results: TmdbMovie[];
  tv_results: TmdbTvShow[];
  person_results: any[];
  tv_episode_results: any[];
  tv_season_results: any[];
}

// Full Details (with appended data)
export interface TmdbMovieFullDetails extends TmdbMovie {
  credits: TmdbCredits;
  videos: TmdbVideos;
  keywords: TmdbKeywords;
  external_ids: TmdbExternalIds;
}

export interface TmdbTvFullDetails extends TmdbTvShow {
  credits: TmdbCredits;
  videos: TmdbVideos;
  keywords: TmdbKeywords;
  content_ratings: TmdbContentRatings;
  external_ids: TmdbExternalIds;
}

