const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/devengine';

const pool = new Pool({ connectionString });

async function init() {
  // Create templates table if not exists
  const create = `
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `;
  await pool.query(create);
}

async function listTemplates() {
  const res = await pool.query('SELECT id, name, created_at FROM templates ORDER BY created_at DESC');
  return res.rows;
}

async function getTemplate(id) {
  const res = await pool.query('SELECT id, name, content, created_at FROM templates WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function saveTemplate(name, content) {
  const res = await pool.query(
    'INSERT INTO templates (name, content) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content RETURNING id, name, created_at',
    [name, content]
  );
  return res.rows[0];
}

module.exports = {
  init,
  listTemplates,
  getTemplate,
  saveTemplate,
  pool,
};
