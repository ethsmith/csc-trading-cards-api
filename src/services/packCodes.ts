import { v4 as uuidv4 } from 'uuid';
import { getDatabase, DatabaseTransaction } from '../config/database';
import { PackCode, GuaranteedRarities, OwnedCard, CardRarity, CardSnapshot, RARITY_WEIGHTS, PlayerWithStats, StatType } from '../types';
import { fetchPlayersWithStats, getSeasonAndMatchType } from './csc';

async function findOrCreateSnapshot(
  connection: DatabaseTransaction,
  player: PlayerWithStats,
  season: number,
  statType: StatType
): Promise<CardSnapshot> {
  const existing = await connection.query(
    `SELECT * FROM card_snapshots 
     WHERE csc_player_id = ? AND season = ? AND stat_type = ? AND avatar_url = ?`,
    [player.id, season, statType, player.avatarUrl]
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
  
  await connection.query(
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
}

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

export interface CreatePackCodeOptions {
  packCount?: number;
  cardsPerPack?: number;
  guaranteedRarities?: GuaranteedRarities;
  expiresInDays?: number;
}

export async function createPackCode(
  createdBy: string,
  options: CreatePackCodeOptions = {}
): Promise<PackCode> {
  const {
    packCount = 1,
    cardsPerPack = 5,
    guaranteedRarities = null,
    expiresInDays = null,
  } = options;

  const code = uuidv4();
  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const db = getDatabase();
  await db.query(
    `INSERT INTO pack_codes (code, created_by, pack_count, cards_per_pack, guaranteed_rarities, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      code,
      createdBy,
      packCount,
      cardsPerPack,
      guaranteedRarities ? JSON.stringify(guaranteedRarities) : null,
      expiresAt,
    ]
  );

  return {
    code,
    createdBy,
    packCount,
    cardsPerPack,
    guaranteedRarities,
    redeemedBy: null,
    redeemedAt: null,
    createdAt: new Date(),
    expiresAt,
  };
}

export async function getPackCode(code: string): Promise<PackCode | null> {
  const db = getDatabase();
  const result = await db.query(
    'SELECT * FROM pack_codes WHERE code = ?',
    [code]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    code: row.code,
    createdBy: row.created_by,
    packCount: row.pack_count,
    cardsPerPack: row.cards_per_pack,
    guaranteedRarities: row.guaranteed_rarities ? JSON.parse(row.guaranteed_rarities) : null,
    redeemedBy: row.redeemed_by,
    redeemedAt: row.redeemed_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function getPackCodesByCreator(createdBy: string): Promise<PackCode[]> {
  const db = getDatabase();
  const result = await db.query(
    'SELECT * FROM pack_codes WHERE created_by = ? ORDER BY created_at DESC',
    [createdBy]
  );

  return result.rows.map((row: any) => ({
    code: row.code,
    createdBy: row.created_by,
    packCount: row.pack_count,
    cardsPerPack: row.cards_per_pack,
    guaranteedRarities: row.guaranteed_rarities ? JSON.parse(row.guaranteed_rarities) : null,
    redeemedBy: row.redeemed_by,
    redeemedAt: row.redeemed_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export interface RedeemResult {
  packCode: PackCode;
  packsAdded: number;
  newPackBalance: number;
}

export async function redeemPackCode(
  code: string,
  discordUserId: string
): Promise<RedeemResult> {
  const db = getDatabase();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const result = await connection.query(
      'SELECT * FROM pack_codes WHERE code = ? FOR UPDATE',
      [code]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid pack code');
    }

    const packCodeRow = result.rows[0];

    if (packCodeRow.redeemed_by) {
      throw new Error('Pack code has already been redeemed');
    }

    if (packCodeRow.expires_at && new Date(packCodeRow.expires_at) < new Date()) {
      throw new Error('Pack code has expired');
    }

    const packCode: PackCode = {
      code: packCodeRow.code,
      createdBy: packCodeRow.created_by,
      packCount: packCodeRow.pack_count,
      cardsPerPack: packCodeRow.cards_per_pack,
      guaranteedRarities: packCodeRow.guaranteed_rarities 
        ? JSON.parse(packCodeRow.guaranteed_rarities) 
        : null,
      redeemedBy: discordUserId,
      redeemedAt: new Date(),
      createdAt: packCodeRow.created_at,
      expiresAt: packCodeRow.expires_at,
    };

    // Add packs to user's balance instead of opening them
    await connection.query(
      'UPDATE users SET pack_balance = pack_balance + ? WHERE discord_id = ?',
      [packCode.packCount, discordUserId]
    );

    // Mark code as redeemed
    await connection.query(
      'UPDATE pack_codes SET redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?',
      [discordUserId, code]
    );

    // Get new balance
    const balanceResult = await connection.query(
      'SELECT pack_balance FROM users WHERE discord_id = ?',
      [discordUserId]
    );

    await connection.commit();

    return { 
      packCode, 
      packsAdded: packCode.packCount,
      newPackBalance: balanceResult.rows[0]?.pack_balance || 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deletePackCode(code: string, adminId: string): Promise<boolean> {
  const db = getDatabase();
  const result = await db.query(
    'DELETE FROM pack_codes WHERE code = ? AND redeemed_by IS NULL',
    [code]
  );

  return result.rowCount > 0;
}
