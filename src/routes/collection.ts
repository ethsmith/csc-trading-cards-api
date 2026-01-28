import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getUserCollection, getCollectionStats, openPack, getCardById, searchCardOwners } from '../services/cards';
import type { CardRarity } from '../types';

const router = Router();

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const cards = await getUserCollection(req.user!.discordId);
    res.json({ cards });
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

router.get('/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await getCollectionStats(req.user!.discordId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching collection stats:', error);
    res.status(500).json({ error: 'Failed to fetch collection stats' });
  }
});

router.get('/card/:cardId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const card = await getCardById(req.params.cardId);
    
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    // Only allow viewing own cards or public card info
    if (card.discordUserId !== req.user!.discordId) {
      // Return limited info for cards owned by others
      res.json({
        id: card.id,
        rarity: card.rarity,
        snapshot: card.snapshot,
        isOwned: false,
      });
      return;
    }

    res.json({ ...card, isOwned: true });
  } catch (error) {
    console.error('Error fetching card:', error);
    res.status(500).json({ error: 'Failed to fetch card' });
  }
});

router.get('/user/:discordId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const cards = await getUserCollection(req.params.discordId);
    res.json({ 
      cards,
      isOwnCollection: req.params.discordId === req.user!.discordId,
    });
  } catch (error) {
    console.error('Error fetching user collection:', error);
    res.status(500).json({ error: 'Failed to fetch user collection' });
  }
});

router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { playerName, rarity } = req.query;

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length < 2) {
      res.status(400).json({ error: 'playerName query parameter is required (min 2 characters)' });
      return;
    }

    const validRarities = ['normal', 'foil', 'holo', 'gold', 'prismatic'];
    const rarityFilter = rarity && typeof rarity === 'string' && validRarities.includes(rarity)
      ? rarity as CardRarity
      : undefined;

    // Exclude the current user from search results
    const result = await searchCardOwners(playerName.trim(), rarityFilter, req.user!.discordId);

    res.json(result);
  } catch (error) {
    console.error('Error searching card owners:', error);
    res.status(500).json({ error: 'Failed to search card owners' });
  }
});

export default router;
