import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import {
  createChangelog,
  getChangelogs,
  getChangelogById,
  getChangelogsForUser,
  getUnreadChangelogsCount,
  markChangelogAsRead,
  markAllChangelogsAsRead,
  deleteChangelog,
} from '../services/changelogs';

const router = Router();

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const changelogs = await getChangelogsForUser(req.user!.discordId);
    const unreadCount = await getUnreadChangelogsCount(req.user!.discordId);
    res.json({
      changelogs,
      unreadCount,
    });
  } catch (error: any) {
    console.error('Error fetching changelogs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch changelogs' });
  }
});

router.get('/unread-count', authenticateToken, async (req: Request, res: Response) => {
  try {
    const count = await getUnreadChangelogsCount(req.user!.discordId);
    res.json({ unreadCount: count });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch unread count' });
  }
});

router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const changelog = await getChangelogById(req.params.id);
    if (!changelog) {
      res.status(404).json({ error: 'Changelog not found' });
      return;
    }
    res.json(changelog);
  } catch (error: any) {
    console.error('Error fetching changelog:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch changelog' });
  }
});

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, content, version } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const changelog = await createChangelog(title.trim(), content.trim(), version?.trim());
    res.status(201).json({
      message: 'Changelog created successfully',
      changelog,
    });
  } catch (error: any) {
    console.error('Error creating changelog:', error);
    res.status(500).json({ error: error.message || 'Failed to create changelog' });
  }
});

router.post('/:id/read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const wasMarked = await markChangelogAsRead(req.params.id, req.user!.discordId);
    res.json({
      message: wasMarked ? 'Changelog marked as read' : 'Changelog was already read',
      markedAsRead: wasMarked,
    });
  } catch (error: any) {
    console.error('Error marking changelog as read:', error);
    if (error.message === 'Changelog not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to mark changelog as read' });
  }
});

router.post('/read-all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const count = await markAllChangelogsAsRead(req.user!.discordId);
    res.json({
      message: count > 0 ? `Marked ${count} changelog(s) as read` : 'All changelogs already read',
      markedCount: count,
    });
  } catch (error: any) {
    console.error('Error marking all changelogs as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark changelogs as read' });
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await deleteChangelog(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Changelog not found' });
      return;
    }
    res.json({ message: 'Changelog deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting changelog:', error);
    res.status(500).json({ error: error.message || 'Failed to delete changelog' });
  }
});

export default router;
