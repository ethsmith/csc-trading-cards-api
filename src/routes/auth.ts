import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { findOrCreateUser } from '../services/users';
import { DiscordUser } from '../types';

const router = Router();

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

router.get('/discord', (req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

router.get('/discord/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    res.redirect(`${FRONTEND_URL}/auth/error?message=No authorization code provided`);
    return;
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Discord token error:', error);
      res.redirect(`${FRONTEND_URL}/auth/error?message=Failed to authenticate with Discord`);
      return;
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };

    // Fetch user info
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      res.redirect(`${FRONTEND_URL}/auth/error?message=Failed to fetch user info`);
      return;
    }

    const discordUser = await userResponse.json() as DiscordUser;

    // Create or update user in database
    await findOrCreateUser(
      discordUser.id,
      discordUser.username,
      discordUser.avatar
    );

    // Generate JWT
    const token = jwt.sign(
      {
        discordId: discordUser.id,
        username: discordUser.username,
        avatar: discordUser.avatar,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('Auth error:', error);
    res.redirect(`${FRONTEND_URL}/auth/error?message=Authentication failed`);
  }
});

router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      discordId: string;
      username: string;
      avatar: string | null;
    };

    res.json({
      discordId: decoded.discordId,
      username: decoded.username,
      avatar: decoded.avatar,
      avatarUrl: decoded.avatar
        ? `https://cdn.discordapp.com/avatars/${decoded.discordId}/${decoded.avatar}.png`
        : null,
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  // JWT is stateless, so logout is handled client-side by removing the token
  res.json({ success: true });
});

export default router;
