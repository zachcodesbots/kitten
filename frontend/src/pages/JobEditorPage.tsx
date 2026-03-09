import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Bucket, JobSlide, JobSchedule, ConnectedAccount } from '@/types';
import { Plus, Trash2, GripVertical, Save, ArrowLeft, Play, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface SlideRow {
  position: number;
  bucket_id: string;
  prompt_override: string;
  text_vertical_position: string;
}

export default function JobEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [buckets, setBuckets] = useState<Bucket[]>([]);

  // Job fields
  const [name, setName] = useState('');
  const [generalPrompt, setGeneralPrompt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [requireApproval, setRequireApproval] = useState(true);
  const [timezone, setTimezone] = useState('UTC');
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [addToDrafts, setAddToDrafts] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);

  // Slides
  const [slides, setSlides] = useState<SlideRow[]>([
    { position: 1, bucket_id: '', prompt_override: '', text_vertical_position: '' },
    { position: 2, bucket_id: '', prompt_override: '', text_vertical_position: '' },
    { position: 3, bucket_id: '', prompt_override: '', text_vertical_position: '' },
    { position: 4, bucket_id: '', prompt_override: '', text_vertical_position: '' },
    { position: 5, bucket_id: '', prompt_override: '', text_vertical_position: '' },
    { position: 6, bucket_id: '', prompt_override: '', text_vertical_position: '' },
  ]);

  // Schedule
  const [scheduleType, setScheduleType] = useState<'manual' | 'daily' | 'weekly'>('manual');
  const [runTimes, setRunTimes] = useState<string[]>(['09:00']);
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    api.listBuckets().then(setBuckets).catch(() => {});
    api.listAccounts().then((a: ConnectedAccount[]) => setAccounts(a.filter(acc => acc.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getJob(id).then(job => {
      setName(job.name);
      setGeneralPrompt(job.general_prompt || '');
      setIsActive(job.is_active);
      setRequireApproval(job.require_approval);
      setAddToDrafts(job.add_to_drafts ?? true);
      setTimezone(job.timezone);
      setTargetAccountId(job.target_account_id || '');

      if (job.slides && job.slides.length > 0) {
        setSlides(job.slides.map((s: any) => ({
          position: s.position,
          bucket_id: s.bucket_id,
          prompt_override: s.prompt_override || '',
          text_vertical_position: s.text_vertical_position == null ? '' : String(s.text_vertical_position),
        })));
      }

      if (job.schedule) {
        setScheduleType(job.schedule.schedule_type || 'manual');
        if (job.schedule.run_times_json) setRunTimes(job.schedule.run_times_json);
        if (job.schedule.active_days) setActiveDays(job.schedule.active_days);
      }
    }).catch((err: any) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Job name required'); return; }

    const invalidSlides = slides.filter(s => !s.bucket_id);
    if (invalidSlides.length > 0) { toast.error('All slides must have a bucket selected'); return; }

    setSaving(true);
    try {
      const payload = {
        name,
        general_prompt: generalPrompt || null,
        slide_count: slides.length,
        is_active: isActive,
        require_approval: requireApproval,
        auto_approved: !requireApproval,
        add_to_drafts: addToDrafts,
        timezone,
        target_account_id: targetAccountId || null,
        slides: slides.map((s, i) => ({
          position: i + 1,
          bucket_id: s.bucket_id,
          prompt_override: s.prompt_override || null,
          text_vertical_position:
            s.text_vertical_position === ''
              ? null
              : Math.max(0, Math.min(100, Number(s.text_vertical_position))),
        })),
        schedule: {
          schedule_type: scheduleType,
          run_times_json: scheduleType !== 'manual' ? runTimes : null,
          active_days: scheduleType === 'weekly' ? activeDays : null,
        },
      };

      if (isNew) {
        const job = await api.createJob(payload);
        toast.success('Job created');
        navigate(`/jobs/${job.id}`);
      } else {
        await api.updateJob(id!, payload);
        toast.success('Job saved');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!id) return;
    try {
      toast.loading('Generating preview...', { id: 'gen' });
      const run = await api.generatePreview(id);
      toast.success('Preview ready!', { id: 'gen' });
      navigate(`/runs/${run.id}`);
    } catch (err: any) {
      toast.error(err.message, { id: 'gen' });
    }
  };

  const addSlide = () => {
    setSlides(prev => [...prev, { position: prev.length + 1, bucket_id: '', prompt_override: '', text_vertical_position: '' }]);
  };

  const removeSlide = (idx: number) => {
    setSlides(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 })));
  };

  const updateSlide = (idx: number, field: keyof SlideRow, value: string) => {
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addRunTime = () => setRunTimes(prev => [...prev, '12:00']);
  const removeRunTime = (idx: number) => setRunTimes(prev => prev.filter((_, i) => i !== idx));
  const updateRunTime = (idx: number, val: string) => setRunTimes(prev => prev.map((t, i) => i === idx ? val : t));

  const toggleDay = (day: number) => {
    setActiveDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/jobs')} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-semibold flex-1">{isNew ? 'New Job' : 'Edit Job'}</h1>
        <div className="flex gap-2">
          {!isNew && (
            <button onClick={handleGenerate} className="btn-secondary">
              <Play className="w-4 h-4" /> Generate Preview
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Prompt Settings */}
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-sm text-surface-500 uppercase tracking-wider">Prompt Settings</h2>
            <div>
              <label className="label">Job Name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="My TikTok Slideshow" />
            </div>
            <div>
              <label className="label">General Prompt</label>
              <textarea
                className="input min-h-[120px] resize-y"
                value={generalPrompt}
                onChange={e => setGeneralPrompt(e.target.value)}
                placeholder="Describe the tone, style, and content direction for this slideshow..."
              />
              <p className="text-xs text-surface-400 mt-1">This prompt applies to all slides. Individual overrides below.</p>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-sm text-surface-500 uppercase tracking-wider">Options</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded border-surface-300" />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={requireApproval} onChange={e => setRequireApproval(e.target.checked)} className="rounded border-surface-300" />
              <span className="text-sm">Require manual approval</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={addToDrafts}
                onChange={e => setAddToDrafts(e.target.checked)}
                className="rounded border-surface-300 mt-0.5"
              />
              <div>
                <span className="text-sm block">Add to drafts</span>
                <p className="text-xs text-surface-400 mt-1">
                  When enabled, exports use TikTok drafts/inbox flow so you can finish editing in-app. When disabled, posts publish immediately.
                </p>
              </div>
            </label>
            <div className="pt-1">
              <label className="label">Post to TikTok Account</label>
              {accounts.length === 0 ? (
                <p className="text-xs text-surface-400">No accounts connected. <a href="/settings" className="underline">Add one in Settings.</a></p>
              ) : (
                <select className="input" value={targetAccountId} onChange={e => setTargetAccountId(e.target.value)}>
                  <option value="">Select account...</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.label || a.external_account_id}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Slide Sequence */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm text-surface-500 uppercase tracking-wider">Slide Sequence</h2>
              <button onClick={addSlide} className="btn-ghost text-xs py-1 px-2">
                <Plus className="w-3.5 h-3.5" /> Add Slide
              </button>
            </div>

            <div className="space-y-3">
              {slides.map((slide, idx) => (
                <div key={idx} className="border border-surface-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-surface-300 cursor-grab" />
                    <span className="text-xs font-mono font-medium text-surface-400 w-5">#{idx + 1}</span>
                    <select
                      className="input flex-1 py-1.5"
                      value={slide.bucket_id}
                      onChange={e => updateSlide(idx, 'bucket_id', e.target.value)}
                    >
                      <option value="">Select bucket...</option>
                      {buckets.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.image_count})</option>
                      ))}
                    </select>
                    {slides.length > 1 && (
                      <button onClick={() => removeSlide(idx)} className="text-surface-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    className="input text-xs py-1.5"
                    value={slide.prompt_override}
                    onChange={e => updateSlide(idx, 'prompt_override', e.target.value)}
                    placeholder="Slide-specific prompt override (optional)"
                  />
                  <div>
                    <label className="label text-xs">Text position (0 bottom, 100 top)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="input text-xs py-1.5"
                      value={slide.text_vertical_position}
                      onChange={e => updateSlide(idx, 'text_vertical_position', e.target.value)}
                      placeholder="Leave blank for default"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 3: Schedule + Actions */}
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-sm text-surface-500 uppercase tracking-wider">Schedule</h2>

            <div>
              <label className="label">Schedule Type</label>
              <select
                className="input"
                value={scheduleType}
                onChange={e => setScheduleType(e.target.value as any)}
              >
                <option value="manual">Manual only</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {scheduleType !== 'manual' && (
              <div>
                <label className="label">Run Times</label>
                <div className="space-y-2">
                  {runTimes.map((time, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        className="input flex-1"
                        value={time}
                        onChange={e => updateRunTime(idx, e.target.value)}
                      />
                      {runTimes.length > 1 && (
                        <button onClick={() => removeRunTime(idx)} className="text-surface-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addRunTime} className="btn-ghost text-xs py-1">
                    <Plus className="w-3.5 h-3.5" /> Add time
                  </button>
                </div>
              </div>
            )}

            {scheduleType === 'weekly' && (
              <div>
                <label className="label">Active Days</label>
                <div className="flex gap-1.5">
                  {dayNames.map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => toggleDay(idx)}
                      className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                        activeDays.includes(idx)
                          ? 'bg-brand-600 text-white'
                          : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="label">Timezone</label>
              <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
                <option value="Europe/London">London</option>
                <option value="Europe/Paris">Paris</option>
                <option value="Asia/Tokyo">Tokyo</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
