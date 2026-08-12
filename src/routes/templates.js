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

// GET /api/templates - List all templates (public)
router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const { subject } = req.query;
    let sql = 'SELECT * FROM lab_templates';
    const params = [];

    if (subject) {
      params.push(subject);
      sql += ` WHERE subject = $1`;
    }

    sql += ' ORDER BY use_count DESC, name';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('List templates error:', err.message);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/templates/:id - Get template by ID
router.get('/:id', apiKeyAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM lab_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get template error:', err.message);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// POST /api/templates - Create template (admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, description, subject, html_template, default_scoring_config, tags } = req.body;
    if (!name || !subject || !html_template) {
      return res.status(400).json({ error: 'name, subject, and html_template are required' });
    }

    const cleanHtml = await sanitizeHtml(html_template);

    const result = await query(
      `INSERT INTO lab_templates (name, description, subject, html_template, default_scoring_config, tags)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description || null, subject, cleanHtml,
       JSON.stringify(default_scoring_config || {}),
       tags || []]
    );

    await auditLog('create', 'template', result.rows[0].id, name, { subject }, req.ip);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Template name already exists' });
    }
    console.error('Create template error:', err.message);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// POST /api/templates/:id/use - Create lab from template (admin)
router.post('/:id/use', adminAuth, async (req, res) => {
  try {
    const tmpl = await query('SELECT * FROM lab_templates WHERE id = $1', [req.params.id]);
    if (tmpl.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const t = tmpl.rows[0];
    const { title } = req.body;

    // Increment use count
    await query('UPDATE lab_templates SET use_count = use_count + 1 WHERE id = $1', [t.id]);

    await auditLog('use', 'template', t.id, t.name, { title: title || t.name + ' (from template)' }, req.ip);

    // Create lab from template
    const labResult = await query(
      `INSERT INTO labs (title, subject, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [title || t.name + ' (from template)', t.subject, t.description]
    );
    const lab = labResult.rows[0];

    // Create initial version from template
    const cleanHtml = await sanitizeHtml(t.html_template);
    await query(
      `INSERT INTO lab_versions (lab_id, version_number, html_code, scoring_config, changelog, created_by)
       VALUES ($1, 1, $2, $3, $4, 'admin')`,
      [lab.id, cleanHtml, JSON.stringify(t.default_scoring_config), 'Created from template: ' + t.name]
    );

    res.status(201).json(lab);
  } catch (err) {
    console.error('Use template error:', err.message);
    res.status(500).json({ error: 'Failed to create lab from template' });
  }
});

// PUT /api/templates/:id - Update template (admin)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { name, description, subject, html_template, default_scoring_config, tags } = req.body;

    let cleanHtml = html_template;
    if (cleanHtml !== undefined) {
      cleanHtml = await sanitizeHtml(cleanHtml);
    }

    const result = await query(
      `UPDATE lab_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        subject = COALESCE($3, subject),
        html_template = COALESCE($4, html_template),
        default_scoring_config = COALESCE($5, default_scoring_config),
        tags = COALESCE($6, tags),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, description, subject, cleanHtml,
       default_scoring_config ? JSON.stringify(default_scoring_config) : null,
       tags, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await auditLog('update', 'template', req.params.id, result.rows[0].name, null, req.ip);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update template error:', err.message);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/templates/:id - Delete template (admin, not system templates)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const tmpl = await query('SELECT is_system FROM lab_templates WHERE id = $1', [req.params.id]);
    if (tmpl.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (tmpl.rows[0].is_system) {
      return res.status(403).json({ error: 'Cannot delete system templates' });
    }

    await auditLog('delete', 'template', req.params.id, tmpl.rows[0].name || 'template', null, req.ip);

    await query('DELETE FROM lab_templates WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete template error:', err.message);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
