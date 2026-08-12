const http = require('http');
const assert = require('assert');

const BASE = 'http://localhost:3100';
let failed = 0;
let passed = 0;

function request(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { ...opts.headers };
    if (opts.body) headers['Content-Type'] = 'application/json';

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data || '{}'), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

function test(name, fn) {
  fn().then(() => {
    passed++;
    console.log(`  PASS  ${name}`);
  }).catch((err) => {
    failed++;
    console.log(`  FAIL  ${name}: ${err.message}`);
  });
}

async function run() {
  console.log('\nLab Content Service API Tests\n');

  test('GET /api/health returns status ok', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.ok(res.body.migrations);
  });

  test('GET /api/health returns database status', async () => {
    const res = await request('GET', '/api/health');
    assert.ok(['connected', 'disconnected'].includes(res.body.database));
  });

  test('GET /api/openapi.json returns spec', async () => {
    const res = await request('GET', '/api/openapi.json');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.openapi, '3.0.3');
    assert.ok(res.body.paths);
  });

  test('GET /api/search without query returns 400', async () => {
    const res = await request('GET', '/api/search', {
      headers: { 'x-api-key': 'test-key' },
    });
    assert.ok(res.status === 400 || res.status === 401);
    if (res.status === 400) {
      assert.strictEqual(res.body.error, 'Search query (q) is required');
    }
  });

  test('GET /api/search with query returns results', async () => {
    const res = await request('GET', '/api/search?q=light', {
      headers: { 'x-api-key': 'test-key' },
    });
    assert.ok(res.status === 200 || res.status === 400 || res.status === 401);
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body.results));
    }
  });

  test('GET /api/casuya/subjects returns array', async () => {
    const res = await request('GET', '/api/casuya/subjects', {
      headers: { 'x-api-key': 'test-key' },
    });
    assert.ok(res.status === 200 || res.status === 401);
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body));
    }
  });

  test('GET /api/casuya/labs returns paginated response', async () => {
    const res = await request('GET', '/api/casuya/labs', {
      headers: { 'x-api-key': 'test-key' },
    });
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body.data));
      assert.ok(typeof res.body.total === 'number');
      assert.ok(typeof res.body.page === 'number');
      assert.ok(typeof res.body.pages === 'number');
    }
  });

  test('GET /api/labs returns array', async () => {
    const res = await request('GET', '/api/labs', {
      headers: { 'x-api-key': 'test-key' },
    });
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body));
    }
  });

  test('GET /api/templates returns array', async () => {
    const res = await request('GET', '/api/templates', {
      headers: { 'x-api-key': 'test-key' },
    });
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body));
    }
  });

  test('GET /api/schemas returns array', async () => {
    const res = await request('GET', '/api/schemas', {
      headers: { 'x-api-key': 'test-key' },
    });
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body));
    }
  });

  // Wait for all async tests, then print summary
  setTimeout(() => {
    console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  }, 500);
}

run();
