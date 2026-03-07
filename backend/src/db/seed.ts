import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pool, { getOne } from './pool';

dotenv.config();

async function seed() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme';

  console.log(`Seeding admin user: ${username}`);

  const existing = await getOne('SELECT id FROM users WHERE username = $1', [username]);
  if (existing) {
    console.log('Admin user already exists. Updating password...');
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, username]);
  } else {
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
  }

  console.log('Seed completed.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
