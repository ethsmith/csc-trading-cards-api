import { CscPlayer, PlayerStats, PlayerWithStats } from '../types';

const CSC_CORE_GRAPHQL = 'https://core.csconfederation.com/graphql';
const CSC_STATS_GRAPHQL = 'https://stats.csconfederation.com/graphql';
const ANALYTIKILL_API = 'https://tonysanti.com/prx/csc-stat-api';

interface SeasonConfig {
  number: number;
  hasSeasonStarted: boolean;
}

let cachedSeason: SeasonConfig | null = null;
let seasonCacheTime = 0;
const SEASON_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function fetchCurrentSeason(): Promise<SeasonConfig> {
  const now = Date.now();
  if (cachedSeason && now - seasonCacheTime < SEASON_CACHE_DURATION) {
    return cachedSeason;
  }

  const response = await fetch(`${ANALYTIKILL_API}/csc/cached-season-metadata`);
  const data = (await response.json()) as SeasonConfig;
  cachedSeason = data;
  seasonCacheTime = now;
  return data;
}

export async function fetchPlayers(): Promise<CscPlayer[]> {
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
  return json.data?.players ?? [];
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

  return statsMap;
}

export async function fetchPlayersWithStats(): Promise<PlayerWithStats[]> {
  const [players, seasonConfig] = await Promise.all([
    fetchPlayers(),
    fetchCurrentSeason(),
  ]);

  const matchType = seasonConfig.hasSeasonStarted ? 'Regulation' : 'Combine';
  const statsMap = await fetchAllStats(seasonConfig.number, matchType);

  return players
    .filter((player) => player.tier?.name)
    .map((player) => ({
      ...player,
      stats: statsMap.get(player.name),
    }));
}

export async function getSeasonAndMatchType(): Promise<{ season: number; matchType: 'Regulation' | 'Combine' }> {
  const config = await fetchCurrentSeason();
  return {
    season: config.number,
    matchType: config.hasSeasonStarted ? 'Regulation' : 'Combine',
  };
}
