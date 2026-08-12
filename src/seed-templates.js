require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const templates = [
  {
    name: 'Chemistry Titration',
    description: 'Interactive acid-base titration simulation with burette and flask',
    subject: 'chemistry',
    tags: ['titration', 'acid-base', 'chemistry-lab'],
    file: 'chemistry-titration.html',
  },
  {
    name: 'Ohm\'s Law Circuit',
    description: 'Interactive circuit with adjustable voltage and resistance to explore Ohm\'s Law',
    subject: 'physics',
    tags: ['ohms-law', 'circuit', 'electronics'],
    file: 'physics-ohms-law.html',
  },
  {
    name: 'Cell Biology Explorer',
    description: 'Interactive animal cell model with clickable organelles',
    subject: 'biology',
    tags: ['cell', 'organelles', 'biology-lab'],
    file: 'biology-cell-explorer.html',
  },
  {
    name: 'Pythagorean Theorem',
    description: 'Visual proof and interactive calculator for the Pythagorean theorem',
    subject: 'mathematics',
    tags: ['pythagorean', 'geometry', 'theorem'],
    file: 'math-pythagorean.html',
  },
];

async function seed() {
  const templatesDir = path.join(__dirname, '..', 'templates');

  for (const t of templates) {
    const filePath = path.join(templatesDir, t.file);
    if (!fs.existsSync(filePath)) {
      console.error(`  SKIP: Template file not found: ${t.file}`);
      continue;
    }

    const html = fs.readFileSync(filePath, 'utf8');

    try {
      await pool.query(
        `INSERT INTO lab_templates (name, description, subject, html_template, tags, is_system)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           subject = EXCLUDED.subject,
           html_template = EXCLUDED.html_template,
           tags = EXCLUDED.tags,
           updated_at = NOW()`,
        [t.name, t.description, t.subject, html, t.tags]
      );
      console.log(`  OK: ${t.name}`);
    } catch (err) {
      console.error(`  FAILED: ${t.name} — ${err.message}`);
    }
  }

  console.log('Template seeding complete.');
  await pool.end();
}

seed();
