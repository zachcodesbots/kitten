import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Run } from '@/types';
import { statusColor, statusLabel, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft, Check, X, RefreshCw, RotateCcw, Loader2,
  AlertCircle, Hash, Type, MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function RunDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [enableAutoApprove, setEnableAutoApprove] = useState(false);

  const loadRun = async () => {
    try {
      const data = await api.getRun(id!);
      setRun(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) loadRun(); }, [id]);

  const handleApprove = async () => {
    setActing(true);
    try {
      await api.approveRun(id!, { enable_auto_approved_for_job: enableAutoApprove });
      toast.success('Run approved');
      loadRun();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await api.rejectRun(id!);
      toast.success('Run rejected');
      loadRun();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  const handleRegenerate = async () => {
    setActing(true);
    try {
      toast.loading('Regenerating text...', { id: 'regen' });
      const data = await api.regenerateText(id!);
      setRun(data);
      toast.success('Text regenerated', { id: 'regen' });
    } catch (err: any) {
      toast.error(err.message, { id: 'regen' });
    } finally {
      setActing(false);
    }
  };

  const handleRetryExport = async () => {
    setActing(true);
    try {
      await api.retryExport(id!);
      toast.success('Export retried');
      loadRun();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  if (loading || !run) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/runs')} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{run.job_name || 'Run Detail'}</h1>
            <span className={`badge text-sm ${statusColor(run.status)}`}>{statusLabel(run.status)}</span>
          </div>
          <p className="text-sm text-surface-500 mt-0.5">
            {run.trigger_type === 'manual' ? 'Manual' : 'Scheduled'} run — {formatDateTime(run.created_at)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {run.status === 'awaiting_approval' && (
            <>
              <button onClick={handleRegenerate} disabled={acting} className="btn-secondary">
                <RefreshCw className="w-4 h-4" /> Regenerate Text
              </button>
              <button onClick={handleReject} disabled={acting} className="btn-danger">
                <X className="w-4 h-4" /> Reject
              </button>
              <button onClick={handleApprove} disabled={acting} className="btn-primary">
                <Check className="w-4 h-4" /> Approve
              </button>
            </>
          )}
          {run.status === 'failed' && (
            <button onClick={handleRetryExport} disabled={acting} className="btn-primary">
              <RotateCcw className="w-4 h-4" /> Retry Export
            </button>
          )}
        </div>
      </div>

      {/* Auto-approve checkbox */}
      {run.status === 'awaiting_approval' && (
        <div className="card px-5 py-3 mb-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableAutoApprove}
              onChange={e => setEnableAutoApprove(e.target.checked)}
              className="rounded border-surface-300"
            />
            <span className="text-sm">Also enable auto-drafting for future scheduled runs of this job</span>
          </label>
        </div>
      )}

      {/* Error message */}
      {run.error_message && (
        <div className="card px-5 py-3 mb-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{run.error_message}</span>
          </div>
        </div>
      )}

      {/* Post metadata */}
      {(run.post_title || run.caption || run.hashtags_json) && (
        <div className="card px-5 py-4 mb-4 space-y-2">
          {run.post_title && (
            <div className="flex items-start gap-2">
              <Type className="w-4 h-4 text-surface-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-xs text-surface-400 block">Post Title</span>
                <span className="text-sm font-medium">{run.post_title}</span>
              </div>
            </div>
          )}
          {run.caption && (
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-surface-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-xs text-surface-400 block">Caption</span>
                <span className="text-sm">{run.caption}</span>
              </div>
            </div>
          )}
          {run.hashtags_json && Array.isArray(run.hashtags_json) && (
            <div className="flex items-start gap-2">
              <Hash className="w-4 h-4 text-surface-400 mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {(run.hashtags_json as string[]).map((tag, i) => (
                  <span key={i} className="badge bg-surface-100 text-surface-600">#{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slideshow Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {run.slides?.map((slide, idx) => (
          <div key={slide.id} className="card overflow-hidden">
            <div className="bg-surface-100 relative">
              {slide.image_url ? (
                <img
                  src={slide.composited_image_url || slide.image_url}
                  alt={`Slide ${idx + 1}`}
                  className="w-full h-auto"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-surface-400 text-sm">No image</div>
              )}
              <div className="absolute top-2 left-2">
                <span className="bg-black/60 text-white text-xs font-mono px-2 py-1 rounded-md">
                  {idx + 1}/{run.slides?.length}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Export task info */}
      {run.export_task && (
        <div className="card px-5 py-4 mt-4">
          <h3 className="text-sm font-medium text-surface-500 mb-2">Export Status</h3>
          <div className="flex items-center gap-3">
            <span className={`badge ${statusColor(run.export_task.status)}`}>
              {statusLabel(run.export_task.status)}
            </span>
            {run.export_task.external_reference && (
              <span className="text-xs text-surface-400 font-mono">{run.export_task.external_reference}</span>
            )}
            {run.export_task.error_message && (
              <span className="text-xs text-red-600">{run.export_task.error_message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
