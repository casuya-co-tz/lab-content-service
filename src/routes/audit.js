const express = require('express');
const { query } = require('../db');
const { apiKeyAuth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit - List audit entries (admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { entity_type, action, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM audit_log';
    const conditions = [];
    const params = [];

    if (entity_type) {
      params.push(entity_type);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    const countResult = await query('SELECT COUNT(*) FROM audit_log');

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error('List audit error:', err.message);
    res.status(500).json({ error: 'Failed to list audit log' });
  }
});

// POST /api/audit - Record an audit entry (internal use, admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { action, entity_type, entity_id, entity_title, details } = req.body;
    if (!action || !entity_type) {
      return res.status(400).json({ error: 'action and entity_type are required' });
    }

    const result = await query(
      `INSERT INTO audit_log (action, entity_type, entity_id, entity_title, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [action, entity_type, entity_id || null, entity_title || null, JSON.stringify(details || {}), req.ip]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create audit error:', err.message);
    res.status(500).json({ error: 'Failed to create audit entry' });
  }
});

module.exports = router;
