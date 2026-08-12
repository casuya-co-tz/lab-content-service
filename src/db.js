const { Pool } = require('pg');

const sslMode = process.env.PGSSLMODE || 'prefer';

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  options: '-c search_path=lab_content,public',
  ssl: sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full'
    ? { rejectUnauthorized: false }
    : sslMode === 'prefer'
      ? { rejectUnauthorized: false }
      : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { pool, query };
