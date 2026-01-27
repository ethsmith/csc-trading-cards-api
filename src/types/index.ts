export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
}

export interface AuthenticatedUser {
  discordId: string;
  username: string;
  avatar: string | null;
}

export type CardRarity = 'normal' | 'foil' | 'holo' | 'gold' | 'prismatic';

export type StatType = 'Regulation' | 'Combine';

export interface PlayerStats {
  name: string;
  rating: number;
  kr: number;
  adr: number;
  kast: number;
  impact: number;
  gameCount: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface CscPlayer {
  id: string;
  name: string;
  avatarUrl: string;
  steam64Id: string;
  discordId?: string;
  mmr?: number;
  tier: {
    name: string;
  };
  team?: {
    name: string;
    franchise: {
      name: string;
      prefix: string;
    };
  };
  type?: string;
}

export interface PlayerWithStats extends CscPlayer {
  stats?: PlayerStats;
}

export interface CardSnapshot {
  id: string;
  cscPlayerId: string;
  playerName: string;
  avatarUrl: string;
  season: number;
  statType: StatType;
  tier: string;
  teamName: string | null;
  franchiseName: string | null;
  franchisePrefix: string | null;
  mmr: number | null;
  rating: number;
  kr: number;
  adr: number;
  kast: number;
  impact: number;
  gameCount: number;
  kills: number;
  deaths: number;
  assists: number;
  createdAt: Date;
}

export interface OwnedCard {
  id: string;
  discordUserId: string;
  cardSnapshotId: string;
  rarity: CardRarity;
  obtainedAt: Date;
  snapshot?: CardSnapshot;
}

export interface TradeOffer {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  offeredCards: OwnedCard[];
  requestedCards: OwnedCard[];
}

export interface PackOpenResult {
  cards: OwnedCard[];
  newSnapshots: CardSnapshot[];
}

export const RARITY_WEIGHTS: Record<CardRarity, number> = {
  normal: 69.5,
  foil: 20,
  holo: 8,
  gold: 2,
  prismatic: 0.5,
};

export interface GuaranteedRarities {
  foil?: number;
  holo?: number;
  gold?: number;
  prismatic?: number;
}

export interface PackCode {
  code: string;
  createdBy: string;
  packCount: number;
  cardsPerPack: number;
  guaranteedRarities: GuaranteedRarities | null;
  redeemedBy: string | null;
  redeemedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}
