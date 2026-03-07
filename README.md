# Kitten — TikTok Slideshow Studio

Internal admin platform for creating TikTok slideshow drafts. Manage image buckets, create generation jobs with AI-generated text, review outputs, and export approved runs to TikTok drafts.

## Stack

- **Frontend:** React + TypeScript + Tailwind CSS (Vite)
- **Backend:** Express + TypeScript
- **Database:** Supabase Postgres
- **File Storage:** Cloudflare R2
- **AI:** OpenAI API
- **Deploy:** Vercel (frontend) + Fly.io (backend + worker)

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- npm 9+
- A Supabase project (free tier works)
- Cloudflare R2 bucket
- OpenAI API key

### 1. Clone and install

```bash
git clone <your-repo>
cd kitten
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Set up Supabase Postgres

1. Go to [supabase.com](https://supabase.com) → New Project
2. Pick a name and password, note the password
3. Once created, go to **Settings → Database → Connection String → URI**
4. Copy the connection string (replace `[YOUR-PASSWORD]` with your DB password)

### 3. Set up Cloudflare R2

1. Go to Cloudflare dashboard → R2 → Create Bucket → name it `kitten-images`
2. Under R2 → Overview → Manage R2 API Tokens → Create API Token
3. Give it Object Read & Write permissions for the `kitten-images` bucket
4. Copy the Access Key ID, Secret Access Key, and your Account ID
5. **Enable public access** on the bucket:
   - Bucket settings → Public access → Allow access
   - Note the public URL (e.g., `https://pub-xxxxx.r2.dev`)

### 4. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your real values:

```env
PORT=4000
NODE_ENV=development
SESSION_SECRET=<random 32+ char string>
FRONTEND_URL=http://localhost:5173

DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

R2_ACCOUNT_ID=<your-cloudflare-account-id>
R2_ACCESS_KEY_ID=<your-r2-access-key>
R2_SECRET_ACCESS_KEY=<your-r2-secret-key>
R2_BUCKET_NAME=kitten-images
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

OPENAI_API_KEY=sk-...

ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your-admin-password>
```

### 5. Run database migration and seed

```bash
cd backend
npx tsx src/db/migrate.ts    # Creates all tables
npx tsx src/db/seed.ts       # Creates admin user
cd ..
```

### 6. Start development servers

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Worker (optional for scheduled jobs)
cd backend && npm run worker
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:4000`.
Vite proxies `/api` requests to the backend automatically.

---

## Production Deployment

### Deploy Backend to Fly.io

#### 1. Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

#### 2. Create and deploy app

```bash
cd backend
fly launch --name kitten-backend --region iad --no-deploy
```

#### 3. Set secrets

```bash
fly secrets set \
  NODE_ENV=production \
  SESSION_SECRET="<random 32+ char string>" \
  FRONTEND_URL="https://kitten.journeyaiapp.com" \
  DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" \
  R2_ACCOUNT_ID="<id>" \
  R2_ACCESS_KEY_ID="<key>" \
  R2_SECRET_ACCESS_KEY="<secret>" \
  R2_BUCKET_NAME="kitten-images" \
  R2_PUBLIC_URL="https://pub-xxxxx.r2.dev" \
  OPENAI_API_KEY="sk-..." \
  ADMIN_USERNAME="admin" \
  ADMIN_PASSWORD="<password>"
```

#### 4. Deploy

```bash
fly deploy
```

#### 5. Run migration on production

```bash
fly ssh console -C "cd /app && node dist/db/migrate.js"
fly ssh console -C "cd /app && node dist/db/seed.js"
```

Note: The migration and seed scripts reference `schema.sql` relative to the dist directory. The Dockerfile copies it there.

#### 6. Scale worker process

```bash
fly scale count web=1 worker=1
```

### Deploy Frontend to Vercel

#### 1. Install Vercel CLI

```bash
npm i -g vercel
```

#### 2. Deploy

```bash
cd frontend
vercel
```

During setup:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

#### 3. Set environment variable

In Vercel project settings → Environment Variables:

```
VITE_API_URL = https://kitten-backend.fly.dev/api
```

#### 4. Add custom domain

In Vercel → Domains → Add `kitten.journeyaiapp.com`

Then add the required DNS records in your domain registrar:
- CNAME `kitten` → `cname.vercel-dns.com`

---

## TikTok API Setup

This is the most involved external setup step. You need a TikTok developer app with Content Posting API access.

### 1. Register as TikTok Developer

Go to [developers.tiktok.com](https://developers.tiktok.com) and create an account.

### 2. Create an App

- App name: "Kitten Slideshow Studio" (or whatever)
- Products: Enable **Login Kit** and **Content Posting API**

### 3. Configure OAuth

Under Login Kit settings:
- **Redirect URI:** `https://kitten-backend.fly.dev/api/settings/accounts/tiktok/callback`
  (for dev: `http://localhost:4000/api/settings/accounts/tiktok/callback`)
- **Scopes:** `user.info.basic`, `video.publish`, `video.upload`

### 4. Get credentials

Copy your **Client Key** and **Client Secret** to your env:

```env
TIKTOK_CLIENT_KEY=<your-key>
TIKTOK_CLIENT_SECRET=<your-secret>
TIKTOK_REDIRECT_URI=https://kitten-backend.fly.dev/api/settings/accounts/tiktok/callback
```

### 5. Submit for review

TikTok requires app review before Content Posting API works in production. Submit your app with:
- Description of how you use the API (creating draft slideshows)
- Screenshots of the app
- Privacy policy URL

**Important:** Until approved, the API only works with the TikTok account registered as the developer. For v1 with one admin this is fine.

### 6. Connect in the app

Once deployed, go to Settings → Connect TikTok → Authorize in the popup.

The TikTok OAuth callback handling is built in. After authorization, your account tokens are stored and the app can export approved runs as drafts.

---

## R2 CORS Configuration

For direct browser uploads to work, you need CORS on your R2 bucket.

In Cloudflare dashboard → R2 → your bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://kitten.journeyaiapp.com"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Architecture Notes

### How generation works

1. Job defines slide sequence: each slide maps to a bucket
2. On "Generate Preview" (or scheduled trigger), the backend:
   - Randomly selects one image from each bucket
   - Builds a prompt combining the general prompt + per-slide overrides
   - Calls OpenAI with `response_format: { type: "json_object" }`
   - Parses response into per-slide text, caption, title, hashtags
   - Creates a Run record with RunSlide records
3. Run is set to `awaiting_approval` (or auto-approved if configured)

### How export works

1. Approving a run queues an ExportTask
2. The worker picks up queued tasks every 15 seconds
3. It builds the TikTok Content Posting API payload with image URLs and caption
4. Posts to TikTok as a photo/slideshow post with `privacy_level: SELF_ONLY` (draft mode)
5. Updates export task status

### How scheduling works

1. Worker checks for due job schedules every 60 seconds
2. Compares `next_run_at` with current time
3. If due, triggers generation same as a manual run but with `trigger_type: scheduled`
4. Computes and stores next run time
5. If job has `auto_approved = true`, run skips approval and goes directly to export

### Session auth

- Uses `express-session` with `connect-pg-simple` (sessions stored in Postgres)
- Session cookie name: `kitten.sid`
- 7-day expiry
- In production: `secure: true`, `sameSite: none` (for cross-origin Vercel → Fly)

---

## Folder Structure

```
kitten/
├── backend/
│   ├── src/
│   │   ├── db/           # Pool, migrations, seed
│   │   ├── middleware/    # Auth middleware
│   │   ├── routes/        # Express route handlers
│   │   ├── services/      # Generation, scheduler, export
│   │   ├── types/         # TypeScript interfaces
│   │   ├── utils/         # R2 storage helpers
│   │   ├── index.ts       # Express server entry
│   │   └── worker.ts      # Background worker entry
│   ├── Dockerfile
│   ├── fly.toml
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── hooks/         # Auth context
│   │   ├── lib/           # API client, utilities
│   │   ├── pages/         # Page components
│   │   └── types/         # TypeScript interfaces
│   ├── vercel.json
│   └── package.json
└── package.json           # Root monorepo config
```

---

## Quick Reference: What You Do vs What's Built

| Task | Status |
|------|--------|
| Supabase project creation | **You do this** |
| R2 bucket creation + CORS | **You do this** |
| OpenAI API key | **You do this** |
| TikTok developer app | **You do this** |
| DNS for kitten.journeyaiapp.com | **You do this** |
| Database schema | **Built — run migration** |
| Admin user | **Built — run seed** |
| Backend API (all endpoints) | **Built** |
| Frontend (all pages) | **Built** |
| Worker (scheduler + exporter) | **Built** |
| Image upload to R2 | **Built** |
| OpenAI generation | **Built** |
| TikTok OAuth + export | **Built** |
| Fly deployment config | **Built** |
| Vercel deployment config | **Built** |
