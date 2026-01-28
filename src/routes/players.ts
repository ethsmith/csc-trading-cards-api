import { Router, Request, Response } from 'express';
import { getPlayersWithStats, fetchCurrentSeason } from '../services/csc';
import { optionalAuth } from '../middleware/auth';

const router = Router();

router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const players = getPlayersWithStats();
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
    const players = getPlayersWithStats();
    const eligible = players.filter((p: any) => p.stats && p.stats.gameCount > 0);

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
