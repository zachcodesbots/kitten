import { Router, Request, Response } from 'express';
import { query, getOne, getMany } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { AppSetting, ConnectedAccount } from '../types';

const router = Router();
router.use(requireAuth);

// Get all settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await getMany<AppSetting>('SELECT * FROM app_settings');
    const settingsMap: Record<string, string | null> = {};
    settings.forEach(s => { settingsMap[s.key] = s.value; });
    res.json(settingsMap);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings
router.patch('/', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value as string]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Save OpenAI key (stored as setting)
router.post('/openai-key', async (req: Request, res: Response) => {
  try {
    const { api_key } = req.body;
    if (!api_key) return res.status(400).json({ error: 'API key required' });

    await query(
      `INSERT INTO app_settings (key, value) VALUES ('openai_api_key', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [api_key]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Save OpenAI key error:', err);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// Update admin password
router.post('/password', async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Both passwords required' });
    }

    const user = await getOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Password update error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// === Connected Accounts ===

// List accounts
router.get('/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await getMany<ConnectedAccount>(
      `SELECT id, provider, label, external_account_id, is_active, token_expires_at, created_at, updated_at
       FROM connected_accounts ORDER BY created_at DESC`
    );
    res.json(accounts);
  } catch (err) {
    console.error('List accounts error:', err);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// TikTok connect init
// Save upload-post.com API token
// Save upload-post.com account
router.post('/accounts/upload-post/connect', async (req: Request, res: Response) => {
  try {
    const { profile_username, label } = req.body;
    if (!profile_username) {
      return res.status(400).json({ error: 'Profile username required' });
    }

    const apiToken = process.env.UPLOAD_POST_API_TOKEN;
    if (!apiToken) return res.status(500).json({ error: 'UPLOAD_POST_API_TOKEN not configured' });

    const profileRes = await fetch(`https://api.upload-post.com/api/uploadposts/users/${profile_username}`, {
      headers: { 'Authorization': `Apikey ${apiToken}` },
    });
    const profileData = await profileRes.json() as any;
    if (!profileData.success) {
      return res.status(400).json({ error: 'Profile not found on upload-post.com' });
    }

    const tiktok = profileData.profile?.social_accounts?.tiktok;
    if (!tiktok) {
      return res.status(400).json({ error: 'No TikTok account connected to this profile' });
    }

    const displayName = tiktok.display_name || profile_username;

    const account = await getOne(
      `INSERT INTO connected_accounts 
        (provider, label, external_account_id, profile_username, is_active)
       VALUES ('tiktok', $1, $2, $3, true)
       ON CONFLICT (provider, external_account_id) DO UPDATE SET
         label = $1, profile_username = $3, is_active = true
       RETURNING id, provider, label, external_account_id, profile_username, is_active`,
      [label || displayName, profile_username, profile_username]
    );

    res.json({ success: true, account });
  } catch (err) {
    console.error('upload-post connect error:', err);
    res.status(500).json({ error: 'Failed to save connection' });
  }
});

// Fetch profiles from upload-post.com (to help user pick)
router.get('/accounts/upload-post/profiles', async (req: Request, res: Response) => {
  try {
    const { api_token } = req.query;
    if (!api_token) return res.status(400).json({ error: 'api_token required' });

    const r = await fetch('https://api.upload-post.com/api/uploadposts/users', {
      headers: { 'Authorization': `Apikey ${api_token}` },
    });
    const data = await r.json() as any;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// TikTok callback
router.post('/accounts/tiktok/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Authorization code required' });

    // Exchange code for tokens
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
      }),
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Failed to get tokens', details: tokenData });
    }

    // Upsert account
    const account = await getOne(
      `INSERT INTO connected_accounts (provider, label, external_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at)
       VALUES ('tiktok', 'TikTok Account', $1, $2, $3, NOW() + INTERVAL '1 day' * $4)
       ON CONFLICT ON CONSTRAINT connected_accounts_pkey DO UPDATE SET
         access_token_encrypted = $2, refresh_token_encrypted = $3,
         token_expires_at = NOW() + INTERVAL '1 second' * $4, is_active = true
       RETURNING id, provider, label, is_active`,
      [
        tokenData.open_id || 'default',
        tokenData.access_token,
        tokenData.refresh_token || null,
        tokenData.expires_in || 86400,
      ]
    );

    res.json({ success: true, account });
  } catch (err) {
    console.error('TikTok callback error:', err);
    res.status(500).json({ error: 'Failed to complete TikTok connection' });
  }
});

// Update account
router.patch('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { label, is_active } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (label !== undefined) { fields.push(`label = $${idx++}`); values.push(label); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await query(`UPDATE connected_accounts SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (err) {
    console.error('Update account error:', err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Disconnect TikTok
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    await query('UPDATE connected_accounts SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
