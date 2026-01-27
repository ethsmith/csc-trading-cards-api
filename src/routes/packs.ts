import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { openPack } from '../services/cards';

const router = Router();

router.post('/open', authenticateToken, async (req: Request, res: Response) => {
  try {
    const packSize = req.body.packSize || 5;
    
    if (packSize < 1 || packSize > 10) {
      res.status(400).json({ error: 'Pack size must be between 1 and 10' });
      return;
    }

    const result = await openPack(req.user!.discordId, packSize);

    res.json({
      cards: result.cards,
      newSnapshots: result.newSnapshots.length,
      message: result.newSnapshots.length > 0 
        ? `${result.newSnapshots.length} new card snapshot(s) created!`
        : 'Pack opened successfully',
    });
  } catch (error) {
    console.error('Error opening pack:', error);
    res.status(500).json({ error: 'Failed to open pack' });
  }
});

export default router;
