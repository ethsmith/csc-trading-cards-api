# CSC Trading Card API

Backend API for the CSC Trading Cards application with Discord authentication and MySQL storage.

## Features

- **Discord OAuth2 Authentication** - Login with Discord
- **MySQL Database** - Persistent storage for collections and trades
- **Card Snapshots** - Unique card versions based on season, stat type, and player avatar
- **Pack Opening** - Open packs to receive random cards with rarity system
- **Trading System** - Create, accept, reject, and cancel trade offers between players

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/discord` | Initiate Discord OAuth flow |
| GET | `/auth/discord/callback` | OAuth callback handler |
| GET | `/auth/me` | Get current user info |
| POST | `/auth/logout` | Logout (client-side token removal) |

### Collection
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/collection` | Get current user's collection |
| GET | `/collection/stats` | Get collection statistics |
| GET | `/collection/card/:cardId` | Get specific card details |
| GET | `/collection/user/:discordId` | Get another user's collection |

### Packs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/packs/open` | Open a pack (body: `{ packSize: 5 }`) |

### Trades
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/trades` | Create trade offer |
| GET | `/trades` | Get all trades (query: `?type=incoming|outgoing|all`) |
| GET | `/trades/pending` | Get pending trades |
| GET | `/trades/:tradeId` | Get specific trade |
| POST | `/trades/:tradeId/accept` | Accept trade |
| POST | `/trades/:tradeId/reject` | Reject trade |
| POST | `/trades/:tradeId/cancel` | Cancel trade |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/search?q=query` | Search users by username |
| GET | `/users/:discordId` | Get user profile |

### Players (CSC Data)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/players` | Get all players with stats |
| GET | `/players/season` | Get current season info |
| GET | `/players/eligible` | Get players eligible for cards |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | API health check |

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required environment variables:
- `DISCORD_CLIENT_ID` - Discord application client ID
- `DISCORD_CLIENT_SECRET` - Discord application client secret
- `DISCORD_REDIRECT_URI` - OAuth callback URL (e.g., `http://localhost:3001/auth/discord/callback`)
- `FRONTEND_URL` - Frontend application URL (e.g., `http://localhost:5173`)
- `JWT_SECRET` - Secret key for JWT tokens
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - MySQL connection details

### 3. Set Up Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 settings
4. Add redirect URI: `http://localhost:3001/auth/discord/callback`
5. Copy Client ID and Client Secret to your `.env` file

### 4. Set Up MySQL Database
Create a database for the application:
```sql
CREATE DATABASE csc_trading_cards;
```

Tables are automatically created on first run.

### 5. Run the Server
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Card Snapshot System

Cards are unique based on:
- **CSC Player ID** - The player the card represents
- **Season** - The CSC season number
- **Stat Type** - Either "Regulation" or "Combine" stats
- **Avatar URL** - Player's profile picture at time of snapshot

This means you can collect different "eras" of the same player:
- Different seasons
- Different stat types (combine vs regulation)
- Different profile pictures

## Rarity System

| Rarity | Chance |
|--------|--------|
| Normal | 69.5% |
| Foil | 20% |
| Holo | 8% |
| Gold | 2% |
| Prismatic | 0.5% |

## Tech Stack

- **Express.js** - Web framework
- **TypeScript** - Type safety
- **MySQL2** - Database driver
- **JWT** - Authentication tokens
- **Helmet** - Security headers
- **CORS** - Cross-origin support
