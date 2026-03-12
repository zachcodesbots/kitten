export interface User {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface Bucket {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  image_count?: number;
}

export interface BucketImage {
  id: string;
  bucket_id: string;
  storage_key: string;
  public_url: string | null;
  filename: string;
  mime_type: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  name: string;
  general_prompt: string | null;
  hashtags_json: string[] | null;
  slide_count: number;
  is_active: boolean;
  require_approval: boolean;
  auto_approved: boolean;
  timezone: string;
  target_account_id: string | null;
  add_to_drafts: boolean;
  created_at: string;
  updated_at: string;
  slides?: JobSlide[];
  schedule?: JobSchedule;
}

export interface JobSlide {
  id: string;
  job_id: string;
  position: number;
  bucket_id: string;
  prompt_override: string | null;
  text_vertical_position: number | null;
  created_at: string;
  updated_at: string;
  bucket_name?: string;
}

export interface JobSchedule {
  id: string;
  job_id: string;
  schedule_type: 'manual' | 'daily' | 'weekly' | 'custom';
  cron_expression: string | null;
  run_times_json: any;
  active_days: any;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
  | 'queued'
  | 'generating'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'exporting'
  | 'exported'
  | 'failed';

export interface Run {
  id: string;
  job_id: string;
  trigger_type: 'manual' | 'scheduled';
  status: RunStatus;
  prompt_snapshot: any;
  model_snapshot: string | null;
  selected_account_snapshot: any;
  post_title: string | null;
  caption: string | null;
  hashtags_json: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  job_name?: string;
  slides?: RunSlide[];
}

export interface RunSlide {
  id: string;
  run_id: string;
  position: number;
  bucket_id: string | null;
  selected_image_id: string | null;
  generated_text: string | null;
  text_vertical_position: number | null;
  image_locked: boolean;
  created_at: string;
  updated_at: string;
  image_url?: string;
  image_filename?: string;
  bucket_name?: string;
  composited_image_url?: string | null;
}

export interface ExportTask {
  id: string;
  run_id: string;
  account_id: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  external_reference: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectedAccount {
  id: string;
  provider: string;
  label: string | null;
  external_account_id: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
  profile_username?: string | null;
}

export interface AppSetting {
  key: string;
  value: string | null;
  updated_at: string;
}

// Express session augmentation
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
  }
}
