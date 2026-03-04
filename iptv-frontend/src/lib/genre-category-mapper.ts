/**
 * Maps TMDB genre names to category names
 * Used to auto-populate categories when selecting TMDB content
 */

// VOD/Movie genre mapping (TMDB genre name -> Category name)
export const VOD_GENRE_MAP: Record<string, string> = {
  // English TMDB genres
  'action': 'ACTION',
  'adventure': 'AVENTURE',
  'animation': 'ANIMATION',
  'comedy': 'COMÉDIE',
  'crime': 'CRIME',
  'documentary': 'DOCUMENTAIRE',
  'drama': 'DRAME',
  'family': 'FAMILIAL',
  'fantasy': 'FANTASTIQUE',
  'history': 'HISTOIRE',
  'horror': 'HORREUR',
  'music': 'MUSIQUE',
  'mystery': 'MYSTÈRE',
  'romance': 'ROMANCE',
  'science fiction': 'SCIENCE-FICTION',
  'tv movie': 'TÉLÉFILM',
  'thriller': 'THRILLER',
  'war': 'GUERRE',
  'western': 'WESTERN',
  'sortie de la semaine': 'SORTIE DE LA SEMAINE', // New releases
  // French variants (from TMDB with French language setting)
  'aventure': 'AVENTURE',
  'comédie': 'COMÉDIE',
  'documentaire': 'DOCUMENTAIRE',
  'drame': 'DRAME',
  'familial': 'FAMILIAL',
  'fantastique': 'FANTASTIQUE',
  'histoire': 'HISTOIRE',
  'horreur': 'HORREUR',
  'musique': 'MUSIQUE',
  'mystère': 'MYSTÈRE',
  'science-fiction': 'SCIENCE-FICTION',
  'téléfilm': 'TÉLÉFILM',
  'guerre': 'GUERRE',
};

// Series/TV genre mapping (TMDB genre name -> Category name)
export const SERIES_GENRE_MAP: Record<string, string> = {
  // English TMDB genres
  'action': 'ACTION & AVENTURE',
  'action & adventure': 'ACTION & AVENTURE',
  'adventure': 'ACTION & AVENTURE',
  'animation': 'ANIMATION',
  'comedy': 'COMÉDIE',
  'crime': 'CRIME',
  'documentary': 'DOCUMENTAIRE',
  'drama': 'DRAME',
  'family': 'FAMILIAL',
  'kids': 'ENFANTS',
  'mystery': 'MYSTÈRE',
  'news': 'ACTUALITÉS',
  'reality': 'TÉLÉRÉALITÉ',
  'sci-fi & fantasy': 'SCIENCE-FICTION & FANTASTIQUE',
  'science fiction': 'SCIENCE-FICTION & FANTASTIQUE',
  'fantasy': 'SCIENCE-FICTION & FANTASTIQUE',
  'soap': 'FEUILLETON',
  'talk': 'TALK-SHOW',
  'war & politics': 'GUERRE & POLITIQUE',
  'war': 'GUERRE & POLITIQUE',
  'western': 'WESTERN',
  'thriller': 'CRIME', // Map thriller to crime for series
  'sortie de la semaine': 'SORTIE DE LA SEMAINE', // New releases
  // French variants
  'action & aventure': 'ACTION & AVENTURE',
  'comédie': 'COMÉDIE',
  'documentaire': 'DOCUMENTAIRE',
  'drame': 'DRAME',
  'familial': 'FAMILIAL',
  'enfants': 'ENFANTS',
  'mystère': 'MYSTÈRE',
  'actualités': 'ACTUALITÉS',
  'téléréalité': 'TÉLÉRÉALITÉ',
  'science-fiction & fantastique': 'SCIENCE-FICTION & FANTASTIQUE',
  'feuilleton': 'FEUILLETON',
  'talk-show': 'TALK-SHOW',
  'guerre & politique': 'GUERRE & POLITIQUE',
};

export interface Category {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Maps TMDB genres to category IDs for VOD/Movies
 * @param genres - Comma-separated genre string from TMDB (e.g., "Action, Drama, Thriller")
 * @param categories - Array of available VOD categories
 * @returns Object with categoryIds array and primaryCategoryId
 */
export function mapGenresToVodCategories(
  genres: string,
  categories: Category[]
): { categoryIds: number[]; primaryCategoryId: number | undefined } {
  if (!genres || !categories || categories.length === 0) {
    return { categoryIds: [], primaryCategoryId: undefined };
  }

  // Create a lookup map for categories by name (case-insensitive)
  const categoryByName = new Map(
    categories.map(c => [c.name.toUpperCase(), c])
  );

  // Parse genres and find matching categories
  const genreList = genres.split(',').map(g => g.trim().toLowerCase());
  const matchedCategoryIds: number[] = [];

  for (const genre of genreList) {
    const categoryName = VOD_GENRE_MAP[genre];
    if (categoryName) {
      const category = categoryByName.get(categoryName);
      if (category && !matchedCategoryIds.includes(category.id)) {
        matchedCategoryIds.push(category.id);
      }
    }
  }

  return {
    categoryIds: matchedCategoryIds,
    primaryCategoryId: matchedCategoryIds[0],
  };
}

/**
 * Maps TMDB genres to category IDs for Series/TV
 * @param genres - Comma-separated genre string from TMDB (e.g., "Drama, Crime, Comedy")
 * @param categories - Array of available Series categories
 * @returns Object with categoryIds array and primaryCategoryId
 */
export function mapGenresToSeriesCategories(
  genres: string,
  categories: Category[]
): { categoryIds: number[]; primaryCategoryId: number | undefined } {
  if (!genres || !categories || categories.length === 0) {
    return { categoryIds: [], primaryCategoryId: undefined };
  }

  // Create a lookup map for categories by name (case-insensitive)
  const categoryByName = new Map(
    categories.map(c => [c.name.toUpperCase(), c])
  );

  // Parse genres and find matching categories
  const genreList = genres.split(',').map(g => g.trim().toLowerCase());
  const matchedCategoryIds: number[] = [];

  for (const genre of genreList) {
    const categoryName = SERIES_GENRE_MAP[genre];
    if (categoryName) {
      const category = categoryByName.get(categoryName);
      if (category && !matchedCategoryIds.includes(category.id)) {
        matchedCategoryIds.push(category.id);
      }
    }
  }

  return {
    categoryIds: matchedCategoryIds,
    primaryCategoryId: matchedCategoryIds[0],
  };
}
