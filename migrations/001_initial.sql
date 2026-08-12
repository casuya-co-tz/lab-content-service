-- Lab Content Service Schema
-- Run: psql -U postgres -d lab_content -f migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  title_sw TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  description_sw TEXT,
  current_version INTEGER DEFAULT 1,
  is_published BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  html_code TEXT NOT NULL,
  scoring_config JSONB DEFAULT '{}',
  changelog TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin',
  UNIQUE(lab_id, version_number)
);

CREATE TABLE IF NOT EXISTS lab_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_versions_lab_id ON lab_versions(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_versions_version ON lab_versions(lab_id, version_number);
CREATE INDEX IF NOT EXISTS idx_labs_subject ON labs(subject);
CREATE INDEX IF NOT EXISTS idx_labs_published ON labs(is_published);

-- Seed: create the scoring protocol schema
INSERT INTO lab_schemas (name, description, fields) VALUES
('postMessage-protocol', 'Standard protocol for lab HTML to send scores to CASUYA', '[
  {"key": "type", "type": "string", "required": true, "description": "Always \"lab-progress\""},
  {"key": "status", "type": "string", "required": true, "enum": ["in_progress", "completed"], "description": "Progress status"},
  {"key": "score", "type": "number", "required": true, "description": "Score 0-100"},
  {"key": "completion_data", "type": "object", "required": false, "description": "Optional extra data about the lab completion"}
]')
ON CONFLICT (name) DO NOTHING;
