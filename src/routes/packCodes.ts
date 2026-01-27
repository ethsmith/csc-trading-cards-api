import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import {
  createPackCode,
  getPackCode,
  getPackCodesByCreator,
  redeemPackCode,
  deletePackCode,
  CreatePackCodeOptions,
} from '../services/packCodes';

const router = Router();

router.post('/generate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      count,
      packCount,
      cardsPerPack,
      guaranteedRarities,
      expiresInDays,
    } = req.body;

    const options: CreatePackCodeOptions = {};

    // Validate count (number of codes to generate)
    let codeCount = 1;
    if (count !== undefined) {
      if (typeof count !== 'number' || count < 1 || count > 100) {
        res.status(400).json({ error: 'count must be between 1 and 100' });
        return;
      }
      codeCount = count;
    }

    if (packCount !== undefined) {
      if (typeof packCount !== 'number' || packCount < 1 || packCount > 100) {
        res.status(400).json({ error: 'packCount must be between 1 and 100' });
        return;
      }
      options.packCount = packCount;
    }

    if (cardsPerPack !== undefined) {
      if (typeof cardsPerPack !== 'number' || cardsPerPack < 1 || cardsPerPack > 20) {
        res.status(400).json({ error: 'cardsPerPack must be between 1 and 20' });
        return;
      }
      options.cardsPerPack = cardsPerPack;
    }

    if (guaranteedRarities !== undefined) {
      if (typeof guaranteedRarities !== 'object') {
        res.status(400).json({ error: 'guaranteedRarities must be an object' });
        return;
      }

      const validRarities = ['foil', 'holo', 'gold', 'prismatic'];
      for (const key of Object.keys(guaranteedRarities)) {
        if (!validRarities.includes(key)) {
          res.status(400).json({ error: `Invalid rarity: ${key}` });
          return;
        }
        if (typeof guaranteedRarities[key] !== 'number' || guaranteedRarities[key] < 0) {
          res.status(400).json({ error: `${key} count must be a non-negative number` });
          return;
        }
      }

      const totalGuaranteed = Object.values(guaranteedRarities as Record<string, number>)
        .reduce((a, b) => a + b, 0);
      const effectiveCardsPerPack = options.cardsPerPack || 5;
      
      if (totalGuaranteed > effectiveCardsPerPack) {
        res.status(400).json({ 
          error: `Total guaranteed rarities (${totalGuaranteed}) exceeds cards per pack (${effectiveCardsPerPack})` 
        });
        return;
      }

      options.guaranteedRarities = guaranteedRarities;
    }

    if (expiresInDays !== undefined) {
      if (typeof expiresInDays !== 'number' || expiresInDays < 1) {
        res.status(400).json({ error: 'expiresInDays must be a positive number' });
        return;
      }
      options.expiresInDays = expiresInDays;
    }

    // Generate multiple codes
    const codes = [];
    for (let i = 0; i < codeCount; i++) {
      const packCode = await createPackCode(req.user!.discordId, options);
      codes.push({
        code: packCode.code,
        packCount: packCode.packCount,
        cardsPerPack: packCode.cardsPerPack,
        guaranteedRarities: packCode.guaranteedRarities,
        expiresAt: packCode.expiresAt,
        createdAt: packCode.createdAt,
      });
    }

    // Return single object for backwards compatibility if count is 1
    if (codeCount === 1) {
      res.status(201).json(codes[0]);
    } else {
      res.status(201).json({
        count: codes.length,
        codes,
      });
    }
  } catch (error: any) {
    console.error('Error generating pack code:', error);
    res.status(500).json({ error: error.message || 'Failed to generate pack code' });
  }
});

router.get('/my-codes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const codes = await getPackCodesByCreator(req.user!.discordId);
    res.json({ codes });
  } catch (error) {
    console.error('Error fetching pack codes:', error);
    res.status(500).json({ error: 'Failed to fetch pack codes' });
  }
});

router.get('/:code', authenticateToken, async (req: Request, res: Response) => {
  try {
    const packCode = await getPackCode(req.params.code);

    if (!packCode) {
      res.status(404).json({ error: 'Pack code not found' });
      return;
    }

    res.json({
      code: packCode.code,
      packCount: packCode.packCount,
      cardsPerPack: packCode.cardsPerPack,
      guaranteedRarities: packCode.guaranteedRarities,
      isRedeemed: !!packCode.redeemedBy,
      isExpired: packCode.expiresAt ? new Date(packCode.expiresAt) < new Date() : false,
      expiresAt: packCode.expiresAt,
    });
  } catch (error) {
    console.error('Error fetching pack code:', error);
    res.status(500).json({ error: 'Failed to fetch pack code' });
  }
});

router.post('/redeem', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Pack code is required' });
      return;
    }

    const result = await redeemPackCode(code, req.user!.discordId);

    res.json({
      message: `Successfully redeemed ${result.packsAdded} pack(s)! You now have ${result.newPackBalance} packs to open.`,
      packsAdded: result.packsAdded,
      packBalance: result.newPackBalance,
    });
  } catch (error: any) {
    console.error('Error redeeming pack code:', error);
    res.status(400).json({ error: error.message || 'Failed to redeem pack code' });
  }
});

router.delete('/:code', requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await deletePackCode(req.params.code, req.user!.discordId);

    if (!deleted) {
      res.status(404).json({ error: 'Pack code not found or already redeemed' });
      return;
    }

    res.json({ message: 'Pack code deleted successfully' });
  } catch (error) {
    console.error('Error deleting pack code:', error);
    res.status(500).json({ error: 'Failed to delete pack code' });
  }
});

export default router;
