import { Router, Request, Response } from 'express';
import { query, getOne, getMany } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { generateUploadUrl, getPublicUrl, deleteObject } from '../utils/storage';
import { Bucket, BucketImage } from '../types';

const router = Router();
router.use(requireAuth);

// List all buckets
router.get('/', async (_req: Request, res: Response) => {
  try {
    const buckets = await getMany<Bucket & { image_count: string }>(
      `SELECT b.*, COUNT(bi.id) FILTER (WHERE bi.status = 'active') as image_count
       FROM buckets b
       LEFT JOIN bucket_images bi ON bi.bucket_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at DESC`
    );
    res.json(buckets.map(b => ({ ...b, image_count: parseInt(b.image_count) || 0 })));
  } catch (err) {
    console.error('List buckets error:', err);
    res.status(500).json({ error: 'Failed to list buckets' });
  }
});

// Create bucket
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const bucket = await getOne<Bucket>(
      'INSERT INTO buckets (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    res.status(201).json(bucket);
  } catch (err) {
    console.error('Create bucket error:', err);
    res.status(500).json({ error: 'Failed to create bucket' });
  }
});

// Get bucket detail with images
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const bucket = await getOne<Bucket>('SELECT * FROM buckets WHERE id = $1', [req.params.id]);
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });

    const images = await getMany<BucketImage>(
      `SELECT * FROM bucket_images WHERE bucket_id = $1 AND status = 'active' ORDER BY sort_order ASC, created_at ASC`,
      [req.params.id]
    );

    res.json({ ...bucket, images });
  } catch (err) {
    console.error('Get bucket error:', err);
    res.status(500).json({ error: 'Failed to get bucket' });
  }
});

// Update bucket
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, status } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const bucket = await getOne<Bucket>(
      `UPDATE buckets SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    res.json(bucket);
  } catch (err) {
    console.error('Update bucket error:', err);
    res.status(500).json({ error: 'Failed to update bucket' });
  }
});

// Delete (archive) bucket
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const bucket = await getOne<Bucket>(
      `UPDATE buckets SET status = 'archived' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    res.json({ success: true, bucket });
  } catch (err) {
    console.error('Delete bucket error:', err);
    res.status(500).json({ error: 'Failed to archive bucket' });
  }
});

// Init image upload (get presigned URL)
router.post('/:id/images/upload-init', async (req: Request, res: Response) => {
  try {
    const { filename, mime_type } = req.body;
    if (!filename || !mime_type) {
      return res.status(400).json({ error: 'filename and mime_type required' });
    }

    const bucket = await getOne('SELECT id FROM buckets WHERE id = $1', [req.params.id]);
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });

    const { key, uploadUrl } = await generateUploadUrl(filename, mime_type);
    res.json({ key, uploadUrl, publicUrl: getPublicUrl(key) });
  } catch (err) {
    console.error('Upload init error:', err);
    res.status(500).json({ error: 'Failed to init upload' });
  }
});

// Commit uploaded image
router.post('/:id/images/commit', async (req: Request, res: Response) => {
  try {
    const { storage_key, filename, mime_type, file_size, width, height } = req.body;
    if (!storage_key || !filename || !mime_type) {
      return res.status(400).json({ error: 'storage_key, filename, mime_type required' });
    }

    const maxOrder = await getOne<{ max: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) as max FROM bucket_images WHERE bucket_id = $1',
      [req.params.id]
    );

    const image = await getOne<BucketImage>(
      `INSERT INTO bucket_images (bucket_id, storage_key, public_url, filename, mime_type, file_size, width, height, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.params.id,
        storage_key,
        getPublicUrl(storage_key),
        filename,
        mime_type,
        file_size || null,
        width || null,
        height || null,
        (maxOrder?.max || 0) + 1,
      ]
    );
    res.status(201).json(image);
  } catch (err) {
    console.error('Commit image error:', err);
    res.status(500).json({ error: 'Failed to commit image' });
  }
});

// List images in bucket
router.get('/:id/images', async (req: Request, res: Response) => {
  try {
    const images = await getMany<BucketImage>(
      `SELECT * FROM bucket_images WHERE bucket_id = $1 AND status = 'active' ORDER BY sort_order ASC, created_at ASC`,
      [req.params.id]
    );
    res.json(images);
  } catch (err) {
    console.error('List images error:', err);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// Reorder images
router.patch('/:id/images/reorder', async (req: Request, res: Response) => {
  try {
    const { image_ids } = req.body;
    if (!Array.isArray(image_ids)) return res.status(400).json({ error: 'image_ids array required' });

    for (let i = 0; i < image_ids.length; i++) {
      await query('UPDATE bucket_images SET sort_order = $1 WHERE id = $2 AND bucket_id = $3', [
        i + 1,
        image_ids[i],
        req.params.id,
      ]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Reorder error:', err);
    res.status(500).json({ error: 'Failed to reorder images' });
  }
});

// Delete (archive) image
router.delete('/:id/images/:imageId', async (req: Request, res: Response) => {
  try {
    const image = await getOne<BucketImage>(
      `UPDATE bucket_images SET status = 'archived' WHERE id = $1 AND bucket_id = $2 RETURNING *`,
      [req.params.imageId, req.params.id]
    );
    if (!image) return res.status(404).json({ error: 'Image not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete image error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export default router;
