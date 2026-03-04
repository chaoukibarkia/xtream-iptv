// TMDB (The Movie Database) Configuration
export const tmdbConfig = {
  apiKey: process.env.TMDB_API_KEY || '',
  baseUrl: process.env.TMDB_API_BASE_URL || 'https://api.themoviedb.org/3',
  imageBaseUrl: process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p',
  language: process.env.TMDB_LANGUAGE || 'en-US',
  includeAdult: process.env.TMDB_INCLUDE_ADULT === 'true',
  rateLimitMs: parseInt(process.env.TMDB_RATE_LIMIT_MS || '250'),

  // Image size presets
  imageSizes: {
    poster: {
      small: 'w185',
      medium: 'w342',
      large: 'w500',
      original: 'original',
    },
    backdrop: {
      small: 'w300',
      medium: 'w780',
      large: 'w1280',
      original: 'original',
    },
    profile: {
      small: 'w45',
      medium: 'w185',
      large: 'h632',
      original: 'original',
    },
    still: {
      small: 'w92',
      medium: 'w185',
      large: 'w300',
      original: 'original',
    },
  },

  // Default image sizes for different use cases
  defaultSizes: {
    poster: 'w500',
    backdrop: 'w1280',
    profile: 'w185',
    still: 'w300',
  },
};

// Helper to build full image URL
export function buildImageUrl(
  path: string | null | undefined,
  size: string = 'original'
): string | null {
  if (!path) return null;
  return `${tmdbConfig.imageBaseUrl}/${size}${path}`;
}

// Check if TMDB is configured
export function isTmdbConfigured(): boolean {
  return !!tmdbConfig.apiKey;
}

