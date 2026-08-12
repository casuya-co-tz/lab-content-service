const express = require('express');
const { query } = require('../db');
const { apiKeyAuth, adminAuth } = require('../middleware/auth');
const { sanitizeHtml } = require('../sanitize');

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

// GET /api/labs - List all labs (public, requires API key)
router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const { subject, published } = req.query;
    let sql = 'SELECT * FROM labs';
    const conditions = [];
    const params = [];

    if (subject) {
      params.push(subject);
      conditions.push(`subject = $${params.length}`);
    }
    if (published !== undefined) {
      params.push(published === 'true');
      conditions.push(`is_published = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY subject, title';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('List labs error:', err.message);
    res.status(500).json({ error: 'Failed to list labs' });
  }
});

// GET /api/labs/:id - Get lab details (public, requires API key)
router.get('/:id', apiKeyAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM labs WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get lab error:', err.message);
    res.status(500).json({ error: 'Failed to get lab' });
  }
});

// GET /api/labs/:id/html - Get latest HTML code (public, requires API key)
router.get('/:id/html', apiKeyAuth, async (req, res) => {
  try {
    const labResult = await query('SELECT id, title, current_version FROM labs WHERE id = $1', [req.params.id]);
    if (labResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    const version = req.query.version || labResult.rows[0].current_version;
    const vResult = await query(
      'SELECT * FROM lab_versions WHERE lab_id = $1 AND version_number = $2',
      [req.params.id, version]
    );
    
    if (vResult.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Track access (fire and forget)
    query(
      `INSERT INTO lab_access_log (lab_id, endpoint, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, `/api/labs/${req.params.id}/html`, req.ip, req.get('user-agent')]
    ).catch(() => {});

    res.json({
      lab_id: labResult.rows[0].id,
      title: labResult.rows[0].title,
      version: vResult.rows[0].version_number,
      html_code: vResult.rows[0].html_code,
      scoring_config: vResult.rows[0].scoring_config,
    });
  } catch (err) {
    console.error('Get lab HTML error:', err.message);
    res.status(500).json({ error: 'Failed to get lab HTML' });
  }
});

// GET /api/labs/:id/versions - List all versions (public, requires API key)
router.get('/:id/versions', apiKeyAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, lab_id, version_number, changelog, created_at, created_by FROM lab_versions WHERE lab_id = $1 ORDER BY version_number DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List versions error:', err.message);
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// POST /api/labs - Create new lab (admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { title, title_sw, subject, description, description_sw, html_code, is_premium, scoring_config } = req.body;

    if (!title || !subject || !html_code) {
      return res.status(400).json({ error: 'title, subject, and html_code are required' });
    }

    const cleanHtml = await sanitizeHtml(html_code);

    const labResult = await query(
      `INSERT INTO labs (title, title_sw, subject, description, description_sw, is_premium)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, title_sw || null, subject, description || null, description_sw || null, is_premium || false]
    );

    const lab = labResult.rows[0];

    await query(
      `INSERT INTO lab_versions (lab_id, version_number, html_code, scoring_config, changelog, created_by)
       VALUES ($1, 1, $2, $3, $4, 'admin')`,
      [lab.id, cleanHtml, scoring_config ? JSON.stringify(scoring_config) : '{}', 'Initial version']
    );

    await auditLog('create', 'lab', lab.id, lab.title, { subject }, req.ip);

    res.status(201).json(lab);
  } catch (err) {
    console.error('Create lab error:', err.message);
    res.status(500).json({ error: 'Failed to create lab' });
  }
});

// PUT /api/labs/:id - Update lab metadata (admin only)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { title, title_sw, subject, description, description_sw, is_premium, is_published } = req.body;

    const result = await query(
      `UPDATE labs SET
        title = COALESCE($1, title),
        title_sw = COALESCE($2, title_sw),
        subject = COALESCE($3, subject),
        description = COALESCE($4, description),
        description_sw = COALESCE($5, description_sw),
        is_premium = COALESCE($6, is_premium),
        is_published = COALESCE($7, is_published),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [title, title_sw, subject, description, description_sw, is_premium, is_published, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    const lab = result.rows[0];
    let action = 'update';
    if (is_published !== undefined) {
      action = is_published ? 'publish' : 'unpublish';
    }

    await auditLog(action, 'lab', lab.id, lab.title, { changes: req.body }, req.ip);

    res.json(lab);
  } catch (err) {
    console.error('Update lab error:', err.message);
    res.status(500).json({ error: 'Failed to update lab' });
  }
});

// POST /api/labs/:id/versions - Create new version (admin only)
router.post('/:id/versions', adminAuth, async (req, res) => {
  try {
    const { html_code, scoring_config, changelog } = req.body;

    if (!html_code) {
      return res.status(400).json({ error: 'html_code is required' });
    }

    const labResult = await query('SELECT current_version, title FROM labs WHERE id = $1', [req.params.id]);
    if (labResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    const cleanHtml = await sanitizeHtml(html_code);
    const newVersion = labResult.rows[0].current_version + 1;

    const vResult = await query(
      `INSERT INTO lab_versions (lab_id, version_number, html_code, scoring_config, changelog, created_by)
       VALUES ($1, $2, $3, $4, $5, 'admin') RETURNING *`,
      [req.params.id, newVersion, cleanHtml, scoring_config ? JSON.stringify(scoring_config) : '{}', changelog || `Version ${newVersion}`]
    );

    await query(
      'UPDATE labs SET current_version = $1, updated_at = NOW() WHERE id = $2',
      [newVersion, req.params.id]
    );

    await auditLog('version', 'lab', req.params.id, labResult.rows[0].title, { version: newVersion, changelog }, req.ip);

    res.status(201).json(vResult.rows[0]);
  } catch (err) {
    console.error('Create version error:', err.message);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// POST /api/labs/:id/duplicate - Duplicate a lab (admin only)
router.post('/:id/duplicate', adminAuth, async (req, res) => {
  try {
    const existing = await query(
      `SELECT l.*, lv.html_code, lv.scoring_config
       FROM labs l
       LEFT JOIN lab_versions lv ON lv.lab_id = l.id AND lv.version_number = l.current_version
       WHERE l.id = $1`,
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    const src = existing.rows[0];
    const { title } = req.body;

    const labResult = await query(
      `INSERT INTO labs (title, title_sw, subject, description, description_sw, is_premium)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title || src.title + ' (copy)', src.title_sw, src.subject, src.description, src.description_sw, src.is_premium]
    );

    const lab = labResult.rows[0];

    await query(
      `INSERT INTO lab_versions (lab_id, version_number, html_code, scoring_config, changelog, created_by)
       VALUES ($1, 1, $2, $3, $4, 'admin')`,
      [lab.id, src.html_code || '', JSON.stringify(src.scoring_config || {}), 'Duplicated from: ' + src.title]
    );

    await auditLog('create', 'lab', lab.id, lab.title, { duplicated_from: req.params.id }, req.ip);

    res.status(201).json(lab);
  } catch (err) {
    console.error('Duplicate lab error:', err.message);
    res.status(500).json({ error: 'Failed to duplicate lab' });
  }
});

// DELETE /api/labs/:id - Delete lab (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const existing = await query('SELECT title FROM labs WHERE id = $1', [req.params.id]);
    const result = await query('DELETE FROM labs WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    await auditLog('delete', 'lab', result.rows[0].id, existing.rows[0]?.title, {}, req.ip);

    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Delete lab error:', err.message);
    res.status(500).json({ error: 'Failed to delete lab' });
  }
});

module.exports = router;
