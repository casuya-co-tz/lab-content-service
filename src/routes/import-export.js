const express = require('express');
const { query, pool } = require('../db');
const { adminAuth } = require('../middleware/auth');
const { sanitizeHtml } = require('../sanitize');

const router = express.Router();

// GET /api/export/labs - Export all labs as JSON
router.get('/export/labs', adminAuth, async (req, res) => {
  try {
    const labsResult = await query(`
      SELECT l.*, 
        (SELECT json_agg(json_build_object(
          'version_number', lv.version_number,
          'html_code', lv.html_code,
          'scoring_config', lv.scoring_config,
          'changelog', lv.changelog,
          'created_at', lv.created_at,
          'created_by', lv.created_by
        ) ORDER BY lv.version_number)
        FROM lab_versions lv WHERE lv.lab_id = l.id) as versions
      FROM labs l
      ORDER BY l.subject, l.title
    `);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="labs-export.json"');
    res.json({
      exported_at: new Date().toISOString(),
      count: labsResult.rows.length,
      labs: labsResult.rows,
    });
  } catch (err) {
    console.error('Export labs error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/export/templates - Export all templates
router.get('/export/templates', adminAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM lab_templates ORDER BY name');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="templates-export.json"');
    res.json({
      exported_at: new Date().toISOString(),
      count: result.rows.length,
      templates: result.rows,
    });
  } catch (err) {
    console.error('Export templates error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// POST /api/import/labs - Import labs from JSON
router.post('/import/labs', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { labs } = req.body;
    if (!labs || !Array.isArray(labs)) {
      return res.status(400).json({ error: 'labs array is required' });
    }

    await client.query('BEGIN');
    const results = [];

    for (const lab of labs) {
      const labResult = await client.query(
        `INSERT INTO labs (title, title_sw, subject, description, description_sw, is_premium, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [lab.title, lab.title_sw || null, lab.subject, lab.description || null,
         lab.description_sw || null, lab.is_premium || false, lab.is_published || false]
      );

      const newLab = labResult.rows[0];

      if (lab.versions && lab.versions.length > 0) {
        for (const v of lab.versions) {
          const cleanHtml = await sanitizeHtml(v.html_code);
          await client.query(
            `INSERT INTO lab_versions (lab_id, version_number, html_code, scoring_config, changelog, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [newLab.id, v.version_number, cleanHtml,
             typeof v.scoring_config === 'string' ? v.scoring_config : JSON.stringify(v.scoring_config || {}),
             v.changelog || 'Imported', v.created_by || 'import']
          );
        }

        const maxVersion = Math.max(...lab.versions.map(v => v.version_number));
        await client.query('UPDATE labs SET current_version = $1 WHERE id = $2', [maxVersion, newLab.id]);
      } else if (lab.html_code) {
        const cleanHtml = await sanitizeHtml(lab.html_code);
        await client.query(
          `INSERT INTO lab_versions (lab_id, version_number, html_code, scoring_config, changelog, created_by)
           VALUES ($1, 1, $2, '{}', 'Imported', 'import')`,
          [newLab.id, cleanHtml]
        );
      }

      results.push(newLab);
    }

    await client.query('COMMIT');
    res.status(201).json({ imported: results.length, labs: results });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import labs error:', err.message);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/import/templates - Import templates from JSON
router.post('/import/templates', adminAuth, async (req, res) => {
  try {
    const { templates } = req.body;
    if (!templates || !Array.isArray(templates)) {
      return res.status(400).json({ error: 'templates array is required' });
    }

    const results = [];
    for (const t of templates) {
      try {
        const result = await query(
          `INSERT INTO lab_templates (name, description, subject, html_template, default_scoring_config, tags)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (name) DO UPDATE SET
             description = EXCLUDED.description,
             subject = EXCLUDED.subject,
             html_template = EXCLUDED.html_template,
             default_scoring_config = EXCLUDED.default_scoring_config,
             tags = EXCLUDED.tags,
             updated_at = NOW()
           RETURNING *`,
          [t.name, t.description || null, t.subject, t.html_template,
           JSON.stringify(t.default_scoring_config || {}), t.tags || []]
        );
        results.push(result.rows[0]);
      } catch (e) {
        console.error(`Import template "${t.name}" error:`, e.message);
      }
    }

    res.status(201).json({ imported: results.length, templates: results });
  } catch (err) {
    console.error('Import templates error:', err.message);
    res.status(500).json({ error: 'Import failed' });
  }
});

module.exports = router;
