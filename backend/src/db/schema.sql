-- Kitten DB Schema Migration
-- Run against your Supabase Postgres instance

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Session store table (for express-session)
-- ============================================
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ============================================
-- Users
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Buckets
-- ============================================
CREATE TABLE buckets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Bucket Images
-- ============================================
CREATE TABLE bucket_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bucket_id UUID NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  storage_key VARCHAR(512) NOT NULL,
  public_url VARCHAR(1024),
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_bucket_images_bucket ON bucket_images(bucket_id);

-- ============================================
-- Connected Accounts (TikTok)
-- ============================================
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(50) NOT NULL DEFAULT 'tiktok',
  label VARCHAR(255),
  external_account_id VARCHAR(255),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Jobs
-- ============================================
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  general_prompt TEXT,
  slide_count INTEGER DEFAULT 6,
  is_active BOOLEAN DEFAULT true,
  require_approval BOOLEAN DEFAULT true,
  auto_approved BOOLEAN DEFAULT false,
  timezone VARCHAR(100) DEFAULT 'UTC',
  target_account_id UUID REFERENCES connected_accounts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Job Slides
-- ============================================
CREATE TABLE job_slides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  bucket_id UUID NOT NULL REFERENCES buckets(id),
  prompt_override TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_job_slides_job ON job_slides(job_id);

-- ============================================
-- Job Schedules
-- ============================================
CREATE TABLE job_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  schedule_type VARCHAR(20) DEFAULT 'manual' CHECK (schedule_type IN ('manual', 'daily', 'weekly', 'custom')),
  cron_expression VARCHAR(100),
  run_times_json JSONB,
  active_days JSONB,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_job_schedules_job ON job_schedules(job_id);
CREATE INDEX idx_job_schedules_next_run ON job_schedules(next_run_at);

-- ============================================
-- Runs
-- ============================================
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('manual', 'scheduled')),
  status VARCHAR(30) DEFAULT 'queued' CHECK (status IN (
    'queued', 'generating', 'awaiting_approval', 'approved',
    'rejected', 'exporting', 'exported', 'failed'
  )),
  prompt_snapshot JSONB,
  model_snapshot VARCHAR(100),
  selected_account_snapshot JSONB,
  post_title VARCHAR(500),
  caption TEXT,
  hashtags_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_runs_job ON runs(job_id);
CREATE INDEX idx_runs_status ON runs(status);

-- ============================================
-- Run Slides
-- ============================================
CREATE TABLE run_slides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  bucket_id UUID REFERENCES buckets(id),
  selected_image_id UUID REFERENCES bucket_images(id),
  generated_text TEXT,
  image_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_run_slides_run ON run_slides(run_id);

-- ============================================
-- Export Tasks
-- ============================================
CREATE TABLE export_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id),
  account_id UUID REFERENCES connected_accounts(id),
  status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  external_reference VARCHAR(500),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_export_tasks_run ON export_tasks(run_id);
CREATE INDEX idx_export_tasks_status ON export_tasks(status);

-- ============================================
-- App Settings (key-value store)
-- ============================================
CREATE TABLE app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES
  ('default_timezone', 'UTC'),
  ('default_model', 'gpt-4o-mini'),
  ('require_approval_default', 'true')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_buckets_updated_at BEFORE UPDATE ON buckets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bucket_images_updated_at BEFORE UPDATE ON bucket_images FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_job_slides_updated_at BEFORE UPDATE ON job_slides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_job_schedules_updated_at BEFORE UPDATE ON job_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_runs_updated_at BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_run_slides_updated_at BEFORE UPDATE ON run_slides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_export_tasks_updated_at BEFORE UPDATE ON export_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_connected_accounts_updated_at BEFORE UPDATE ON connected_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
