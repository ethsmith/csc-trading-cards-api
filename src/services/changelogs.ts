import { getDatabase } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface Changelog {
  id: string;
  title: string;
  content: string;
  version: string | null;
  createdAt: Date;
}

export interface ChangelogWithReadStatus extends Changelog {
  isRead: boolean;
  readAt: Date | null;
}

export async function createChangelog(
  title: string,
  content: string,
  version?: string
): Promise<Changelog> {
  const db = getDatabase();
  const id = uuidv4();

  await db.query(
    `INSERT INTO changelogs (id, title, content, version) VALUES (?, ?, ?, ?)`,
    [id, title, content, version || null]
  );

  return {
    id,
    title,
    content,
    version: version || null,
    createdAt: new Date(),
  };
}

export async function getChangelogs(): Promise<Changelog[]> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT id, title, content, version, created_at 
     FROM changelogs 
     ORDER BY created_at DESC`
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: new Date(row.created_at),
  }));
}

export async function getChangelogById(id: string): Promise<Changelog | null> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT id, title, content, version, created_at 
     FROM changelogs 
     WHERE id = ?`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: new Date(row.created_at),
  };
}

export async function getChangelogsForUser(
  discordUserId: string
): Promise<ChangelogWithReadStatus[]> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT c.id, c.title, c.content, c.version, c.created_at,
            cr.read_at
     FROM changelogs c
     LEFT JOIN changelog_reads cr ON c.id = cr.changelog_id AND cr.discord_user_id = ?
     ORDER BY c.created_at DESC`,
    [discordUserId]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: new Date(row.created_at),
    isRead: row.read_at !== null,
    readAt: row.read_at ? new Date(row.read_at) : null,
  }));
}

export async function getUnreadChangelogsCount(discordUserId: string): Promise<number> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT COUNT(*) as count
     FROM changelogs c
     LEFT JOIN changelog_reads cr ON c.id = cr.changelog_id AND cr.discord_user_id = ?
     WHERE cr.id IS NULL`,
    [discordUserId]
  );

  return result.rows[0]?.count || 0;
}

export async function markChangelogAsRead(
  changelogId: string,
  discordUserId: string
): Promise<boolean> {
  const db = getDatabase();

  const changelog = await getChangelogById(changelogId);
  if (!changelog) {
    throw new Error('Changelog not found');
  }

  const existing = await db.query(
    `SELECT id FROM changelog_reads WHERE changelog_id = ? AND discord_user_id = ?`,
    [changelogId, discordUserId]
  );

  if (existing.rows.length > 0) {
    return false;
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO changelog_reads (id, changelog_id, discord_user_id) VALUES (?, ?, ?)`,
    [id, changelogId, discordUserId]
  );

  return true;
}

export async function markAllChangelogsAsRead(discordUserId: string): Promise<number> {
  const db = getDatabase();

  const unreadChangelogs = await db.query(
    `SELECT c.id
     FROM changelogs c
     LEFT JOIN changelog_reads cr ON c.id = cr.changelog_id AND cr.discord_user_id = ?
     WHERE cr.id IS NULL`,
    [discordUserId]
  );

  let markedCount = 0;
  for (const row of unreadChangelogs.rows) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO changelog_reads (id, changelog_id, discord_user_id) VALUES (?, ?, ?)`,
      [id, row.id, discordUserId]
    );
    markedCount++;
  }

  return markedCount;
}

export async function deleteChangelog(id: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db.query(`DELETE FROM changelogs WHERE id = ?`, [id]);

  return result.rowCount > 0;
}
