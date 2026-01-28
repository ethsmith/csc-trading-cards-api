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

let cachedPlayers: CscPlayer[] | null = null;
let playersCacheTime = 0;

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

export async function fetchPlayers(): Promise<CscPlayer[]> {
  const now = Date.now();
  if (cachedPlayers && now - playersCacheTime < CACHE_DURATION) {
    return cachedPlayers;
  }
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
  cachedPlayers = players;
  playersCacheTime = now;
  return players;
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

  const results = await Promise.all(
    tiers.map((tier) => fetchTierStats(tier, season, matchType))
  );

  results.flat().forEach((stat) => {
    if (stat.name) {
      statsMap.set(stat.name, stat);
    }
  });

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

  const [players, seasonConfig] = await Promise.all([
    fetchPlayers(),
    fetchCurrentSeason(),
  ]);

  const matchType = seasonConfig.hasSeasonStarted ? 'Regulation' : 'Combine';
  let statsMap = await fetchAllStats(seasonConfig.number, matchType);

  console.log(`[CSC] Season ${seasonConfig.number}, matchType: ${matchType}, players: ${players.length}, stats entries: ${statsMap.size}`);

  // Fall back to Combine stats if Regulation has no stats
  if (statsMap.size === 0 && matchType === 'Regulation') {
    console.log(`[CSC] No Regulation stats found, falling back to Combine`);
    statsMap = await fetchAllStats(seasonConfig.number, 'Combine');
    console.log(`[CSC] Combine stats entries: ${statsMap.size}`);
  }

  const result = players
    .filter((player) => player.tier?.name)
    .map((player) => ({
      ...player,
      stats: statsMap.get(player.name),
    }));

  const withStats = result.filter(p => p.stats && p.stats.gameCount > 0);
  console.log(`[CSC] Players with tier: ${result.length}, with stats & games: ${withStats.length}`);

  // Only cache if we got good results
  if (withStats.length >= 600) {
    cachedPlayersWithStats = result;
    playersWithStatsCacheTime = now;
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
