import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

export default pool;

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log(`Query (${duration}ms): ${text.substring(0, 80)}...`);
  }
  return res;
}

export async function getOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const res = await query(text, params);
  return res.rows[0] || null;
}

export async function getMany<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await query(text, params);
  return res.rows;
}
