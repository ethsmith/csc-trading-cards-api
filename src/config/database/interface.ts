export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface DatabaseTransaction extends DatabaseConnection {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface DatabaseAdapter {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  getConnection(): Promise<DatabaseTransaction>;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export type DatabaseType = 'mysql' | 'postgres' | 'sqlite';

export interface DatabaseConfig {
  type: DatabaseType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
