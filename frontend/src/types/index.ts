export interface User {
  id: string;
  username: string;
}

export interface Bucket {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  image_count: number;
  created_at: string;
  updated_at: string;
  images?: BucketImage[];
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
  status: string;
  created_at: string;
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
  target_account_id?: string | null;
  add_to_drafts: boolean;
  created_at: string;
  updated_at: string;
  slides?: JobSlide[];
  schedule?: JobSchedule;
  run_count?: number;
  schedule_type?: string;
}

export interface JobSlide {
  id?: string;
  job_id?: string;
  position: number;
  bucket_id: string;
  prompt_override: string | null;
  bucket_name?: string;
}

export interface JobSchedule {
  id?: string;
  job_id?: string;
  schedule_type: 'manual' | 'daily' | 'weekly' | 'custom';
  cron_expression?: string | null;
  run_times_json?: string[] | null;
  active_days?: number[] | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

export type RunStatus =
  | 'queued' | 'generating' | 'awaiting_approval' | 'approved'
  | 'rejected' | 'exporting' | 'exported' | 'failed';

export interface Run {
  id: string;
  job_id: string;
  job_name?: string;
  trigger_type: 'manual' | 'scheduled';
  status: RunStatus;
  prompt_snapshot: any;
  model_snapshot: string | null;
  post_title: string | null;
  caption: string | null;
  hashtags_json: string[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  slides?: RunSlide[];
  export_task?: ExportTask;
}

export interface RunSlide {
  id: string;
  run_id: string;
  position: number;
  bucket_id: string | null;
  selected_image_id: string | null;
  generated_text: string | null;
  image_locked: boolean;
  image_url?: string;
  image_filename?: string;
  composited_image_url?: string | null;
  bucket_name?: string;
}

export interface ExportTask {
  id: string;
  run_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  external_reference: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ConnectedAccount {
  id: string;
  provider: string;
  label: string | null;
  external_account_id: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  profile_username?: string | null;
}
