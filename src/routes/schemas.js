const express = require('express');
const { query } = require('../db');
const { apiKeyAuth, adminAuth } = require('../middleware/auth');

const router = express.Router();

async function auditLog(action, entityType, entityId, entityTitle, details, ip) {
  try {
    await query(
      `INSERT INTO audit_log (action, entity_type, entity_id, entity_title, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [action, entityType, entityId || null, entityTitle || null, JSON.stringify(details || {}), ip || null]
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// GET /api/schemas - List all schemas (public, requires API key)
router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM lab_schemas ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('List schemas error:', err.message);
    res.status(500).json({ error: 'Failed to list schemas' });
  }
});

// GET /api/schemas/:name - Get schema by name (public, requires API key)
router.get('/:name', apiKeyAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM lab_schemas WHERE name = $1', [req.params.name]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get schema error:', err.message);
    res.status(500).json({ error: 'Failed to get schema' });
  }
});

// POST /api/schemas - Create schema (admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, description, fields } = req.body;
    if (!name || !fields) {
      return res.status(400).json({ error: 'name and fields are required' });
    }
    const result = await query(
      'INSERT INTO lab_schemas (name, description, fields) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, JSON.stringify(fields)]
    );

    await auditLog('create', 'schema', result.rows[0].id, name, { fields }, req.ip);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Schema name already exists' });
    }
    console.error('Create schema error:', err.message);
    res.status(500).json({ error: 'Failed to create schema' });
  }
});

module.exports = router;
