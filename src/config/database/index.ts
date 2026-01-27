import { DatabaseAdapter, DatabaseConfig, DatabaseType } from './interface';
import { MySQLAdapter } from './mysql';
import { PostgresAdapter } from './postgres';
import { SQLiteAdapter } from './sqlite';

export * from './interface';

let db: DatabaseAdapter | null = null;

export function getConfig(): DatabaseConfig {
  const type = (process.env.DB_TYPE || 'mysql') as DatabaseType;
  
  let defaultPort = '3306';
  let defaultUser = 'root';
  let defaultDatabase = 'csc_trading_cards';
  
  if (type === 'postgres') {
    defaultPort = '5432';
    defaultUser = 'postgres';
  } else if (type === 'sqlite') {
    defaultDatabase = './csc_trading_cards.db';
  }
  
  return {
    type,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || defaultPort),
    user: process.env.DB_USER || defaultUser,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || defaultDatabase,
  };
}

export function createAdapter(config: DatabaseConfig): DatabaseAdapter {
  switch (config.type) {
    case 'mysql':
      return new MySQLAdapter(config);
    case 'postgres':
      return new PostgresAdapter(config);
    case 'sqlite':
      return new SQLiteAdapter(config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

export function getDatabase(): DatabaseAdapter {
  if (!db) {
    const config = getConfig();
    db = createAdapter(config);
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const database = getDatabase();
  await database.initialize();
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

export default getDatabase;
