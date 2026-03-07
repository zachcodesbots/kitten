import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pool from './pool';

dotenv.config();

async function migrate() {
  console.log('Running database migration...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  try {
    await pool.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
