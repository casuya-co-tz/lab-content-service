# Lab Content Service

**Standalone HTML content management service for the CASUYA Virtual Lab Platform**

---

## Objectives

1. **Store and version** all interactive lab HTML code independently from CASUYA
2. **Provide a clean API** for CASUYA to fetch published labs at runtime
3. **Give admins a visual editor** to create, edit, preview, and publish labs without touching the database
4. **Support rapid lab creation** through pre-built templates (titration, circuits, biology, math)
5. **Track all changes** via audit logging — who changed what, when
6. **Enable full-text search** across all lab content
7. **Stay isolated** — this service runs independently on port 3100, CASUYA talks to it via HTTP

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CASUYA Platform                      │
│                   (port 3000)                           │
│                                                         │
│  Student opens lab → CASUYA calls API → gets HTML       │
│  HTML renders in iframe → posts score back via message  │
└───────────────────────┬─────────────────────────────────┘
                        │
                   HTTP GET /api/casuya/labs
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Lab Content Service                        │
│                 (port 3100)                              │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐     │
│  │  Express  │  │ Routes   │  │  PostgreSQL DB    │     │
│  │  Server   │──│ API      │──│  lab_content      │     │
│  └──────────┘  └──────────┘  │                    │     │
│       │                       │  labs              │     │
│       │                       │  lab_versions      │     │
│  ┌────┴─────┐                 │  lab_templates     │     │
│  │  Editor   │                │  lab_schemas       │     │
│  │  UI       │                │  audit_log         │     │
│  │  (HTML)   │                │  lab_access_log    │     │
│  └──────────┘                 │  lab_tags           │     │
│                               └───────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

---

## File Directory

```
lab-content-service/
│
├── .env                          # Environment variables (DB, auth, ports)
├── .env.example                  # Template for .env
├── .gitignore                    # Git ignore rules
├── .dockerignore                 # Docker build exclusions
├── Dockerfile                    # Production Docker image
├── docker-compose.yml            # Full stack: PostgreSQL + app + auto-migrate
├── package.json                  # Dependencies and scripts
│
├── migrations/
│   ├── 001_initial.sql           # Core tables: labs, lab_versions, lab_schemas
│   └── 002_audit_templates_search.sql  # audit_log, lab_templates, tags, full-text search, access log
│
├── templates/                    # HTML template files (used by seed script)
│   ├── chemistry-titration.html  # Interactive acid-base titration with burette/flask
│   ├── physics-ohms-law.html     # Adjustable voltage/resistance SVG circuit
│   ├── biology-cell-explorer.html # Clickable organelles with scoring
│   └── math-pythagorean.html     # Visual proof with animated triangle
│
└── src/
    ├── server.js                 # Express server setup, routes, middleware, health check
    ├── db.js                     # PostgreSQL connection pool
    ├── migrate.js                # Runs SQL files from migrations/ in order
    ├── seed-templates.js         # Seeds templates from templates/ directory into DB
    │
    ├── middleware/
    │   └── auth.js               # apiKeyAuth (x-api-key header) + adminAuth (Basic auth)
    │
    ├── routes/
    │   ├── labs.js               # CRUD for labs + versioning + audit logging
    │   ├── casuya.js             # CASUYA-specific endpoints (published labs, subjects, search, analytics)
    │   ├── schemas.js            # Scoring protocol schema management
    │   ├── templates.js          # Lab template CRUD + "create lab from template"
    │   ├── audit.js              # Audit log query API (admin only)
    │   ├── search.js             # Full-text search across all labs
    │   └── import-export.js      # Bulk JSON import/export for labs and templates
    │
    └── views/
        └── public/
            ├── index.html        # Dashboard: stats, subject chart, activity feed, lab list, templates
            └── editor.html       # Admin editor: split-pane code/preview, snippets, search, versioning
```

---

## Database Schema

### labs
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| title | TEXT | Lab title |
| title_sw | TEXT | Swahili translation (optional) |
| subject | TEXT | chemistry, physics, biology, mathematics |
| description | TEXT | Lab description |
| description_sw | TEXT | Swahili description (optional) |
| current_version | INTEGER | Active version number |
| is_published | BOOLEAN | Whether CASUYA can see this lab |
| is_premium | BOOLEAN | Premium content flag |
| search_vector | TSVECTOR | Full-text search index (auto-updated) |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

### lab_versions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| lab_id | UUID | FK → labs.id (cascade delete) |
| version_number | INTEGER | Version number (unique per lab) |
| html_code | TEXT | The actual HTML content |
| scoring_config | JSONB | Scoring rules (postMessage protocol) |
| changelog | TEXT | What changed in this version |
| created_by | TEXT | Who created it |
| created_at | TIMESTAMPTZ | When it was created |

### lab_templates
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Template name (unique) |
| description | TEXT | What this template does |
| subject | TEXT | Subject area |
| html_template | TEXT | Full HTML code for the template |
| default_scoring_config | JSONB | Default scoring rules |
| tags | TEXT[] | Array of tags |
| is_system | BOOLEAN | System templates can't be deleted |
| use_count | INTEGER | How many labs were created from this |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

### audit_log
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| action | TEXT | create, update, delete, publish, unpublish, version |
| entity_type | TEXT | lab, template, schema |
| entity_id | UUID | ID of the affected entity |
| entity_title | TEXT | Human-readable name |
| details | JSONB | What changed |
| performed_by | TEXT | Who performed the action (default: admin) |
| ip_address | TEXT | Admin's IP |
| created_at | TIMESTAMPTZ | When it happened |

### lab_access_log
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| lab_id | UUID | FK → labs.id |
| endpoint | TEXT | Which endpoint was called |
| ip_address | TEXT | Requester IP |
| user_agent | TEXT | Browser/client info |
| created_at | TIMESTAMPTZ | When it happened |

### lab_schemas
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Schema name (unique) |
| description | TEXT | What this schema defines |
| fields | JSONB | Field definitions |
| created_at | TIMESTAMPTZ | Creation timestamp |

### lab_tags
| Column | Type | Description |
|--------|------|-------------|
| lab_id | UUID | FK → labs.id (cascade delete) |
| tag | TEXT | Tag name |

---

## API Reference

### Authentication

**API Key** (for read endpoints):
```
Header: x-api-key: lab-content-secret-key-change-in-production
  OR
Query:  ?api_key=lab-content-secret-key-change-in-production
```

**Basic Auth** (for admin/write endpoints):
```
Header: Authorization: Basic base64(admin:admin123)
```

### Endpoints

#### Health
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | None | `/api/health` | Health check with DB status + uptime |

#### Labs (Content CRUD)
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | API Key | `/api/labs` | List all labs (filter: `?subject=`, `?published=true`) |
| GET | API Key | `/api/labs/:id` | Get lab details |
| GET | API Key | `/api/labs/:id/html` | Get HTML code (optional: `?version=2`) |
| GET | API Key | `/api/labs/:id/versions` | List version history |
| POST | Admin | `/api/labs` | Create new lab (body: title, subject, html_code) |
| PUT | Admin | `/api/labs/:id` | Update lab metadata |
| POST | Admin | `/api/labs/:id/versions` | Publish new version (body: html_code, changelog) |
| DELETE | Admin | `/api/labs/:id` | Delete lab |

#### CASUYA Integration
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | API Key | `/api/casuya/labs` | All published labs with HTML (filter: `?subject=`) |
| GET | API Key | `/api/casuya/labs/:id` | Single published lab with HTML |
| GET | API Key | `/api/casuya/subjects` | Subjects with lab counts |
| GET | API Key | `/api/casuya/search?q=term` | Search published labs |
| GET | API Key | `/api/casuya/analytics` | Lab access statistics |

#### Templates
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | API Key | `/api/templates` | List all templates (filter: `?subject=`) |
| GET | API Key | `/api/templates/:id` | Get template details |
| POST | Admin | `/api/templates` | Create new template |
| PUT | Admin | `/api/templates/:id` | Update template |
| POST | Admin | `/api/templates/:id/use` | Create lab from template |
| DELETE | Admin | `/api/templates/:id` | Delete template (not system ones) |

#### Search
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | API Key | `/api/search?q=term` | Full-text search (filter: `?subject=`) |
| GET | API Key | `/api/search/tags` | All tags with counts |

#### Schemas
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | API Key | `/api/schemas` | List all scoring schemas |
| GET | API Key | `/api/schemas/:name` | Get schema by name |
| POST | Admin | `/api/schemas` | Create new schema |

#### Audit Log
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | Admin | `/api/audit` | List audit entries (filter: `?entity_type=`, `?action=`, `?limit=50`) |
| POST | Admin | `/api/audit` | Record manual audit entry |

#### Import/Export
| Method | Auth | Endpoint | Description |
|--------|------|----------|-------------|
| GET | Admin | `/api/export/labs` | Export all labs + versions as JSON file |
| GET | Admin | `/api/export/templates` | Export all templates as JSON file |
| POST | Admin | `/api/import/labs` | Import labs from JSON (body: { labs: [...] }) |
| POST | Admin | `/api/import/templates` | Import templates from JSON (body: { templates: [...] }) |

---

## CASUYA Integration

CASUYA connects to this service via HTTP. In your CASUYA code:

### Fetch all published labs
```javascript
const res = await fetch('http://localhost:3100/api/casuya/labs', {
  headers: { 'x-api-key': 'lab-content-secret-key-change-in-production' }
});
const labs = await res.json();
// labs = [{ id, title, subject, html_code, scoring_config, ... }]
```

### Fetch a single lab
```javascript
const res = await fetch(`http://localhost:3100/api/casuya/labs/${labId}`, {
  headers: { 'x-api-key': 'lab-content-secret-key-change-in-production' }
});
const lab = await res.json();
// lab.html_code = full HTML to render in iframe
```

### Render in CASUYA
```html
<iframe srcdoc="<lab HTML code>" sandbox="allow-scripts"></iframe>
```

### Receive scores from lab
Labs send scores back via postMessage:
```javascript
window.addEventListener('message', (event) => {
  if (event.data.type === 'lab-progress') {
    // event.data = { type: "lab-progress", status: "completed", score: 100, completion_data: {...} }
    handleLabScore(event.data);
  }
});
```

### Search labs
```javascript
const res = await fetch('http://localhost:3100/api/casuya/search?q=titration', {
  headers: { 'x-api-key': 'lab-content-secret-key-change-in-production' }
});
const { results } = await res.json();
```

---

## Setup & Deployment

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
copy .env.example .env
# Edit .env with your PostgreSQL credentials and secrets

# 3. Create the database
psql -U postgres -c "CREATE DATABASE lab_content"

# 4. Run migrations
npm run migrate

# 5. Seed templates
npm run seed

# 6. Start dev server (auto-restarts on file changes)
npm run dev
```

### Docker Deployment
```bash
# Starts PostgreSQL + app + auto-migration
docker compose up -d

# View logs
docker compose logs -f app

# Stop everything
docker compose down

# Full reset (destroys data)
docker compose down -v && docker compose up -d
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3100 | Server port |
| HOST | 127.0.0.1 | Bind address (use 0.0.0.0 for Docker) |
| PGHOST | 127.0.0.1 | PostgreSQL host |
| PGPORT | 5432 | PostgreSQL port |
| PGUSER | postgres | PostgreSQL user |
| PGPASSWORD | — | PostgreSQL password |
| PGDATABASE | lab_content | Database name |
| API_KEY | lab-content-secret-key-change-in-production | API key for read access |
| ADMIN_PASSWORD | admin123 | Admin Basic auth password |
| CASUYA_ORIGIN | http://localhost:3000 | Allowed CORS origin |

---

## Rules & Conventions

### Content Rules
1. **Every lab must have HTML** — the `html_code` field is required on creation
2. **Version numbers are sequential** — each publish increments by 1, no gaps
3. **Only published labs are visible to CASUYA** — drafts are admin-only
4. **System templates cannot be deleted** — only admin-created ones
5. **All HTML labs should use postMessage** to report scores back to CASUYA

### API Rules
6. **Read endpoints use API key** — pass via `x-api-key` header or `?api_key=` query param
7. **Write endpoints use Basic Auth** — `admin:admin123` (change in production)
8. **All writes are audit-logged** — create, update, delete, publish, version
9. **Rate limit: 200 requests/minute** per IP on all `/api` routes
10. **Import uses transactions** — if one lab fails, the entire import rolls back

### Code Rules
11. **No comments in code** unless explicitly requested
12. **Follow existing patterns** — Express router style, pg parameterized queries
13. **HTML templates live in `/templates/` directory** — seeded via JS, not SQL
14. **Never commit `.env`** — contains secrets
15. **Migrations are sequential** — 001, 002, 003... never reorder

### Security Rules
16. **Never log passwords or API keys**
17. **Use parameterized queries** — never string concatenation for SQL
18. **CORS is restricted** — only CASUYA_ORIGIN can access from browsers
19. **Admin credentials are Basic Auth** — consider JWT for production
20. **PostgreSQL password in `.env`** — never in code or committed files

---

## PostMessage Protocol

Labs communicate with CASUYA via `window.parent.postMessage()`:

```json
{
  "type": "lab-progress",
  "status": "completed | in_progress",
  "score": 85,
  "completion_data": {
    "attempts": 3,
    "time_spent": 120,
    "details": "..."
  }
}
```

CASUYA listens for this:
```javascript
window.addEventListener('message', (e) => {
  if (e.data.type === 'lab-progress') {
    // Save score, update progress, etc.
  }
});
```

---

## Available Templates

| Template | Subject | What It Does |
|----------|---------|-------------|
| Chemistry Titration | chemistry | Interactive burette/flask with pH calculation, auto-scores at equivalence point |
| Ohm's Law Circuit | physics | Adjustable voltage/resistance with SVG circuit diagram, live current/power readings |
| Cell Biology Explorer | biology | Clickable organelles with descriptions, progress tracking, scores when all 6 discovered |
| Pythagorean Theorem | mathematics | Visual proof with animated SVG triangle, adjustable sides, random values |

---

## Quick Reference

```bash
# Run everything
npm run migrate && npm run seed && npm run dev

# Docker one-liner
docker compose up -d

# Health check
curl http://localhost:3100/api/health

# Fetch all labs for CASUYA
curl -H "x-api-key: lab-content-secret-key-change-in-production" \
  http://localhost:3100/api/casuya/labs

# Open dashboard
start http://localhost:3100/

# Open editor
start http://localhost:3100/editor
```
