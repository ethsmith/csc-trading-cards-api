import { getDatabase } from '../config/database';
import { grantDailyGiftIfNeeded, grantEarlyArrivalGiftIfEligible } from './gifts';

export interface User {
  discordId: string;
  username: string;
  avatar: string | null;
  packBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function findOrCreateUser(
  discordId: string,
  username: string,
  avatar: string | null
): Promise<User> {
  const db = getDatabase();
  const connection = await db.getConnection();

  try {
    const existing = await connection.query(
      'SELECT * FROM users WHERE discord_id = ?',
      [discordId]
    );

    if (existing.rows.length > 0) {
      // Update username/avatar if changed
      await connection.query(
        'UPDATE users SET username = ?, avatar = ? WHERE discord_id = ?',
        [username, avatar, discordId]
      );

      connection.release();

      // Grant daily gift if not already received today
      await grantDailyGiftIfNeeded(discordId);

      return {
        discordId: existing.rows[0].discord_id,
        username,
        avatar,
        packBalance: existing.rows[0].pack_balance || 0,
        createdAt: existing.rows[0].created_at,
        updatedAt: new Date(),
      };
    }

    const initialPackBalance = 10;
    await connection.query(
      'INSERT INTO users (discord_id, username, avatar, pack_balance) VALUES (?, ?, ?, ?)',
      [discordId, username, avatar, initialPackBalance]
    );

    connection.release();

    // Grant Early Arrival gift for new users before 02/01/2026
    await grantEarlyArrivalGiftIfEligible(discordId);

    return {
      discordId,
      username,
      avatar,
      packBalance: initialPackBalance,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } finally {
    // Connection may already be released
  }
}

export async function getUserByDiscordId(discordId: string): Promise<User | null> {
  const db = getDatabase();
  const result = await db.query(
    'SELECT * FROM users WHERE discord_id = ?',
    [discordId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    discordId: row.discord_id,
    username: row.username,
    avatar: row.avatar,
    packBalance: row.pack_balance || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function searchUsers(query: string, limit: number = 20): Promise<User[]> {
  const db = getDatabase();
  const result = await db.query(
    'SELECT * FROM users WHERE username LIKE ? LIMIT ?',
    [`%${query}%`, limit]
  );

  return result.rows.map((row: any) => ({
    discordId: row.discord_id,
    username: row.username,
    avatar: row.avatar,
    packBalance: row.pack_balance || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getPackBalance(discordId: string): Promise<number> {
  const db = getDatabase();
  const result = await db.query(
    'SELECT pack_balance FROM users WHERE discord_id = ?',
    [discordId]
  );
  return result.rows[0]?.pack_balance || 0;
}

export async function addPacks(discordId: string, count: number): Promise<number> {
  const db = getDatabase();
  await db.query(
    'UPDATE users SET pack_balance = pack_balance + ? WHERE discord_id = ?',
    [count, discordId]
  );
  return getPackBalance(discordId);
}

export async function decrementPackBalance(discordId: string): Promise<boolean> {
  const db = getDatabase();
  const result = await db.query(
    'UPDATE users SET pack_balance = pack_balance - 1 WHERE discord_id = ? AND pack_balance > 0',
    [discordId]
  );
  return result.rowCount > 0;
}
