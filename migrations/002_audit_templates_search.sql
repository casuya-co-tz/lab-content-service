-- Migration 002: Audit log, lab templates, tags, full-text search

-- Audit log for tracking all changes
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_title TEXT,
  details JSONB DEFAULT '{}',
  performed_by TEXT DEFAULT 'admin',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Lab templates for quick lab creation
CREATE TABLE IF NOT EXISTS lab_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  subject TEXT NOT NULL,
  html_template TEXT NOT NULL,
  default_scoring_config JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_subject ON lab_templates(subject);
CREATE INDEX IF NOT EXISTS idx_templates_tags ON lab_templates USING GIN(tags);

-- Tags table for labs
CREATE TABLE IF NOT EXISTS lab_tags (
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (lab_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_lab_tags_tag ON lab_tags(tag);

-- Full-text search support
ALTER TABLE labs ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_labs_search ON labs USING GIN(search_vector);

-- Populate search vector for existing labs
UPDATE labs SET search_vector =
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(title_sw, '') || ' ' || coalesce(description, '') || ' ' || coalesce(description_sw, '') || ' ' || coalesce(subject, ''));

-- Trigger to keep search vector updated
CREATE OR REPLACE FUNCTION labs_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.title_sw, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.description_sw, '') || ' ' || coalesce(NEW.subject, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_labs_search ON labs;
CREATE TRIGGER trg_labs_search BEFORE INSERT OR UPDATE ON labs
  FOR EACH ROW EXECUTE FUNCTION labs_search_vector_update();

-- Access tracking for analytics
CREATE TABLE IF NOT EXISTS lab_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  endpoint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_log_lab ON lab_access_log(lab_id);
CREATE INDEX IF NOT EXISTS idx_access_log_created ON lab_access_log(created_at DESC);

-- Templates are seeded via src/seed-templates.js
