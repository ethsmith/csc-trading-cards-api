import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedUser } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthenticatedUser;
      req.user = decoded;
    } catch {
      // Token invalid, but that's okay for optional auth
    }
  }
  
  next();
}

const ADMIN_DISCORD_IDS = (process.env.ADMIN_DISCORD_IDS || '').split(',').filter(Boolean);

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthenticatedUser;
    req.user = decoded;

    if (!ADMIN_DISCORD_IDS.includes(decoded.discordId)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
