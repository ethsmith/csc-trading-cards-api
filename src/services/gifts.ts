import { getDatabase } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface Gift {
  id: string;
  discordUserId: string | null;
  name: string;
  packCount: number;
  claimedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface PendingGift {
  id: string;
  name: string;
  packCount: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export async function createGiftForUser(
  discordUserId: string,
  name: string,
  packCount: number,
  expiresAt?: Date
): Promise<Gift> {
  const db = getDatabase();
  const id = uuidv4();

  await db.query(
    `INSERT INTO gifts (id, discord_user_id, name, pack_count, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [id, discordUserId, name, packCount, expiresAt?.toISOString() || null]
  );

  return {
    id,
    discordUserId,
    name,
    packCount,
    claimedAt: null,
    expiresAt: expiresAt || null,
    createdAt: new Date(),
  };
}

export async function createGiftForAll(
  name: string,
  packCount: number,
  expiresAt?: Date
): Promise<{ count: number }> {
  const db = getDatabase();

  const users = await db.query('SELECT discord_id FROM users');

  for (const user of users.rows) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO gifts (id, discord_user_id, name, pack_count, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [id, user.discord_id, name, packCount, expiresAt?.toISOString() || null]
    );
  }

  return { count: users.rows.length };
}

export async function getPendingGifts(discordUserId: string): Promise<PendingGift[]> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT id, name, pack_count, expires_at, created_at 
     FROM gifts 
     WHERE discord_user_id = ? 
       AND claimed_at IS NULL 
       AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY created_at ASC`,
    [discordUserId]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    packCount: row.pack_count,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
  }));
}

export async function claimGift(
  giftId: string,
  discordUserId: string
): Promise<{ packCount: number; newPackBalance: number }> {
  const db = getDatabase();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const gift = await connection.query(
      `SELECT * FROM gifts WHERE id = ? AND discord_user_id = ? AND claimed_at IS NULL FOR UPDATE`,
      [giftId, discordUserId]
    );

    if (gift.rows.length === 0) {
      throw new Error('Gift not found or already claimed');
    }

    const giftRow = gift.rows[0];

    if (giftRow.expires_at && new Date(giftRow.expires_at) < new Date()) {
      throw new Error('Gift has expired');
    }

    await connection.query(
      `UPDATE gifts SET claimed_at = datetime('now') WHERE id = ?`,
      [giftId]
    );

    await connection.query(
      `UPDATE users SET pack_balance = pack_balance + ? WHERE discord_id = ?`,
      [giftRow.pack_count, discordUserId]
    );

    const balanceResult = await connection.query(
      `SELECT pack_balance FROM users WHERE discord_id = ?`,
      [discordUserId]
    );

    await connection.commit();

    return {
      packCount: giftRow.pack_count,
      newPackBalance: balanceResult.rows[0]?.pack_balance || 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function claimAllGifts(
  discordUserId: string
): Promise<{ totalPacks: number; giftsClaimed: number; newPackBalance: number }> {
  const db = getDatabase();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const gifts = await connection.query(
      `SELECT id, pack_count FROM gifts 
       WHERE discord_user_id = ? 
         AND claimed_at IS NULL 
         AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      [discordUserId]
    );

    if (gifts.rows.length === 0) {
      await connection.rollback();
      const balanceResult = await db.query(
        `SELECT pack_balance FROM users WHERE discord_id = ?`,
        [discordUserId]
      );
      return {
        totalPacks: 0,
        giftsClaimed: 0,
        newPackBalance: balanceResult.rows[0]?.pack_balance || 0,
      };
    }

    const totalPacks = gifts.rows.reduce((sum: number, g: any) => sum + g.pack_count, 0);
    const giftIds = gifts.rows.map((g: any) => g.id);

    for (const giftId of giftIds) {
      await connection.query(
        `UPDATE gifts SET claimed_at = datetime('now') WHERE id = ?`,
        [giftId]
      );
    }

    await connection.query(
      `UPDATE users SET pack_balance = pack_balance + ? WHERE discord_id = ?`,
      [totalPacks, discordUserId]
    );

    const balanceResult = await connection.query(
      `SELECT pack_balance FROM users WHERE discord_id = ?`,
      [discordUserId]
    );

    await connection.commit();

    return {
      totalPacks,
      giftsClaimed: giftIds.length,
      newPackBalance: balanceResult.rows[0]?.pack_balance || 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getLastDailyGiftDate(discordUserId: string): Promise<Date | null> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT created_at FROM gifts 
     WHERE discord_user_id = ? AND name = 'Daily Login Bonus'
     ORDER BY created_at DESC LIMIT 1`,
    [discordUserId]
  );

  if (result.rows.length === 0) return null;
  return new Date(result.rows[0].created_at);
}

export async function grantDailyGiftIfNeeded(discordUserId: string): Promise<boolean> {
  const lastGift = await getLastDailyGiftDate(discordUserId);

  if (lastGift) {
    const now = new Date();
    const lastGiftDate = new Date(lastGift);
    
    if (
      lastGiftDate.getUTCFullYear() === now.getUTCFullYear() &&
      lastGiftDate.getUTCMonth() === now.getUTCMonth() &&
      lastGiftDate.getUTCDate() === now.getUTCDate()
    ) {
      return false;
    }
  }

  await createGiftForUser(discordUserId, 'Daily Login Bonus', 3);
  return true;
}

export async function hasReceivedEarlyArrivalGift(discordUserId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT id FROM gifts WHERE discord_user_id = ? AND name = 'Early Arrival'`,
    [discordUserId]
  );

  return result.rows.length > 0;
}

export async function grantEarlyArrivalGiftIfEligible(discordUserId: string): Promise<boolean> {
  const cutoffDate = new Date('2026-02-01T00:00:00Z');
  const now = new Date();

  if (now >= cutoffDate) {
    return false;
  }

  const hasReceived = await hasReceivedEarlyArrivalGift(discordUserId);
  if (hasReceived) {
    return false;
  }

  await createGiftForUser(discordUserId, 'Early Arrival', 50);
  return true;
}
