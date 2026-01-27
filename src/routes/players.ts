import { Router, Request, Response } from 'express';
import { fetchPlayersWithStats, fetchCurrentSeason } from '../services/csc';
import { optionalAuth } from '../middleware/auth';

const router = Router();

let playersCache: any[] = [];
let playersCacheTime = 0;
const PLAYERS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    
    if (playersCache.length > 0 && now - playersCacheTime < PLAYERS_CACHE_DURATION) {
      res.json({ players: playersCache });
      return;
    }

    const players = await fetchPlayersWithStats();
    playersCache = players;
    playersCacheTime = now;

    res.json({ players });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

router.get('/season', optionalAuth, async (req: Request, res: Response) => {
  try {
    const season = await fetchCurrentSeason();
    res.json(season);
  } catch (error) {
    console.error('Error fetching season:', error);
    res.status(500).json({ error: 'Failed to fetch season info' });
  }
});

router.get('/eligible', optionalAuth, async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    
    if (playersCache.length === 0 || now - playersCacheTime >= PLAYERS_CACHE_DURATION) {
      const players = await fetchPlayersWithStats();
      playersCache = players;
      playersCacheTime = now;
    }

    const eligible = playersCache.filter((p: any) => p.stats && p.stats.gameCount > 0);

    res.json({ 
      players: eligible,
      total: eligible.length,
    });
  } catch (error) {
    console.error('Error fetching eligible players:', error);
    res.status(500).json({ error: 'Failed to fetch eligible players' });
  }
});

export default router;
