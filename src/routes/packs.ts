import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { openPack } from '../services/cards';
import { getPackBalance, decrementPackBalance } from '../services/users';

const router = Router();

router.get('/balance', authenticateToken, async (req: Request, res: Response) => {
  try {
    const balance = await getPackBalance(req.user!.discordId);
    res.json({ packBalance: balance });
  } catch (error) {
    console.error('Error getting pack balance:', error);
    res.status(500).json({ error: 'Failed to get pack balance' });
  }
});

router.post('/open', authenticateToken, async (req: Request, res: Response) => {
  try {
    const packSize = req.body.packSize || 5;
    
    if (packSize < 1 || packSize > 10) {
      res.status(400).json({ error: 'Pack size must be between 1 and 10' });
      return;
    }

    // Check and decrement pack balance
    const decremented = await decrementPackBalance(req.user!.discordId);
    if (!decremented) {
      res.status(400).json({ error: 'No packs available. Redeem a code to get packs!' });
      return;
    }

    const result = await openPack(req.user!.discordId, packSize);
    const newBalance = await getPackBalance(req.user!.discordId);

    res.json({
      cards: result.cards,
      newSnapshots: result.newSnapshots.length,
      packBalance: newBalance,
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
