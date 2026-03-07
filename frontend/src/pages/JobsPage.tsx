import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Job } from '@/types';
import { formatRelative, statusLabel } from '@/lib/utils';
import { Plus, Play, Pause, Copy, Trash2, Loader2, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadJobs = async () => {
    try {
      const data = await api.listJobs();
      setJobs(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadJobs(); }, []);

  const handleDuplicate = async (id: string) => {
    try {
      const job = await api.duplicateJob(id);
      setJobs(prev => [job, ...prev]);
      toast.success('Job duplicated');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (job: Job) => {
    try {
      if (job.is_active) {
        await api.pauseJob(job.id);
      } else {
        await api.resumeJob(job.id);
      }
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: !j.is_active } : j));
      toast.success(job.is_active ? 'Job paused' : 'Job resumed');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this job?')) return;
    try {
      await api.deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      toast.success('Job deleted');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleGenerate = async (id: string) => {
    try {
      toast.loading('Generating...', { id: 'gen' });
      const run = await api.generatePreview(id);
      toast.success('Preview generated!', { id: 'gen' });
      navigate(`/runs/${run.id}`);
    } catch (err: any) {
      toast.error(err.message, { id: 'gen' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <button onClick={() => navigate('/jobs/new')} className="btn-primary">
          <Plus className="w-4 h-4" /> New Job
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-surface-400">
          <Briefcase className="w-10 h-10 mb-3" />
          <p className="text-sm">No jobs yet. Create one to start generating slideshows.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <div key={job.id} className="card px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{job.name}</h3>
                  <span className={`badge ${job.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-500'}`}>
                    {job.is_active ? 'Active' : 'Paused'}
                  </span>
                  {job.auto_approved && (
                    <span className="badge bg-indigo-100 text-indigo-700">Auto-approve</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-surface-500">
                  <span>{job.slide_count} slides</span>
                  <span>{(job as any).schedule_type === 'daily' ? 'Daily' : (job as any).schedule_type === 'weekly' ? 'Weekly' : 'Manual'}</span>
                  <span>{(job as any).run_count || 0} runs</span>
                  <span>{formatRelative(job.created_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button onClick={() => handleGenerate(job.id)} className="btn-ghost p-2" title="Generate preview">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={() => handleToggle(job)} className="btn-ghost p-2" title={job.is_active ? 'Pause' : 'Resume'}>
                  <Pause className="w-4 h-4" />
                </button>
                <button onClick={() => handleDuplicate(job.id)} className="btn-ghost p-2" title="Duplicate">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(job.id)} className="btn-ghost p-2 text-red-500 hover:bg-red-50" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
