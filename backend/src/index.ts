import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import pool from './db/pool';
import authRoutes from './routes/auth';
import bucketRoutes from './routes/buckets';
import jobRoutes from './routes/jobs';
import runRoutes from './routes/runs';
import settingsRoutes from './routes/settings';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '4000');
const PgSession = connectPgSimple(session);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Session
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'kitten.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/buckets', bucketRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kitten backend running on port ${PORT}`);
});

export default app;
