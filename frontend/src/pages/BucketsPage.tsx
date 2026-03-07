import { useState, useEffect, useCallback } from 'react';
import { api, uploadToR2 } from '@/lib/api';
import { Bucket, BucketImage } from '@/types';
import { statusColor, statusLabel, formatRelative } from '@/lib/utils';
import { Plus, Trash2, Archive, Upload, X, Image as ImageIcon, Loader2, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BucketsPage() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const loadBuckets = useCallback(async () => {
    try {
      const data = await api.listBuckets();
      setBuckets(data.filter((b: Bucket) => b.status === 'active'));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBucket = useCallback(async (id: string) => {
    try {
      const data = await api.getBucket(id);
      setSelectedBucket(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, []);

  useEffect(() => { loadBuckets(); }, [loadBuckets]);
  useEffect(() => { if (selectedId) loadBucket(selectedId); }, [selectedId, loadBucket]);

  const handleCreateBucket = async () => {
    if (!newName.trim()) return;
    try {
      const bucket = await api.createBucket({ name: newName, description: newDesc || undefined });
      setBuckets(prev => [bucket, ...prev]);
      setSelectedId(bucket.id);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      toast.success('Bucket created');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Archive this bucket?')) return;
    try {
      await api.deleteBucket(id);
      setBuckets(prev => prev.filter(b => b.id !== id));
      if (selectedId === id) { setSelectedId(null); setSelectedBucket(null); }
      toast.success('Bucket archived');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !selectedId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // 1. Get presigned URL
        const { key, uploadUrl } = await api.initUpload(selectedId, {
          filename: file.name,
          mime_type: file.type,
        });
        // 2. Upload to R2
        await uploadToR2(uploadUrl, file);
        // 3. Commit metadata
        await api.commitImage(selectedId, {
          storage_key: key,
          filename: file.name,
          mime_type: file.type,
          file_size: file.size,
        });
      }
      await loadBucket(selectedId);
      await loadBuckets();
      toast.success(`${files.length} image${files.length > 1 ? 's' : ''} uploaded`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!selectedId) return;
    try {
      await api.deleteImage(selectedId, imageId);
      setSelectedBucket(prev => prev ? {
        ...prev,
        images: prev.images?.filter(i => i.id !== imageId),
      } : null);
      toast.success('Image removed');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Buckets</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Bucket
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="card p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Bucket</h2>
              <button onClick={() => setShowCreate(false)} className="text-surface-400 hover:text-surface-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)} autoFocus placeholder="e.g. Cat Photos" />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input className="input" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What's in this bucket?" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleCreateBucket} className="btn-primary" disabled={!newName.trim()}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Bucket list */}
        <div className="w-64 flex-shrink-0 space-y-1.5">
          {buckets.length === 0 ? (
            <p className="text-sm text-surface-500 py-8 text-center">No buckets yet. Create one to start.</p>
          ) : (
            buckets.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                  selectedId === b.id ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'hover:bg-surface-50 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{b.name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleArchive(b.id); }}
                    className="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500 transition-all"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs text-surface-400 mt-0.5">{b.image_count} image{b.image_count !== 1 ? 's' : ''}</div>
              </button>
            ))
          )}
        </div>

        {/* Bucket detail */}
        <div className="flex-1 min-w-0">
          {!selectedId ? (
            <div className="card flex flex-col items-center justify-center py-20 text-surface-400">
              <FolderOpen className="w-10 h-10 mb-3" />
              <p className="text-sm">Select a bucket to view its images</p>
            </div>
          ) : selectedBucket ? (
            <div className="card">
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
                <div>
                  <h2 className="font-semibold text-lg">{selectedBucket.name}</h2>
                  {selectedBucket.description && (
                    <p className="text-sm text-surface-500 mt-0.5">{selectedBucket.description}</p>
                  )}
                </div>
                <label className={`btn-secondary cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Upload'}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={e => handleUpload(e.target.files)}
                    disabled={uploading}
                  />
                </label>
              </div>

              <div className="p-5">
                {(!selectedBucket.images || selectedBucket.images.length === 0) ? (
                  <div className="flex flex-col items-center py-16 text-surface-400">
                    <ImageIcon className="w-8 h-8 mb-2" />
                    <p className="text-sm">No images yet. Upload some to get started.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {selectedBucket.images.map(img => (
                      <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-surface-100">
                        <img
                          src={img.public_url || ''}
                          alt={img.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                        <button
                          onClick={() => handleDeleteImage(img.id)}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 rounded-lg text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs text-white truncate">{img.filename}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>
          )}
        </div>
      </div>
    </div>
  );
}
