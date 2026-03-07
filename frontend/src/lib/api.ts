const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options: RequestInit & { skipAuthRedirect?: boolean } = {}): Promise<T> {
  const { skipAuthRedirect, ...fetchOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (res.status === 401) {
    if (!skipAuthRedirect) window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ success: boolean; user: { id: string; username: string } }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: { id: string; username: string } }>('/auth/me', { skipAuthRedirect: true }),

  // Buckets
  listBuckets: () => request<any[]>('/buckets'),
  createBucket: (data: { name: string; description?: string }) =>
    request<any>('/buckets', { method: 'POST', body: JSON.stringify(data) }),
  getBucket: (id: string) => request<any>(`/buckets/${id}`),
  updateBucket: (id: string, data: any) =>
    request<any>(`/buckets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBucket: (id: string) =>
    request<any>(`/buckets/${id}`, { method: 'DELETE' }),
  initUpload: (bucketId: string, data: { filename: string; mime_type: string }) =>
    request<{ key: string; uploadUrl: string; publicUrl: string }>(`/buckets/${bucketId}/images/upload-init`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  commitImage: (bucketId: string, data: any) =>
    request<any>(`/buckets/${bucketId}/images/commit`, { method: 'POST', body: JSON.stringify(data) }),
  deleteImage: (bucketId: string, imageId: string) =>
    request<any>(`/buckets/${bucketId}/images/${imageId}`, { method: 'DELETE' }),
  reorderImages: (bucketId: string, imageIds: string[]) =>
    request<any>(`/buckets/${bucketId}/images/reorder`, {
      method: 'PATCH', body: JSON.stringify({ image_ids: imageIds }),
    }),

  // Jobs
  listJobs: () => request<any[]>('/jobs'),
  createJob: (data: any) =>
    request<any>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getJob: (id: string) => request<any>(`/jobs/${id}`),
  updateJob: (id: string, data: any) =>
    request<any>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteJob: (id: string) =>
    request<any>(`/jobs/${id}`, { method: 'DELETE' }),
  duplicateJob: (id: string) =>
    request<any>(`/jobs/${id}/duplicate`, { method: 'POST' }),
  pauseJob: (id: string) =>
    request<any>(`/jobs/${id}/pause`, { method: 'POST' }),
  resumeJob: (id: string) =>
    request<any>(`/jobs/${id}/resume`, { method: 'POST' }),
  generatePreview: (id: string) =>
    request<any>(`/jobs/${id}/generate`, { method: 'POST' }),

  // Runs
  listRuns: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/runs${qs}`);
  },
  getRun: (id: string) => request<any>(`/runs/${id}`),
  approveRun: (id: string, data?: { enable_auto_approved_for_job?: boolean }) =>
    request<any>(`/runs/${id}/approve`, { method: 'POST', body: JSON.stringify(data || {}) }),
  rejectRun: (id: string) =>
    request<any>(`/runs/${id}/reject`, { method: 'POST' }),
  regenerateText: (id: string) =>
    request<any>(`/runs/${id}/regenerate-text`, { method: 'POST' }),
  retryExport: (id: string) =>
    request<any>(`/runs/${id}/retry-export`, { method: 'POST' }),

  // Settings
  getSettings: () => request<Record<string, string | null>>('/settings'),
  updateSettings: (data: Record<string, string>) =>
    request<any>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  saveOpenAIKey: (api_key: string) =>
    request<any>('/settings/openai-key', { method: 'POST', body: JSON.stringify({ api_key }) }),
  changePassword: (current_password: string, new_password: string) =>
    request<any>('/settings/password', {
      method: 'POST', body: JSON.stringify({ current_password, new_password }),
    }),
  listAccounts: () => request<any[]>('/settings/accounts'),
  initTikTokConnect: () =>
    request<{ auth_url: string; state: string }>('/settings/accounts/tiktok/connect-init', { method: 'POST' }),
  tiktokCallback: (code: string) =>
    request<any>('/settings/accounts/tiktok/callback', { method: 'POST', body: JSON.stringify({ code }) }),
  disconnectAccount: (id: string) =>
    request<any>(`/settings/accounts/${id}`, { method: 'DELETE' }),
};

// Upload file directly to R2 via presigned URL
export async function uploadToR2(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!res.ok) throw new Error('Upload to R2 failed');
}
