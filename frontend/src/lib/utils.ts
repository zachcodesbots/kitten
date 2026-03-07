import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatRelative(dateStr: string) {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    queued: 'bg-yellow-100 text-yellow-800',
    generating: 'bg-blue-100 text-blue-800',
    awaiting_approval: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    exporting: 'bg-indigo-100 text-indigo-800',
    exported: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800',
    active: 'bg-green-100 text-green-800',
    archived: 'bg-surface-100 text-surface-600',
    completed: 'bg-emerald-100 text-emerald-800',
    processing: 'bg-blue-100 text-blue-800',
  };
  return colors[status] || 'bg-surface-100 text-surface-600';
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
