import { v4 as uuidv4 } from 'uuid';
import { getDatabase, DatabaseTransaction } from '../config/database';
import { CardSnapshot, OwnedCard, CardRarity, RARITY_WEIGHTS, PlayerWithStats, StatType } from '../types';
import { getPlayersWithStats, getSeasonAndMatchType } from './csc';

function rollRarity(): CardRarity {
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    random -= weight;
    if (random <= 0) {
      return rarity as CardRarity;
    }
  }

  return 'normal';
}

async function findOrCreateSnapshot(
  player: PlayerWithStats,
  season: number,
  statType: StatType,
  connection?: DatabaseTransaction
): Promise<CardSnapshot> {
  const db = getDatabase();
  const conn = connection || await db.getConnection();
  const shouldRelease = !connection;
  
  try {
    const existing = await conn.query(
      `SELECT * FROM card_snapshots 
       WHERE csc_player_id = ? AND season = ? AND stat_type = ? AND avatar_url = ? AND player_name = ?`,
      [player.id, season, statType, player.avatarUrl, player.name]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        id: row.id,
        cscPlayerId: row.csc_player_id,
        playerName: row.player_name,
        avatarUrl: row.avatar_url,
        season: row.season,
        statType: row.stat_type,
        tier: row.tier,
        teamName: row.team_name,
        franchiseName: row.franchise_name,
        franchisePrefix: row.franchise_prefix,
        mmr: row.mmr,
        rating: parseFloat(row.rating),
        kr: parseFloat(row.kr),
        adr: parseFloat(row.adr),
        kast: parseFloat(row.kast),
        impact: parseFloat(row.impact),
        gameCount: row.game_count,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        createdAt: row.created_at,
      };
    }

    const id = uuidv4();
    const stats = player.stats!;
    
    await conn.query(
      `INSERT INTO card_snapshots 
       (id, csc_player_id, player_name, avatar_url, season, stat_type, tier, team_name, 
        franchise_name, franchise_prefix, mmr, rating, kr, adr, kast, impact, 
        game_count, kills, deaths, assists)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        player.id,
        player.name,
        player.avatarUrl,
        season,
        statType,
        player.tier.name,
        player.team?.name || null,
        player.team?.franchise?.name || null,
        player.team?.franchise?.prefix || null,
        player.mmr || null,
        stats.rating,
        stats.kr,
        stats.adr,
        stats.kast,
        stats.impact,
        stats.gameCount,
        stats.kills,
        stats.deaths,
        stats.assists,
      ]
    );

    return {
      id,
      cscPlayerId: player.id,
      playerName: player.name,
      avatarUrl: player.avatarUrl,
      season,
      statType,
      tier: player.tier.name,
      teamName: player.team?.name || null,
      franchiseName: player.team?.franchise?.name || null,
      franchisePrefix: player.team?.franchise?.prefix || null,
      mmr: player.mmr || null,
      rating: stats.rating,
      kr: stats.kr,
      adr: stats.adr,
      kast: stats.kast,
      impact: stats.impact,
      gameCount: stats.gameCount,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      createdAt: new Date(),
    };
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

export async function openPack(
  discordUserId: string,
  packSize: number = 5
): Promise<{ cards: OwnedCard[]; newSnapshots: CardSnapshot[] }> {
  const players = getPlayersWithStats();
  const seasonInfo = await getSeasonAndMatchType();

  const eligiblePlayers = players.filter((p) => p.stats && p.stats.gameCount > 0);
  if (eligiblePlayers.length === 0) {
    throw new Error('No eligible players available');
  }

  const db = getDatabase();
  const connection = await db.getConnection();
  const cards: OwnedCard[] = [];
  const newSnapshots: CardSnapshot[] = [];

  try {
    await connection.beginTransaction();

    for (let i = 0; i < packSize; i++) {
      const randomPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
      const rarity = rollRarity();

      const snapshot = await findOrCreateSnapshot(
        randomPlayer,
        seasonInfo.season,
        seasonInfo.matchType,
        connection
      );

      const cardId = uuidv4();
      await connection.query(
        `INSERT INTO owned_cards (id, discord_user_id, card_snapshot_id, rarity)
         VALUES (?, ?, ?, ?)`,
        [cardId, discordUserId, snapshot.id, rarity]
      );

      const ownedCard: OwnedCard = {
        id: cardId,
        discordUserId,
        cardSnapshotId: snapshot.id,
        rarity,
        obtainedAt: new Date(),
        snapshot,
      };

      cards.push(ownedCard);
      
      if (new Date(snapshot.createdAt).getTime() > Date.now() - 1000) {
        newSnapshots.push(snapshot);
      }
    }

    // Log the pack open
    const packOpenId = uuidv4();
    await connection.query(
      `INSERT INTO pack_opens (id, discord_user_id, cards_opened) VALUES (?, ?, ?)`,
      [packOpenId, discordUserId, packSize]
    );

    await connection.commit();
    return { cards, newSnapshots };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getUserCollection(discordUserId: string): Promise<OwnedCard[]> {
  const db = getDatabase();
  const result = await db.query(
    `SELECT 
      oc.id, oc.discord_user_id, oc.card_snapshot_id, oc.rarity, oc.obtained_at,
      cs.id as snapshot_id, cs.csc_player_id, cs.player_name, cs.avatar_url,
      cs.season, cs.stat_type, cs.tier, cs.team_name, cs.franchise_name,
      cs.franchise_prefix, cs.mmr, cs.rating, cs.kr, cs.adr, cs.kast,
      cs.impact, cs.game_count, cs.kills, cs.deaths, cs.assists, cs.created_at
     FROM owned_cards oc
     JOIN card_snapshots cs ON oc.card_snapshot_id = cs.id
     WHERE oc.discord_user_id = ?
     ORDER BY oc.obtained_at DESC`,
    [discordUserId]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    discordUserId: row.discord_user_id,
    cardSnapshotId: row.card_snapshot_id,
    rarity: row.rarity,
    obtainedAt: row.obtained_at,
    snapshot: {
      id: row.snapshot_id,
      cscPlayerId: row.csc_player_id,
      playerName: row.player_name,
      avatarUrl: row.avatar_url,
      season: row.season,
      statType: row.stat_type,
      tier: row.tier,
      teamName: row.team_name,
      franchiseName: row.franchise_name,
      franchisePrefix: row.franchise_prefix,
      mmr: row.mmr,
      rating: parseFloat(row.rating),
      kr: parseFloat(row.kr),
      adr: parseFloat(row.adr),
      kast: parseFloat(row.kast),
      impact: parseFloat(row.impact),
      gameCount: row.game_count,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      createdAt: row.created_at,
    },
  }));
}

export async function getCardById(cardId: string): Promise<OwnedCard | null> {
  const db = getDatabase();
  const result = await db.query(
    `SELECT 
      oc.id, oc.discord_user_id, oc.card_snapshot_id, oc.rarity, oc.obtained_at,
      cs.id as snapshot_id, cs.csc_player_id, cs.player_name, cs.avatar_url,
      cs.season, cs.stat_type, cs.tier, cs.team_name, cs.franchise_name,
      cs.franchise_prefix, cs.mmr, cs.rating, cs.kr, cs.adr, cs.kast,
      cs.impact, cs.game_count, cs.kills, cs.deaths, cs.assists, cs.created_at
     FROM owned_cards oc
     JOIN card_snapshots cs ON oc.card_snapshot_id = cs.id
     WHERE oc.id = ?`,
    [cardId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    cardSnapshotId: row.card_snapshot_id,
    rarity: row.rarity,
    obtainedAt: row.obtained_at,
    snapshot: {
      id: row.snapshot_id,
      cscPlayerId: row.csc_player_id,
      playerName: row.player_name,
      avatarUrl: row.avatar_url,
      season: row.season,
      statType: row.stat_type,
      tier: row.tier,
      teamName: row.team_name,
      franchiseName: row.franchise_name,
      franchisePrefix: row.franchise_prefix,
      mmr: row.mmr,
      rating: parseFloat(row.rating),
      kr: parseFloat(row.kr),
      adr: parseFloat(row.adr),
      kast: parseFloat(row.kast),
      impact: parseFloat(row.impact),
      gameCount: row.game_count,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      createdAt: row.created_at,
    },
  };
}

export async function tradeInDuplicates(
  discordUserId: string,
  cardIds: string[],
  requiredCount: number = 15
): Promise<void> {
  if (cardIds.length !== requiredCount) {
    throw new Error(`Must trade in exactly ${requiredCount} cards`);
  }

  // Check for duplicate card IDs in the request
  const uniqueCardIds = new Set(cardIds);
  if (uniqueCardIds.size !== cardIds.length) {
    throw new Error('Cannot trade in the same card multiple times');
  }

  const db = getDatabase();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verify ownership and check that user has duplicates of each card
    for (const cardId of cardIds) {
      // Get the card being traded
      const cardResult = await connection.query(
        `SELECT oc.id, oc.card_snapshot_id, oc.rarity, oc.discord_user_id
         FROM owned_cards oc
         WHERE oc.id = ?`,
        [cardId]
      );

      if (cardResult.rows.length === 0) {
        throw new Error(`Card ${cardId} not found`);
      }

      const card = cardResult.rows[0];
      if (card.discord_user_id !== discordUserId) {
        throw new Error(`Card ${cardId} does not belong to you`);
      }

      // Check that user has more than 1 of this exact card (same snapshot + rarity)
      const duplicateCount = await connection.query(
        `SELECT COUNT(*) as count FROM owned_cards 
         WHERE discord_user_id = ? AND card_snapshot_id = ? AND rarity = ?`,
        [discordUserId, card.card_snapshot_id, card.rarity]
      );

      if (parseInt(duplicateCount.rows[0].count) <= 1) {
        throw new Error(`You must have more than one copy of each card you trade in`);
      }
    }

    // Delete the traded cards
    for (const cardId of cardIds) {
      await connection.query(
        'DELETE FROM owned_cards WHERE id = ? AND discord_user_id = ?',
        [cardId, discordUserId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function searchCardOwners(
  playerName: string,
  rarity?: CardRarity,
  excludeUserId?: string
): Promise<{
  owners: Array<{
    discordUserId: string;
    username: string;
    avatar: string | null;
    cardCount: number;
  }>;
  totalOwners: number;
}> {
  const db = getDatabase();
  
  let query = `
    SELECT 
      u.discord_id,
      u.username,
      u.avatar,
      COUNT(oc.id) as card_count
    FROM owned_cards oc
    JOIN card_snapshots cs ON oc.card_snapshot_id = cs.id
    JOIN users u ON oc.discord_user_id = u.discord_id
    WHERE cs.player_name LIKE ?
  `;
  const params: (string | undefined)[] = [`%${playerName}%`];

  if (rarity) {
    query += ` AND oc.rarity = ?`;
    params.push(rarity);
  }

  if (excludeUserId) {
    query += ` AND u.discord_id != ?`;
    params.push(excludeUserId);
  }

  query += ` GROUP BY u.discord_id, u.username, u.avatar ORDER BY card_count DESC`;

  const result = await db.query(query, params);

  const owners = result.rows.map((row: any) => ({
    discordUserId: row.discord_id,
    username: row.username,
    avatar: row.avatar,
    cardCount: parseInt(row.card_count),
  }));

  return {
    owners,
    totalOwners: owners.length,
  };
}

export async function getCollectionStats(discordUserId: string) {
  const db = getDatabase();
  
  const rarityResult = await db.query(
    `SELECT rarity, COUNT(*) as count FROM owned_cards 
     WHERE discord_user_id = ? GROUP BY rarity`,
    [discordUserId]
  );

  const uniqueResult = await db.query(
    `SELECT COUNT(DISTINCT card_snapshot_id) as unique_count FROM owned_cards 
     WHERE discord_user_id = ?`,
    [discordUserId]
  );

  const totalResult = await db.query(
    `SELECT COUNT(*) as total FROM owned_cards WHERE discord_user_id = ?`,
    [discordUserId]
  );

  const byRarity: Record<CardRarity, number> = {
    normal: 0,
    foil: 0,
    holo: 0,
    gold: 0,
    prismatic: 0,
  };

  rarityResult.rows.forEach((row: any) => {
    byRarity[row.rarity as CardRarity] = parseInt(row.count);
  });

  return {
    total: parseInt(totalResult.rows[0]?.total) || 0,
    uniqueSnapshots: parseInt(uniqueResult.rows[0]?.unique_count) || 0,
    byRarity,
  };
}
