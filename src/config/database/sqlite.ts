import Database from 'better-sqlite3';
import { DatabaseAdapter, DatabaseTransaction, QueryResult, DatabaseConfig } from './interface';

class SQLiteTransaction implements DatabaseTransaction {
  private inTransaction = false;

  constructor(private db: Database.Database) {}

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    let convertedSql = this.convertPlaceholders(sql);
    convertedSql = convertedSql.replace(/\s+FOR\s+UPDATE/gi, '');
    
    const convertedParams = this.convertBooleans(params || []);
    
    if (this.isSelectQuery(convertedSql)) {
      const stmt = this.db.prepare(convertedSql);
      const rows = stmt.all(...convertedParams) as T[];
      return {
        rows,
        rowCount: rows.length,
      };
    } else {
      const stmt = this.db.prepare(convertedSql);
      const result = stmt.run(...convertedParams);
      return {
        rows: [] as T[],
        rowCount: result.changes,
      };
    }
  }

  private convertPlaceholders(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `?`);
  }

  private convertBooleans(params: any[]): any[] {
    return params.map(p => {
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });
  }

  private isSelectQuery(sql: string): boolean {
    const trimmed = sql.trim().toUpperCase();
    return trimmed.startsWith('SELECT');
  }

  async beginTransaction(): Promise<void> {
    if (!this.inTransaction) {
      this.db.exec('BEGIN TRANSACTION');
      this.inTransaction = true;
    }
  }

  async commit(): Promise<void> {
    if (this.inTransaction) {
      this.db.exec('COMMIT');
      this.inTransaction = false;
    }
  }

  async rollback(): Promise<void> {
    if (this.inTransaction) {
      this.db.exec('ROLLBACK');
      this.inTransaction = false;
    }
  }

  release(): void {
    if (this.inTransaction) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      this.inTransaction = false;
    }
  }
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(private config: DatabaseConfig) {
    const dbPath = config.database || ':memory:';
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const transaction = new SQLiteTransaction(this.db);
    return transaction.query<T>(sql, params);
  }

  async getConnection(): Promise<DatabaseTransaction> {
    return new SQLiteTransaction(this.db);
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        avatar TEXT,
        pack_balance INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_users_updated_at
        AFTER UPDATE ON users
        FOR EACH ROW
      BEGIN
        UPDATE users SET updated_at = datetime('now') WHERE discord_id = OLD.discord_id;
      END
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS card_snapshots (
        id TEXT PRIMARY KEY,
        csc_player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        avatar_url TEXT,
        season INTEGER NOT NULL,
        stat_type TEXT NOT NULL CHECK (stat_type IN ('Regulation', 'Combine')),
        tier TEXT NOT NULL,
        team_name TEXT,
        franchise_name TEXT,
        franchise_prefix TEXT,
        mmr INTEGER,
        rating REAL NOT NULL,
        kr REAL NOT NULL,
        adr REAL NOT NULL,
        kast REAL NOT NULL,
        impact REAL NOT NULL,
        game_count INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        deaths INTEGER NOT NULL,
        assists INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (csc_player_id, season, stat_type, avatar_url)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS owned_cards (
        id TEXT PRIMARY KEY,
        discord_user_id TEXT NOT NULL,
        card_snapshot_id TEXT NOT NULL,
        rarity TEXT NOT NULL CHECK (rarity IN ('normal', 'foil', 'holo', 'gold', 'prismatic')),
        obtained_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (discord_user_id) REFERENCES users(discord_id) ON DELETE CASCADE,
        FOREIGN KEY (card_snapshot_id) REFERENCES card_snapshots(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_cards ON owned_cards(discord_user_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshot ON owned_cards(card_snapshot_id)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trade_offers (
        id TEXT PRIMARY KEY,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (from_user_id) REFERENCES users(discord_id) ON DELETE CASCADE,
        FOREIGN KEY (to_user_id) REFERENCES users(discord_id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_trade_offers_updated_at
        AFTER UPDATE ON trade_offers
        FOR EACH ROW
      BEGIN
        UPDATE trade_offers SET updated_at = datetime('now') WHERE id = OLD.id;
      END
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_from_user ON trade_offers(from_user_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_to_user ON trade_offers(to_user_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_status ON trade_offers(status)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trade_offer_cards (
        id TEXT PRIMARY KEY,
        trade_offer_id TEXT NOT NULL,
        owned_card_id TEXT NOT NULL,
        is_offered INTEGER NOT NULL,
        FOREIGN KEY (trade_offer_id) REFERENCES trade_offers(id) ON DELETE CASCADE,
        FOREIGN KEY (owned_card_id) REFERENCES owned_cards(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pack_codes (
        code TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        pack_count INTEGER NOT NULL DEFAULT 1,
        cards_per_pack INTEGER NOT NULL DEFAULT 5,
        guaranteed_rarities TEXT,
        redeemed_by TEXT,
        redeemed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT,
        FOREIGN KEY (created_by) REFERENCES users(discord_id) ON DELETE CASCADE,
        FOREIGN KEY (redeemed_by) REFERENCES users(discord_id) ON DELETE SET NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_redeemed ON pack_codes(redeemed_by)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_created_by ON pack_codes(created_by)
    `);

    console.log('SQLite tables initialized successfully');
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
