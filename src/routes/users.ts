import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getUserByDiscordId, searchUsers } from '../services/users';
import { getCollectionStats } from '../services/cards';

const router = Router();

router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    const users = await searchUsers(query, 20);
    
    // Don't include the requesting user in search results
    const filtered = users.filter((u) => u.discordId !== req.user!.discordId);

    res.json({ users: filtered });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

router.get('/:discordId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await getUserByDiscordId(req.params.discordId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const stats = await getCollectionStats(user.discordId);

    res.json({
      discordId: user.discordId,
      username: user.username,
      avatar: user.avatar,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
        : null,
      collectionStats: stats,
      isCurrentUser: user.discordId === req.user!.discordId,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
