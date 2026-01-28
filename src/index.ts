import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase } from './config/database';

import authRoutes from './routes/auth';
import collectionRoutes from './routes/collection';
import packsRoutes from './routes/packs';
import tradesRoutes from './routes/trades';
import usersRoutes from './routes/users';
import playersRoutes from './routes/players';
import packCodesRoutes from './routes/packCodes';
import giftsRoutes from './routes/gifts';
import changelogsRoutes from './routes/changelogs';
import { warmupCache, refreshCache, CACHE_DURATION } from './services/csc';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/collection', collectionRoutes);
app.use('/packs', packsRoutes);
app.use('/trades', tradesRoutes);
app.use('/users', usersRoutes);
app.use('/players', playersRoutes);
app.use('/codes', packCodesRoutes);
app.use('/gifts', giftsRoutes);
app.use('/changelogs', changelogsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    await initializeDatabase();
    console.log('Database initialized');

    // Pre-fetch player data before accepting requests
    await warmupCache();
    
    // Refresh cache periodically
    setInterval(() => refreshCache(), CACHE_DURATION);

    app.listen(PORT, () => {
      console.log(`🚀 CSC Trading Card API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
