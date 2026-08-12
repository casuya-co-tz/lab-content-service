require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const labsRouter = require('./routes/labs');
const schemasRouter = require('./routes/schemas');
const casuyaRouter = require('./routes/casuya');
const auditRouter = require('./routes/audit');
const templatesRouter = require('./routes/templates');
const searchRouter = require('./routes/search');
const importExportRouter = require('./routes/import-export');
const openapiRouter = require('./routes/openapi');

const app = express();
const PORT = parseInt(process.env.PORT || '3100');
const HOST = process.env.HOST || '127.0.0.1';

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

app.use(cors({
  origin: process.env.CASUYA_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests' },
});

app.use('/api', apiLimiter);

app.use(express.static(path.join(__dirname, 'views', 'public')));

// Routes
app.use('/api/labs', labsRouter);
app.use('/api/schemas', schemasRouter);
app.use('/api/casuya', casuyaRouter);
app.use('/api/audit', auditRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/search', searchRouter);
app.use('/api', importExportRouter);
app.use('/api/openapi.json', openapiRouter);

// Health check with more info
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    service: 'lab-content-service',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  // Check database
  try {
    const { query } = require('./db');
    const dbResult = await query('SELECT NOW() as time');
    health.database = 'connected';
    health.db_time = dbResult.rows[0].time;

    // Verify migration state
    const tables = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    const tableNames = tables.rows.map(r => r.table_name);
    const expectedTables = ['labs', 'lab_versions', 'lab_schemas', 'audit_log', 'lab_templates', 'lab_tags', 'lab_access_log'];
    const missing = expectedTables.filter(t => !tableNames.includes(t));
    health.migrations = {
      tables_found: tableNames.length,
      expected: expectedTables.length,
      complete: missing.length === 0,
      missing_tables: missing.length > 0 ? missing : undefined,
    };
    if (!health.migrations.complete) health.status = 'degraded';

    // Check search_vector column exists
    const sv = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'labs' AND column_name = 'search_vector'`
    );
    health.fulltext_search = sv.rows.length > 0;
  } catch (e) {
    health.database = 'disconnected';
    health.status = 'degraded';
  }

  res.json(health);
});

// Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'public', 'index.html'));
});

// Editor
app.get('/editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'public', 'editor.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     Lab Content Service v2.0.0           ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║  Dashboard:  http://${HOST}:${PORT}/       ║`);
  console.log(`  ║  Editor:     http://${HOST}:${PORT}/editor  ║`);
  console.log(`  ║  API:        http://${HOST}:${PORT}/api      ║`);
  console.log(`  ║  CASUYA:     http://${HOST}:${PORT}/api/casuya ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});
