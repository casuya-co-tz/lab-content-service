require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    try {
      await pool.query(sql);
      console.log(`  OK`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('All migrations complete.');
  await pool.end();
}

migrate();
