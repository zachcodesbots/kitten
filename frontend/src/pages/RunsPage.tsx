import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Run, RunStatus } from '@/types';
import { statusColor, statusLabel, formatRelative } from '@/lib/utils';
import { Loader2, Play, Clock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_OPTIONS: (RunStatus | '')[] = ['', 'queued', 'generating', 'awaiting_approval', 'approved', 'rejected', 'exporting', 'exported', 'failed'];

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const navigate = useNavigate();

  const loadRuns = async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (triggerFilter) params.trigger_type = triggerFilter;
      const data = await api.listRuns(params);
      setRuns(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRuns(); }, [statusFilter, triggerFilter]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Runs</h1>
        <div className="flex gap-2">
          <select className="input w-auto py-1.5 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{statusLabel(s as string)}</option>
            ))}
          </select>
          <select className="input w-auto py-1.5 text-sm" value={triggerFilter} onChange={e => setTriggerFilter(e.target.value)}>
            <option value="">All triggers</option>
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-surface-400">
          <Play className="w-10 h-10 mb-3" />
          <p className="text-sm">No runs yet. Generate a preview from a job to get started.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50/50">
                <th className="text-left font-medium text-surface-500 px-4 py-3">Job</th>
                <th className="text-left font-medium text-surface-500 px-4 py-3">Trigger</th>
                <th className="text-left font-medium text-surface-500 px-4 py-3">Status</th>
                <th className="text-left font-medium text-surface-500 px-4 py-3">Title</th>
                <th className="text-left font-medium text-surface-500 px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr
                  key={run.id}
                  className="border-b border-surface-100 last:border-0 hover:bg-surface-50/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/runs/${run.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{run.job_name || 'Unknown'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-surface-500">
                      {run.trigger_type === 'manual' ? <Zap className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {run.trigger_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusColor(run.status)}`}>{statusLabel(run.status)}</span>
                  </td>
                  <td className="px-4 py-3 text-surface-500 truncate max-w-[200px]">{run.post_title || '—'}</td>
                  <td className="px-4 py-3 text-surface-500">{formatRelative(run.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
