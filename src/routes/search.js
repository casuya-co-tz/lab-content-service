const express = require('express');
const { query } = require('../db');
const { apiKeyAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/search - Full-text search across labs
router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const { q, subject, limit = 20, offset = 0 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    let sql = `
      SELECT l.id, l.title, l.title_sw, l.subject, l.description, l.description_sw,
             l.is_published, l.is_premium, l.current_version, l.updated_at,
             ts_rank(l.search_vector, plainto_tsquery('english', $1)) AS rank
      FROM labs l
      WHERE l.search_vector @@ plainto_tsquery('english', $1)
    `;
    const params = [q.trim()];

    if (subject) {
      params.push(subject);
      sql += ` AND l.subject = $${params.length}`;
    }

    sql += ` ORDER BY rank DESC, l.title`;
    params.push(parseInt(limit), parseInt(offset));
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    res.json({
      query: q,
      results: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/search/tags - Get all unique tags
router.get('/tags', apiKeyAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT tag, COUNT(*) as count FROM lab_tags GROUP BY tag ORDER BY count DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Tags error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

module.exports = router;
