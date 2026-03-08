import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ConnectedAccount } from '@/types';
import { Key, Globe, Link, Unlink, Save, Loader2, Eye, EyeOff, ExternalLink, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string | null>>({});
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [openaiKey, setOpenaiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gpt-4o-mini');
  const [defaultTimezone, setDefaultTimezone] = useState('UTC');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [uploadPostUsername, setUploadPostUsername] = useState('');
  const [uploadPostLabel, setUploadPostLabel] = useState('');

  useEffect(() => {
    Promise.all([api.getSettings(), api.listAccounts()])
      .then(([s, a]) => {
        setSettings(s);
        setAccounts(a);
        if (s.default_model) setDefaultModel(s.default_model);
        if (s.default_timezone) setDefaultTimezone(s.default_timezone);
        if (s.openai_api_key) setOpenaiKey(s.openai_api_key);
      })
      .catch((err: any) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveOpenAIKey = async () => {
    if (!openaiKey.trim()) return;
    try {
      await api.saveOpenAIKey(openaiKey);
      toast.success('OpenAI key saved');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await api.updateSettings({
        default_model: defaultModel,
        default_timezone: defaultTimezone,
      });
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) { toast.error('Both passwords required'); return; }
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password updated');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Disconnect this account?')) return;
    try {
      await api.disconnectAccount(id);
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_active: false } : a));
      toast.success('Account disconnected');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>;
  }

  const tikTokAccounts = accounts.filter(a => a.provider === 'tiktok' && a.is_active);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="space-y-6 max-w-2xl">
        {/* OpenAI Key */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-surface-500" />
            <h2 className="font-semibold">OpenAI API Key</h2>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                className="input pr-10"
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button onClick={handleSaveOpenAIKey} className="btn-primary">
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </div>

        {/* Defaults */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-surface-500" />
            <h2 className="font-semibold">Defaults</h2>
          </div>
          <div>
            <label className="label">Generation Model</label>
            <select className="input" value={defaultModel} onChange={e => setDefaultModel(e.target.value)}>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>
          <div>
            <label className="label">Default Timezone</label>
            <select className="input" value={defaultTimezone} onChange={e => setDefaultTimezone(e.target.value)}>
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
          <button onClick={handleSaveSettings} className="btn-primary">
            <Save className="w-4 h-4" /> Save Defaults
          </button>
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <ExternalLink className="w-4 h-4 text-surface-500" />
            <h2 className="font-semibold">TikTok Connection</h2>
          </div>

<div className="space-y-2">
            {tikTokAccounts.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2">
                  <span className="badge bg-green-100 text-green-700">Connected</span>
                  <span className="text-sm">{a.label || 'TikTok Account'}</span>
                </div>
                <button onClick={() => handleDisconnect(a.id)} className="btn-ghost text-red-500 hover:bg-red-50">
                  <Unlink className="w-4 h-4" /> Disconnect
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3 pt-1">
            <div>
              <label className="label">Profile Username</label>
              <input
                type="text"
                className="input"
                value={uploadPostUsername}
                onChange={e => setUploadPostUsername(e.target.value)}
                placeholder="upload-post.com profile username"
              />
            </div>
            <div>
              <label className="label">Label (optional)</label>
              <input
                type="text"
                className="input"
                value={uploadPostLabel}
                onChange={e => setUploadPostLabel(e.target.value)}
                placeholder="e.g. Gym Account"
              />
            </div>
            <button
              onClick={async () => {
                if (!uploadPostUsername) { toast.error('Profile username required'); return; }
                try {
                  await api.connectUploadPost(uploadPostUsername, uploadPostLabel || uploadPostUsername);
                  toast.success('TikTok account added');
                  setUploadPostUsername('');
                  setUploadPostLabel('');
                  const a = await api.listAccounts();
                  setAccounts(a);
                } catch (err: any) {
                  toast.error(err.message);
                }
              }}
              className="btn-primary"
            >
              <Link className="w-4 h-4" /> Add Account
            </button>
            <p className="text-xs text-surface-400">
              Sign up at <a href="https://upload-post.com" target="_blank" className="underline">upload-post.com</a>, connect your TikTok to a profile, then enter the profile username here.
            </p>
          </div>
        </div>

        {/* Password */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-4 h-4 text-surface-500" />
            <h2 className="font-semibold">Change Password</h2>
          </div>
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <button onClick={handleChangePassword} className="btn-primary" disabled={!currentPassword || !newPassword}>
            Update Password
          </button>
        </div>
      </div>
    </div>
  );
}
