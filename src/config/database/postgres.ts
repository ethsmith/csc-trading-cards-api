import { Pool, PoolClient } from 'pg';
import { DatabaseAdapter, DatabaseTransaction, QueryResult, DatabaseConfig } from './interface';

class PostgresTransaction implements DatabaseTransaction {
  constructor(private client: PoolClient) {}

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const convertedSql = this.convertPlaceholders(sql);
    const result = await this.client.query(convertedSql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0,
    };
  }

  private convertPlaceholders(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  async beginTransaction(): Promise<void> {
    await this.client.query('BEGIN');
  }

  async commit(): Promise<void> {
    await this.client.query('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK');
  }

  release(): void {
    this.client.release();
  }
}

export class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor(private config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: 10,
    });
  }

  private convertPlaceholders(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const convertedSql = this.convertPlaceholders(sql);
    const result = await this.pool.query(convertedSql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0,
    };
  }

  async getConnection(): Promise<DatabaseTransaction> {
    const client = await this.pool.connect();
    return new PostgresTransaction(client);
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE stat_type AS ENUM ('Regulation', 'Combine');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$
      `);

      await client.query(`
        DO $$ BEGIN
          CREATE TYPE card_rarity AS ENUM ('normal', 'foil', 'holo', 'gold', 'prismatic');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$
      `);

      await client.query(`
        DO $$ BEGIN
          CREATE TYPE trade_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          discord_id VARCHAR(32) PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          avatar VARCHAR(255),
          pack_balance INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS update_users_updated_at ON users
      `);

      await client.query(`
        CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS card_snapshots (
          id VARCHAR(36) PRIMARY KEY,
          csc_player_id VARCHAR(36) NOT NULL,
          player_name VARCHAR(100) NOT NULL,
          avatar_url VARCHAR(512),
          season INT NOT NULL,
          stat_type stat_type NOT NULL,
          tier VARCHAR(50) NOT NULL,
          team_name VARCHAR(100),
          franchise_name VARCHAR(100),
          franchise_prefix VARCHAR(20),
          mmr INT,
          rating DECIMAL(5,2) NOT NULL,
          kr DECIMAL(5,2) NOT NULL,
          adr DECIMAL(6,2) NOT NULL,
          kast DECIMAL(5,2) NOT NULL,
          impact DECIMAL(5,2) NOT NULL,
          game_count INT NOT NULL,
          kills INT NOT NULL,
          deaths INT NOT NULL,
          assists INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (csc_player_id, season, stat_type, avatar_url)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS owned_cards (
          id VARCHAR(36) PRIMARY KEY,
          discord_user_id VARCHAR(32) NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
          card_snapshot_id VARCHAR(36) NOT NULL REFERENCES card_snapshots(id) ON DELETE CASCADE,
          rarity card_rarity NOT NULL,
          obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_cards ON owned_cards(discord_user_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_snapshot ON owned_cards(card_snapshot_id)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS trade_offers (
          id VARCHAR(36) PRIMARY KEY,
          from_user_id VARCHAR(32) NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
          to_user_id VARCHAR(32) NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
          status trade_status DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS update_trade_offers_updated_at ON trade_offers
      `);

      await client.query(`
        CREATE TRIGGER update_trade_offers_updated_at
          BEFORE UPDATE ON trade_offers
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_from_user ON trade_offers(from_user_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_to_user ON trade_offers(to_user_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_status ON trade_offers(status)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS trade_offer_cards (
          id VARCHAR(36) PRIMARY KEY,
          trade_offer_id VARCHAR(36) NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
          owned_card_id VARCHAR(36) NOT NULL REFERENCES owned_cards(id) ON DELETE CASCADE,
          is_offered BOOLEAN NOT NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS pack_codes (
          code VARCHAR(36) PRIMARY KEY,
          created_by VARCHAR(32) NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
          pack_count INT NOT NULL DEFAULT 1,
          cards_per_pack INT NOT NULL DEFAULT 5,
          guaranteed_rarities JSONB,
          redeemed_by VARCHAR(32) REFERENCES users(discord_id) ON DELETE SET NULL,
          redeemed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_redeemed ON pack_codes(redeemed_by)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_created_by ON pack_codes(created_by)
      `);

      console.log('PostgreSQL tables initialized successfully');
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
