import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database';
import { TradeOffer, OwnedCard } from '../types';
import { getCardById } from './cards';

export async function createTradeOffer(
  fromUserId: string,
  toUserId: string,
  offeredCardIds: string[],
  requestedCardIds: string[]
): Promise<TradeOffer> {
  const db = getDatabase();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verify all offered cards belong to fromUser
    for (const cardId of offeredCardIds) {
      const result = await connection.query(
        'SELECT discord_user_id FROM owned_cards WHERE id = ?',
        [cardId]
      );
      if (result.rows.length === 0 || result.rows[0].discord_user_id !== fromUserId) {
        throw new Error(`Card ${cardId} does not belong to the offering user`);
      }
    }

    // Verify all requested cards belong to toUser
    for (const cardId of requestedCardIds) {
      const result = await connection.query(
        'SELECT discord_user_id FROM owned_cards WHERE id = ?',
        [cardId]
      );
      if (result.rows.length === 0 || result.rows[0].discord_user_id !== toUserId) {
        throw new Error(`Card ${cardId} does not belong to the target user`);
      }
    }

    const tradeId = uuidv4();
    await connection.query(
      `INSERT INTO trade_offers (id, from_user_id, to_user_id, status)
       VALUES (?, ?, ?, 'pending')`,
      [tradeId, fromUserId, toUserId]
    );

    // Add offered cards
    for (const cardId of offeredCardIds) {
      await connection.query(
        `INSERT INTO trade_offer_cards (id, trade_offer_id, owned_card_id, is_offered)
         VALUES (?, ?, ?, true)`,
        [uuidv4(), tradeId, cardId]
      );
    }

    // Add requested cards
    for (const cardId of requestedCardIds) {
      await connection.query(
        `INSERT INTO trade_offer_cards (id, trade_offer_id, owned_card_id, is_offered)
         VALUES (?, ?, ?, false)`,
        [uuidv4(), tradeId, cardId]
      );
    }

    await connection.commit();

    return getTradeOfferById(tradeId) as Promise<TradeOffer>;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getTradeOfferById(tradeId: string): Promise<TradeOffer | null> {
  const db = getDatabase();
  const result = await db.query(
    `SELECT * FROM trade_offers WHERE id = ?`,
    [tradeId]
  );

  if (result.rows.length === 0) return null;

  const trade = result.rows[0];

  const cardResult = await db.query(
    `SELECT owned_card_id, is_offered FROM trade_offer_cards WHERE trade_offer_id = ?`,
    [tradeId]
  );

  const offeredCards: OwnedCard[] = [];
  const requestedCards: OwnedCard[] = [];

  for (const row of cardResult.rows) {
    const card = await getCardById(row.owned_card_id);
    if (card) {
      if (row.is_offered) {
        offeredCards.push(card);
      } else {
        requestedCards.push(card);
      }
    }
  }

  return {
    id: trade.id,
    fromUserId: trade.from_user_id,
    toUserId: trade.to_user_id,
    status: trade.status,
    createdAt: trade.created_at,
    updatedAt: trade.updated_at,
    offeredCards,
    requestedCards,
  };
}

export async function getUserTradeOffers(
  discordUserId: string,
  type: 'incoming' | 'outgoing' | 'all' = 'all'
): Promise<TradeOffer[]> {
  const db = getDatabase();
  let query = `SELECT id FROM trade_offers WHERE `;
  const params: string[] = [];

  if (type === 'incoming') {
    query += `to_user_id = ?`;
    params.push(discordUserId);
  } else if (type === 'outgoing') {
    query += `from_user_id = ?`;
    params.push(discordUserId);
  } else {
    query += `(from_user_id = ? OR to_user_id = ?)`;
    params.push(discordUserId, discordUserId);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await db.query(query, params);

  const trades: TradeOffer[] = [];
  for (const row of result.rows) {
    const trade = await getTradeOfferById(row.id);
    if (trade) trades.push(trade);
  }

  return trades;
}

export async function acceptTradeOffer(
  tradeId: string,
  acceptingUserId: string
): Promise<TradeOffer> {
  const db = getDatabase();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const tradeResult = await connection.query(
      `SELECT * FROM trade_offers WHERE id = ? AND status = 'pending' FOR UPDATE`,
      [tradeId]
    );

    if (tradeResult.rows.length === 0) {
      throw new Error('Trade offer not found or not pending');
    }

    const trade = tradeResult.rows[0];

    if (trade.to_user_id !== acceptingUserId) {
      throw new Error('Only the recipient can accept this trade');
    }

    // Get all cards in the trade
    const cardResult = await connection.query(
      `SELECT owned_card_id, is_offered FROM trade_offer_cards WHERE trade_offer_id = ?`,
      [tradeId]
    );

    // Verify ownership hasn't changed
    for (const row of cardResult.rows) {
      const cardCheck = await connection.query(
        `SELECT discord_user_id FROM owned_cards WHERE id = ? FOR UPDATE`,
        [row.owned_card_id]
      );

      if (cardCheck.rows.length === 0) {
        throw new Error('One of the cards no longer exists');
      }

      const expectedOwner = row.is_offered ? trade.from_user_id : trade.to_user_id;
      if (cardCheck.rows[0].discord_user_id !== expectedOwner) {
        throw new Error('Card ownership has changed, trade is no longer valid');
      }
    }

    // Swap ownership
    for (const row of cardResult.rows) {
      const newOwner = row.is_offered ? trade.to_user_id : trade.from_user_id;
      await connection.query(
        `UPDATE owned_cards SET discord_user_id = ? WHERE id = ?`,
        [newOwner, row.owned_card_id]
      );
    }

    // Update trade status
    await connection.query(
      `UPDATE trade_offers SET status = 'accepted' WHERE id = ?`,
      [tradeId]
    );

    // Cancel any other pending trades involving these cards
    const cardIds = cardResult.rows.map((r: any) => r.owned_card_id);
    if (cardIds.length > 0) {
      await connection.query(
        `UPDATE trade_offers SET status = 'cancelled' 
         WHERE id != ? AND status = 'pending' AND id IN (
           SELECT trade_offer_id FROM trade_offer_cards WHERE owned_card_id IN (?)
         )`,
        [tradeId, cardIds]
      );
    }

    await connection.commit();

    return getTradeOfferById(tradeId) as Promise<TradeOffer>;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function rejectTradeOffer(
  tradeId: string,
  rejectingUserId: string
): Promise<TradeOffer> {
  const db = getDatabase();
  const tradeResult = await db.query(
    `SELECT * FROM trade_offers WHERE id = ? AND status = 'pending'`,
    [tradeId]
  );

  if (tradeResult.rows.length === 0) {
    throw new Error('Trade offer not found or not pending');
  }

  const trade = tradeResult.rows[0];

  if (trade.to_user_id !== rejectingUserId) {
    throw new Error('Only the recipient can reject this trade');
  }

  await db.query(
    `UPDATE trade_offers SET status = 'rejected' WHERE id = ?`,
    [tradeId]
  );

  return getTradeOfferById(tradeId) as Promise<TradeOffer>;
}

export async function cancelTradeOffer(
  tradeId: string,
  cancellingUserId: string
): Promise<TradeOffer> {
  const db = getDatabase();
  const tradeResult = await db.query(
    `SELECT * FROM trade_offers WHERE id = ? AND status = 'pending'`,
    [tradeId]
  );

  if (tradeResult.rows.length === 0) {
    throw new Error('Trade offer not found or not pending');
  }

  const trade = tradeResult.rows[0];

  if (trade.from_user_id !== cancellingUserId) {
    throw new Error('Only the sender can cancel this trade');
  }

  await db.query(
    `UPDATE trade_offers SET status = 'cancelled' WHERE id = ?`,
    [tradeId]
  );

  return getTradeOfferById(tradeId) as Promise<TradeOffer>;
}
