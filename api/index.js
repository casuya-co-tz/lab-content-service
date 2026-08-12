require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const labsRouter = require('../src/routes/labs');
const schemasRouter = require('../src/routes/schemas');
const casuyaRouter = require('../src/routes/casuya');
const auditRouter = require('../src/routes/audit');
const templatesRouter = require('../src/routes/templates');
const searchRouter = require('../src/routes/search');
const importExportRouter = require('../src/routes/import-export');
const openapiRouter = require('../src/routes/openapi');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

app.use(cors({
  origin: process.env.CASUYA_ORIGIN || '*',
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

app.use('/api/labs', labsRouter);
app.use('/api/schemas', schemasRouter);
app.use('/api/casuya', casuyaRouter);
app.use('/api/audit', auditRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/search', searchRouter);
app.use('/api', importExportRouter);
app.use('/api/openapi.json', openapiRouter);

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    service: 'lab-content-service',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  };
  try {
    const { query } = require('../src/db');
    await query('SELECT NOW() as time');
    health.database = 'connected';
  } catch (e) {
    health.database = 'disconnected';
    health.status = 'degraded';
  }
  res.json(health);
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

module.exports = app;
