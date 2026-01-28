import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { openPack, tradeInDuplicates } from '../services/cards';
import { getPackBalance, decrementPackBalance, addPacks } from '../services/users';

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

router.post('/trade-in', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { cardIds } = req.body;
    const requiredCount = 30;

    if (!Array.isArray(cardIds)) {
      res.status(400).json({ error: 'cardIds must be an array' });
      return;
    }

    if (cardIds.length !== requiredCount) {
      res.status(400).json({ error: `Must trade in exactly ${requiredCount} duplicate cards` });
      return;
    }

    await tradeInDuplicates(req.user!.discordId, cardIds, requiredCount);

    // Add 1 pack to user's balance instead of opening immediately
    const newBalance = await addPacks(req.user!.discordId, 1);

    res.json({
      packBalance: newBalance,
      message: `Successfully traded in ${requiredCount} cards for a pack!`,
    });
  } catch (error: any) {
    console.error('Error trading in cards:', error);
    if (error.message?.includes('must have more than one') || 
        error.message?.includes('not found') || 
        error.message?.includes('does not belong') ||
        error.message?.includes('Must trade in exactly') ||
        error.message?.includes('Cannot trade in the same card')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to trade in cards' });
  }
});

export default router;
