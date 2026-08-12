const express = require('express');
const { query } = require('../db');
const { apiKeyAuth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/casuya/labs - Get all published labs for CASUYA
router.get('/labs', apiKeyAuth, async (req, res) => {
  try {
    const { subject, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT l.id, l.title, l.title_sw, l.subject, l.description, l.description_sw,
             l.is_premium, l.current_version, l.updated_at,
             lv.html_code, lv.scoring_config
      FROM labs l
      JOIN lab_versions lv ON lv.lab_id = l.id AND lv.version_number = l.current_version
      WHERE l.is_published = true
    `;
    const params = [];

    if (subject) {
      params.push(subject);
      sql += ` AND l.subject = $${params.length}`;
    }

    sql += ' ORDER BY l.subject, l.title';

    let countSql = 'SELECT COUNT(*) FROM labs l WHERE l.is_published = true';
    const countParams = [];
    if (subject) {
      countParams.push(subject);
      countSql += ` AND l.subject = $${countParams.length}`;
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count);

    params.push(limitNum, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    res.json({
      data: result.rows,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error('CASUYA labs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch labs for CASUYA' });
  }
});

// GET /api/casuya/labs/:id - Get single lab for CASUYA
router.get('/labs/:id', apiKeyAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.id, l.title, l.title_sw, l.subject, l.description, l.description_sw,
              l.is_premium, l.current_version, l.updated_at,
              lv.html_code, lv.scoring_config
       FROM labs l
       JOIN lab_versions lv ON lv.lab_id = l.id AND lv.version_number = l.current_version
       WHERE l.id = $1 AND l.is_published = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found or not published' });
    }

    // Track access (fire and forget)
    query(
      `INSERT INTO lab_access_log (lab_id, endpoint, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, `/api/casuya/labs/${req.params.id}`, req.ip, req.get('user-agent')]
    ).catch(() => {});

    res.json(result.rows[0]);
  } catch (err) {
    console.error('CASUYA lab error:', err.message);
    res.status(500).json({ error: 'Failed to fetch lab for CASUYA' });
  }
});

// GET /api/casuya/subjects - Get all subjects with lab counts
router.get('/subjects', apiKeyAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT subject, COUNT(*) as lab_count
       FROM labs WHERE is_published = true
       GROUP BY subject ORDER BY subject`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('CASUYA subjects error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// GET /api/casuya/search - Search published labs (for CASUYA)
router.get('/search', apiKeyAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const result = await query(
      `SELECT l.id, l.title, l.title_sw, l.subject, l.description, l.description_sw,
              l.is_premium, l.current_version, l.updated_at,
              ts_rank(l.search_vector, plainto_tsquery('english', $1)) AS rank
       FROM labs l
       WHERE l.search_vector @@ plainto_tsquery('english', $1)
         AND l.is_published = true
       ORDER BY rank DESC, l.title
       LIMIT 50`,
      [q.trim()]
    );

    res.json({ query: q, results: result.rows });
  } catch (err) {
    console.error('CASUYA search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/casuya/analytics - Get lab access analytics (admin)
router.get('/analytics', adminAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.id, l.title, l.subject,
              COUNT(al.id) as access_count,
              MAX(al.created_at) as last_accessed
       FROM labs l
       LEFT JOIN lab_access_log al ON al.lab_id = l.id
       WHERE l.is_published = true
       GROUP BY l.id, l.title, l.subject
       ORDER BY access_count DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('CASUYA analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/casuya/analytics/timeseries - Daily access counts for last 30 days
router.get('/analytics/timeseries', adminAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as access_count
       FROM lab_access_log
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('CASUYA timeseries error:', err.message);
    res.status(500).json({ error: 'Failed to fetch timeseries' });
  }
});

// GET /api/casuya/analytics/top-labs - Most accessed labs this week
router.get('/analytics/top-labs', adminAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.id, l.title, l.subject, COUNT(al.id) as access_count
       FROM labs l
       JOIN lab_access_log al ON al.lab_id = l.id
       WHERE al.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY l.id, l.title, l.subject
       ORDER BY access_count DESC
       LIMIT 10`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('CASUYA top labs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch top labs' });
  }
});

module.exports = router;
