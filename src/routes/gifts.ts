import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import {
  createGiftForUser,
  createGiftForAll,
  getPendingGifts,
  claimGift,
  claimAllGifts,
} from '../services/gifts';

const router = Router();

router.post('/give', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { discordUserId, packCount, name, expiresInDays } = req.body;

    if (!packCount || typeof packCount !== 'number' || packCount < 1) {
      res.status(400).json({ error: 'packCount must be a positive number' });
      return;
    }

    const giftName = name || 'Admin Gift';
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    if (discordUserId === 'ALL' || discordUserId === '*') {
      const result = await createGiftForAll(giftName, packCount, expiresAt);
      res.status(201).json({
        message: `Gift of ${packCount} packs sent to ${result.count} users`,
        usersGifted: result.count,
        packCount,
        name: giftName,
      });
    } else if (discordUserId && typeof discordUserId === 'string') {
      const gift = await createGiftForUser(discordUserId, giftName, packCount, expiresAt);
      res.status(201).json({
        message: `Gift of ${packCount} packs sent to user`,
        gift: {
          id: gift.id,
          discordUserId: gift.discordUserId,
          name: gift.name,
          packCount: gift.packCount,
          expiresAt: gift.expiresAt,
        },
      });
    } else {
      res.status(400).json({ error: 'discordUserId is required (use "ALL" for all users)' });
    }
  } catch (error: any) {
    console.error('Error giving gift:', error);
    res.status(500).json({ error: error.message || 'Failed to give gift' });
  }
});

router.get('/pending', authenticateToken, async (req: Request, res: Response) => {
  try {
    const gifts = await getPendingGifts(req.user!.discordId);
    res.json({
      gifts,
      totalPacks: gifts.reduce((sum, g) => sum + g.packCount, 0),
    });
  } catch (error: any) {
    console.error('Error fetching pending gifts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pending gifts' });
  }
});

router.post('/claim/:giftId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await claimGift(req.params.giftId, req.user!.discordId);
    res.json({
      message: `Claimed ${result.packCount} packs!`,
      packsClaimed: result.packCount,
      newPackBalance: result.newPackBalance,
    });
  } catch (error: any) {
    console.error('Error claiming gift:', error);
    res.status(400).json({ error: error.message || 'Failed to claim gift' });
  }
});

router.post('/claim-all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await claimAllGifts(req.user!.discordId);

    if (result.giftsClaimed === 0) {
      res.json({
        message: 'No gifts to claim',
        giftsClaimed: 0,
        totalPacks: 0,
        newPackBalance: result.newPackBalance,
      });
      return;
    }

    res.json({
      message: `Claimed ${result.giftsClaimed} gift(s) for ${result.totalPacks} packs!`,
      giftsClaimed: result.giftsClaimed,
      totalPacks: result.totalPacks,
      newPackBalance: result.newPackBalance,
    });
  } catch (error: any) {
    console.error('Error claiming all gifts:', error);
    res.status(500).json({ error: error.message || 'Failed to claim gifts' });
  }
});

export default router;
