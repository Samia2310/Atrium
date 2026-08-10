import path from 'node:path';
import { config } from 'dotenv';
import { Pool, PoolClient, QueryResultRow } from 'pg';

config({ path: path.resolve(__dirname, '..', '..', '.env') });

function databaseNeedsSsl(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.PGSSLMODE === 'require' ||
    /[?&]sslmode=require\b/.test(process.env.DATABASE_URL || '')
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  // Hosted Postgres providers often require SSL, while local Postgres
  // usually does not. Honor sslmode=require in the URL so NODE_ENV can
  // remain "development" during local app work.
  ssl: databaseNeedsSsl() ? { rejectUnauthorized: false } : undefined
});

export async function query<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params as any[]);
  return result.rows;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  isolationLevel: 'read committed' | 'serializable' = 'read committed'
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`begin isolation level ${isolationLevel}`);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
