import mysql, { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DatabaseAdapter, DatabaseTransaction, QueryResult, DatabaseConfig } from './interface';

class MySQLTransaction implements DatabaseTransaction {
  constructor(private connection: PoolConnection) {}

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const [rows] = await this.connection.query<RowDataPacket[]>(sql, params);
    return {
      rows: rows as T[],
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };
  }

  async beginTransaction(): Promise<void> {
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.connection.commit();
  }

  async rollback(): Promise<void> {
    await this.connection.rollback();
  }

  release(): void {
    this.connection.release();
  }
}

export class MySQLAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor(private config: DatabaseConfig) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return {
      rows: rows as T[],
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };
  }

  async getConnection(): Promise<DatabaseTransaction> {
    const connection = await this.pool.getConnection();
    return new MySQLTransaction(connection);
  }

  async initialize(): Promise<void> {
    const connection = await this.pool.getConnection();

    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          discord_id VARCHAR(32) PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          avatar VARCHAR(255),
          pack_balance INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS card_snapshots (
          id VARCHAR(36) PRIMARY KEY,
          csc_player_id VARCHAR(36) NOT NULL,
          player_name VARCHAR(100) NOT NULL,
          avatar_url VARCHAR(512),
          season INT NOT NULL,
          stat_type ENUM('Regulation', 'Combine') NOT NULL,
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
          UNIQUE KEY unique_snapshot (csc_player_id, season, stat_type, avatar_url(255))
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS owned_cards (
          id VARCHAR(36) PRIMARY KEY,
          discord_user_id VARCHAR(32) NOT NULL,
          card_snapshot_id VARCHAR(36) NOT NULL,
          rarity ENUM('normal', 'foil', 'holo', 'gold', 'prismatic') NOT NULL,
          obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (discord_user_id) REFERENCES users(discord_id) ON DELETE CASCADE,
          FOREIGN KEY (card_snapshot_id) REFERENCES card_snapshots(id) ON DELETE CASCADE,
          INDEX idx_user_cards (discord_user_id),
          INDEX idx_snapshot (card_snapshot_id)
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS trade_offers (
          id VARCHAR(36) PRIMARY KEY,
          from_user_id VARCHAR(32) NOT NULL,
          to_user_id VARCHAR(32) NOT NULL,
          status ENUM('pending', 'accepted', 'rejected', 'cancelled') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (from_user_id) REFERENCES users(discord_id) ON DELETE CASCADE,
          FOREIGN KEY (to_user_id) REFERENCES users(discord_id) ON DELETE CASCADE,
          INDEX idx_from_user (from_user_id),
          INDEX idx_to_user (to_user_id),
          INDEX idx_status (status)
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS trade_offer_cards (
          id VARCHAR(36) PRIMARY KEY,
          trade_offer_id VARCHAR(36) NOT NULL,
          owned_card_id VARCHAR(36) NOT NULL,
          is_offered BOOLEAN NOT NULL,
          FOREIGN KEY (trade_offer_id) REFERENCES trade_offers(id) ON DELETE CASCADE,
          FOREIGN KEY (owned_card_id) REFERENCES owned_cards(id) ON DELETE CASCADE
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS pack_codes (
          code VARCHAR(36) PRIMARY KEY,
          created_by VARCHAR(32) NOT NULL,
          pack_count INT NOT NULL DEFAULT 1,
          cards_per_pack INT NOT NULL DEFAULT 5,
          guaranteed_rarities JSON,
          redeemed_by VARCHAR(32),
          redeemed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL,
          FOREIGN KEY (created_by) REFERENCES users(discord_id) ON DELETE CASCADE,
          FOREIGN KEY (redeemed_by) REFERENCES users(discord_id) ON DELETE SET NULL,
          INDEX idx_redeemed (redeemed_by),
          INDEX idx_created_by (created_by)
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS gifts (
          id VARCHAR(36) PRIMARY KEY,
          discord_user_id VARCHAR(32) NOT NULL,
          name VARCHAR(100) NOT NULL,
          pack_count INT NOT NULL DEFAULT 1,
          claimed_at TIMESTAMP NULL,
          expires_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (discord_user_id) REFERENCES users(discord_id) ON DELETE CASCADE,
          INDEX idx_gifts_user (discord_user_id),
          INDEX idx_gifts_claimed (claimed_at)
        )
      `);

      console.log('MySQL tables initialized successfully');
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
