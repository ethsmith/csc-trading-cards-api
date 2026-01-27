import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createTradeOffer,
  getTradeOfferById,
  getUserTradeOffers,
  acceptTradeOffer,
  rejectTradeOffer,
  cancelTradeOffer,
} from '../services/trades';

const router = Router();

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { toUserId, offeredCardIds, requestedCardIds } = req.body;

    if (!toUserId || !Array.isArray(offeredCardIds) || !Array.isArray(requestedCardIds)) {
      res.status(400).json({ error: 'Invalid trade offer data' });
      return;
    }

    if (offeredCardIds.length === 0 && requestedCardIds.length === 0) {
      res.status(400).json({ error: 'Trade must include at least one card' });
      return;
    }

    if (toUserId === req.user!.discordId) {
      res.status(400).json({ error: 'Cannot trade with yourself' });
      return;
    }

    const trade = await createTradeOffer(
      req.user!.discordId,
      toUserId,
      offeredCardIds,
      requestedCardIds
    );

    res.status(201).json(trade);
  } catch (error: any) {
    console.error('Error creating trade:', error);
    res.status(400).json({ error: error.message || 'Failed to create trade offer' });
  }
});

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const type = req.query.type as 'incoming' | 'outgoing' | 'all' | undefined;
    const trades = await getUserTradeOffers(req.user!.discordId, type || 'all');
    res.json({ trades });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trade offers' });
  }
});

router.get('/pending', authenticateToken, async (req: Request, res: Response) => {
  try {
    const trades = await getUserTradeOffers(req.user!.discordId, 'all');
    const pending = trades.filter((t) => t.status === 'pending');
    res.json({ trades: pending });
  } catch (error) {
    console.error('Error fetching pending trades:', error);
    res.status(500).json({ error: 'Failed to fetch pending trades' });
  }
});

router.get('/:tradeId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const trade = await getTradeOfferById(req.params.tradeId);

    if (!trade) {
      res.status(404).json({ error: 'Trade offer not found' });
      return;
    }

    // Only allow viewing trades you're involved in
    if (trade.fromUserId !== req.user!.discordId && trade.toUserId !== req.user!.discordId) {
      res.status(403).json({ error: 'Not authorized to view this trade' });
      return;
    }

    res.json(trade);
  } catch (error) {
    console.error('Error fetching trade:', error);
    res.status(500).json({ error: 'Failed to fetch trade offer' });
  }
});

router.post('/:tradeId/accept', authenticateToken, async (req: Request, res: Response) => {
  try {
    const trade = await acceptTradeOffer(req.params.tradeId, req.user!.discordId);
    res.json(trade);
  } catch (error: any) {
    console.error('Error accepting trade:', error);
    res.status(400).json({ error: error.message || 'Failed to accept trade' });
  }
});

router.post('/:tradeId/reject', authenticateToken, async (req: Request, res: Response) => {
  try {
    const trade = await rejectTradeOffer(req.params.tradeId, req.user!.discordId);
    res.json(trade);
  } catch (error: any) {
    console.error('Error rejecting trade:', error);
    res.status(400).json({ error: error.message || 'Failed to reject trade' });
  }
});

router.post('/:tradeId/cancel', authenticateToken, async (req: Request, res: Response) => {
  try {
    const trade = await cancelTradeOffer(req.params.tradeId, req.user!.discordId);
    res.json(trade);
  } catch (error: any) {
    console.error('Error cancelling trade:', error);
    res.status(400).json({ error: error.message || 'Failed to cancel trade' });
  }
});

export default router;
