const express = require('express');
const router = express.Router();

const SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Lab Content Service API',
    version: '2.0.0',
    description: 'Standalone HTML lab content management for the CASUYA Virtual Lab Platform',
  },
  servers: [
    { url: 'http://localhost:3100', description: 'Local development' },
  ],
  components: {
    securitySchemes: {
      ApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key for read endpoints',
      },
      BasicAuth: {
        type: 'http',
        scheme: 'basic',
        description: 'Basic auth (admin:password) for write endpoints',
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        tags: ['System'],
        security: [],
        responses: {
          '200': { description: 'Service health status including DB and migrations' },
        },
      },
    },
    '/api/labs': {
      get: {
        summary: 'List all labs',
        tags: ['Labs'],
        security: [{ ApiKey: [] }],
        parameters: [
          { name: 'subject', in: 'query', schema: { type: 'string' }, description: 'Filter by subject' },
          { name: 'published', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Filter by published status' },
        ],
        responses: { '200': { description: 'Array of labs' } },
      },
      post: {
        summary: 'Create a new lab',
        tags: ['Labs'],
        security: [{ BasicAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'subject', 'html_code'],
                properties: {
                  title: { type: 'string' },
                  title_sw: { type: 'string' },
                  subject: { type: 'string', enum: ['physics', 'chemistry', 'biology', 'mathematics'] },
                  description: { type: 'string' },
                  html_code: { type: 'string' },
                  is_premium: { type: 'boolean' },
                  scoring_config: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Lab created' },
          '400': { description: 'Missing required fields' },
        },
      },
    },
    '/api/labs/{id}': {
      get: {
        summary: 'Get lab details',
        tags: ['Labs'],
        security: [{ ApiKey: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Lab details' }, '404': { description: 'Not found' } },
      },
      put: {
        summary: 'Update lab metadata',
        tags: ['Labs'],
        security: [{ BasicAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Lab updated' } },
      },
      delete: {
        summary: 'Delete a lab',
        tags: ['Labs'],
        security: [{ BasicAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Lab deleted' }, '404': { description: 'Not found' } },
      },
    },
    '/api/labs/{id}/html': {
      get: {
        summary: 'Get lab HTML code',
        tags: ['Labs'],
        security: [{ ApiKey: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'version', in: 'query', schema: { type: 'integer' }, description: 'Version number (default: latest)' },
        ],
        responses: { '200': { description: 'Lab HTML content' } },
      },
    },
    '/api/labs/{id}/versions': {
      get: {
        summary: 'List version history',
        tags: ['Labs'],
        security: [{ ApiKey: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Array of versions' } },
      },
      post: {
        summary: 'Publish new version',
        tags: ['Labs'],
        security: [{ BasicAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '201': { description: 'Version created' } },
      },
    },
    '/api/labs/{id}/duplicate': {
      post: {
        summary: 'Duplicate a lab',
        tags: ['Labs'],
        security: [{ BasicAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { title: { type: 'string', description: 'New title (default: "Original (copy)")' } },
              },
            },
          },
        },
        responses: { '201': { description: 'Lab duplicated' } },
      },
    },
    '/api/casuya/labs': {
      get: {
        summary: 'List published labs for CASUYA',
        tags: ['CASUYA Integration'],
        security: [{ ApiKey: [] }],
        parameters: [
          { name: 'subject', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: 'Paginated published labs with HTML' } },
      },
    },
    '/api/casuya/labs/{id}': {
      get: {
        summary: 'Get single published lab for CASUYA',
        tags: ['CASUYA Integration'],
        security: [{ ApiKey: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Lab with HTML' }, '404': { description: 'Not found' } },
      },
    },
    '/api/casuya/subjects': {
      get: {
        summary: 'Subjects with lab counts',
        tags: ['CASUYA Integration'],
        security: [{ ApiKey: [] }],
        responses: { '200': { description: 'Array of subjects with counts' } },
      },
    },
    '/api/casuya/search': {
      get: {
        summary: 'Search published labs',
        tags: ['CASUYA Integration'],
        security: [{ ApiKey: [] }],
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Search results' } },
      },
    },
    '/api/casuya/analytics': {
      get: {
        summary: 'Lab access analytics',
        tags: ['CASUYA Integration'],
        security: [{ BasicAuth: [] }],
        responses: { '200': { description: 'Access counts per lab' } },
      },
    },
    '/api/casuya/analytics/timeseries': {
      get: {
        summary: 'Daily access time-series',
        tags: ['CASUYA Integration'],
        security: [{ BasicAuth: [] }],
        responses: { '200': { description: 'Daily access counts for last 30 days' } },
      },
    },
    '/api/casuya/analytics/top-labs': {
      get: {
        summary: 'Most accessed labs this week',
        tags: ['CASUYA Integration'],
        security: [{ BasicAuth: [] }],
        responses: { '200': { description: 'Top 10 labs by weekly access' } },
      },
    },
    '/api/templates': {
      get: {
        summary: 'List all templates',
        tags: ['Templates'],
        security: [{ ApiKey: [] }],
        parameters: [{ name: 'subject', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Array of templates' } },
      },
      post: {
        summary: 'Create a template',
        tags: ['Templates'],
        security: [{ BasicAuth: [] }],
        responses: { '201': { description: 'Template created' } },
      },
    },
    '/api/templates/{id}': {
      get: {
        summary: 'Get template details',
        tags: ['Templates'],
        security: [{ ApiKey: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Template details' } },
      },
      put: {
        summary: 'Update template',
        tags: ['Templates'],
        security: [{ BasicAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Template updated' } },
      },
      delete: {
        summary: 'Delete template (not system)',
        tags: ['Templates'],
        security: [{ BasicAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Template deleted' }, '403': { description: 'Cannot delete system templates' } },
      },
    },
    '/api/search': {
      get: {
        summary: 'Full-text search across labs',
        tags: ['Search'],
        security: [{ ApiKey: [] }],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'subject', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: 'Search results with rank' } },
      },
    },
    '/api/search/tags': {
      get: {
        summary: 'All tags with counts',
        tags: ['Search'],
        security: [{ ApiKey: [] }],
        responses: { '200': { description: 'Tags with usage counts' } },
      },
    },
    '/api/schemas': {
      get: {
        summary: 'List scoring schemas',
        tags: ['Schemas'],
        security: [{ ApiKey: [] }],
        responses: { '200': { description: 'Array of schemas' } },
      },
      post: {
        summary: 'Create scoring schema',
        tags: ['Schemas'],
        security: [{ BasicAuth: [] }],
        responses: { '201': { description: 'Schema created' } },
      },
    },
    '/api/audit': {
      get: {
        summary: 'List audit log entries',
        tags: ['Audit'],
        security: [{ BasicAuth: [] }],
        parameters: [
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: 'Paginated audit entries' } },
      },
      post: {
        summary: 'Record audit entry',
        tags: ['Audit'],
        security: [{ BasicAuth: [] }],
        responses: { '201': { description: 'Audit entry created' } },
      },
    },
    '/api/export/labs': {
      get: {
        summary: 'Export all labs with versions',
        tags: ['Import/Export'],
        security: [{ BasicAuth: [] }],
        responses: { '200': { description: 'JSON file download' } },
      },
    },
    '/api/export/templates': {
      get: {
        summary: 'Export all templates',
        tags: ['Import/Export'],
        security: [{ BasicAuth: [] }],
        responses: { '200': { description: 'JSON file download' } },
      },
    },
    '/api/import/labs': {
      post: {
        summary: 'Import labs from JSON',
        tags: ['Import/Export'],
        security: [{ BasicAuth: [] }],
        responses: { '201': { description: 'Import result with count' } },
      },
    },
    '/api/import/templates': {
      post: {
        summary: 'Import templates from JSON',
        tags: ['Import/Export'],
        security: [{ BasicAuth: [] }],
        responses: { '201': { description: 'Import result with count' } },
      },
    },
  },
};

router.get('/', (req, res) => {
  res.json(SPEC);
});

module.exports = router;
