import { CscPlayer, PlayerStats, PlayerWithStats } from '../types';

const CSC_CORE_GRAPHQL = 'https://core.csconfederation.com/graphql';
const CSC_STATS_GRAPHQL = 'https://stats.csconfederation.com/graphql';
const ANALYTIKILL_API = 'https://tonysanti.com/prx/csc-stat-api';

interface SeasonConfig {
  number: number;
  hasSeasonStarted: boolean;
}

const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

let cachedSeason: SeasonConfig | null = null;
let seasonCacheTime = 0;

// Cache player details by name for quick lookup
let cachedPlayerDetails: Map<string, CscPlayer> = new Map();

let cachedStats: Map<string, PlayerStats> | null = null;
let statsCacheTime = 0;
let statsCacheKey = '';

let cachedPlayersWithStats: PlayerWithStats[] | null = null;
let playersWithStatsCacheTime = 0;

export async function fetchCurrentSeason(): Promise<SeasonConfig> {
  const now = Date.now();
  if (cachedSeason && now - seasonCacheTime < CACHE_DURATION) {
    return cachedSeason;
  }

  const response = await fetch(`${ANALYTIKILL_API}/csc/cached-season-metadata`);
  const data = (await response.json()) as SeasonConfig;
  cachedSeason = data;
  seasonCacheTime = now;
  return data;
}

// Fetch player details only for specific names (used for pack opening)
export async function fetchPlayersByNames(names: string[]): Promise<Map<string, CscPlayer>> {
  if (names.length === 0) return new Map();
  
  // Check which names we already have cached
  const uncachedNames = names.filter(name => !cachedPlayerDetails.has(name));
  
  if (uncachedNames.length === 0) {
    // All names are cached, return from cache
    const result = new Map<string, CscPlayer>();
    names.forEach(name => {
      const player = cachedPlayerDetails.get(name);
      if (player) result.set(name, player);
    });
    return result;
  }
  
  // Fetch all players and cache them (CSC Core API doesn't support filtering by name)
  const response = await fetch(CSC_CORE_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query CscPlayers {
        players {
          id
          steam64Id
          name
          discordId
          mmr
          avatarUrl
          tier {
            name
          }
          team {
            name
            franchise {
              name
              prefix
            }
          }
          type
        }
      }`,
      variables: {},
    }),
  });

  const json = (await response.json()) as { data?: { players?: CscPlayer[] } };
  const players = json.data?.players ?? [];
  
  // Cache all fetched players
  players.forEach(player => {
    if (player.name) {
      cachedPlayerDetails.set(player.name, player);
    }
  });
  
  // Return only requested names
  const result = new Map<string, CscPlayer>();
  names.forEach(name => {
    const player = cachedPlayerDetails.get(name);
    if (player) result.set(name, player);
  });
  
  console.log(`[CSC] Fetched player details, cached ${cachedPlayerDetails.size} total, returning ${result.size} requested`);
  return result;
}

export async function fetchTierStats(
  tier: string,
  season: number,
  matchType: string
): Promise<PlayerStats[]> {
  const response = await fetch(CSC_STATS_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName: 'getTierSeasonStats',
      query: `query getTierSeasonStats($tier: String!, $season: Int!, $matchType: String!) {
        tierSeasonStats(tier: $tier, season: $season, matchType: $matchType) {
          name
          rating
          kr
          adr
          kast
          impact
          gameCount
          rounds
          kills
          deaths
          assists
        }
      }`,
      variables: { tier, season, matchType },
    }),
  });

  const json = (await response.json()) as { data?: { tierSeasonStats?: PlayerStats[] } };
  return json.data?.tierSeasonStats ?? [];
}

export async function fetchAllStats(
  season: number,
  matchType: string
): Promise<Map<string, PlayerStats>> {
  const now = Date.now();
  const cacheKey = `${season}-${matchType}`;
  
  if (cachedStats && statsCacheKey === cacheKey && now - statsCacheTime < CACHE_DURATION) {
    return cachedStats;
  }

  const tiers = ['Recruit', 'Prospect', 'Contender', 'Challenger', 'Elite', 'Premier'];
  const statsMap = new Map<string, PlayerStats>();

  // Fetch sequentially with small delay to avoid rate limiting
  for (const tier of tiers) {
    const tierStats = await fetchTierStats(tier, season, matchType);
    tierStats.forEach((stat) => {
      if (stat.name) {
        statsMap.set(stat.name, stat);
      }
    });
    // Small delay between requests to avoid throttling
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  cachedStats = statsMap;
  statsCacheTime = now;
  statsCacheKey = cacheKey;
  return statsMap;
}

export async function fetchPlayersWithStats(): Promise<PlayerWithStats[]> {
  const now = Date.now();
  
  // Return cached result if valid
  if (cachedPlayersWithStats && now - playersWithStatsCacheTime < CACHE_DURATION) {
    return cachedPlayersWithStats;
  }

  // Step 1: Get season config and stats FIRST (this tells us who has played)
  const seasonConfig = await fetchCurrentSeason();
  const matchType = seasonConfig.hasSeasonStarted ? 'Regulation' : 'Combine';
  let statsMap = await fetchAllStats(seasonConfig.number, matchType);

  console.log(`[CSC] Season ${seasonConfig.number}, matchType: ${matchType}, stats entries: ${statsMap.size}`);

  // Fall back to Combine stats if Regulation has no stats
  if (statsMap.size === 0 && matchType === 'Regulation') {
    console.log(`[CSC] No Regulation stats found, falling back to Combine`);
    statsMap = await fetchAllStats(seasonConfig.number, 'Combine');
    console.log(`[CSC] Combine stats entries: ${statsMap.size}`);
  }

  // Step 2: Get player names who have stats (only these matter for pack opening)
  const playerNamesWithStats = Array.from(statsMap.keys());
  
  if (playerNamesWithStats.length === 0) {
    console.log(`[CSC] No players with stats found`);
    return cachedPlayersWithStats || [];
  }

  // Step 3: Fetch player details ONLY for those with stats
  const playerDetailsMap = await fetchPlayersByNames(playerNamesWithStats);

  // Step 4: Combine player details with stats
  const result: PlayerWithStats[] = [];
  for (const [name, stats] of statsMap.entries()) {
    const player = playerDetailsMap.get(name);
    if (player && player.tier?.name && stats.gameCount > 0) {
      result.push({
        ...player,
        stats,
      });
    }
  }

  console.log(`[CSC] Players with stats & details: ${result.length}`);

  // Cache if we got good results, or if better than current cache
  const currentCacheSize = cachedPlayersWithStats?.length || 0;
  if (result.length >= 600 || result.length > currentCacheSize) {
    cachedPlayersWithStats = result;
    playersWithStatsCacheTime = now;
    console.log(`[CSC] Cached ${result.length} players with stats`);
  } else if (cachedPlayersWithStats) {
    console.log(`[CSC] Keeping existing cache (${currentCacheSize}) over new result (${result.length})`);
    return cachedPlayersWithStats;
  }

  return result;
}

export async function getSeasonAndMatchType(): Promise<{ season: number; matchType: 'Regulation' | 'Combine' }> {
  const config = await fetchCurrentSeason();
  return {
    season: config.number,
    matchType: config.hasSeasonStarted ? 'Regulation' : 'Combine',
  };
}
