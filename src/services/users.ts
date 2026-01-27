import { getDatabase } from '../config/database';

export interface User {
  discordId: string;
  username: string;
  avatar: string | null;
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

      return {
        discordId: existing.rows[0].discord_id,
        username,
        avatar,
        createdAt: existing.rows[0].created_at,
        updatedAt: new Date(),
      };
    }

    await connection.query(
      'INSERT INTO users (discord_id, username, avatar) VALUES (?, ?, ?)',
      [discordId, username, avatar]
    );

    return {
      discordId,
      username,
      avatar,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } finally {
    connection.release();
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
