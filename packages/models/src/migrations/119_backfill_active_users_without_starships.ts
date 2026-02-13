import type { Client } from 'pg';
import { nanoid } from 'nanoid';

/**
 * Migration 119: Backfill default starships for active users who have zero accessible starships.
 *
 * Definition:
 * - "Active user" = users.last_login_at IS NOT NULL
 * - "Zero accessible starships" = user owns 0 starships AND is a member of 0 starships
 *
 * Why:
 * - Historically, users could exist without any starship due to lazy provisioning.
 * - The app expects every user to have a usable starship (wallet + default channel).
 *
 * What we create:
 * - starship (Scout defaults)
 * - default conversation-backed #lobby channel + starships.default_channel_conversation_id
 * - wallet with 200.000000 welcome credits (currency: CREDITS)
 * - wallet_ledger ADJUSTMENT entry recording the welcome credit grant
 *
 * Idempotency:
 * - Users are selected only when they have no owned starships and no memberships at execution time.
 * - Re-running the migration should create 0 additional rows.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const getRows = <T>(result: unknown): T[] => {
      if (Array.isArray(result)) return result as T[];
      const anyRes = result as { rows?: unknown };
      return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
    };

    const targetRes = await client.query<{ id: string; display_name: string | null; email: string | null }>(
      `
      SELECT u.id, u.display_name, u.email
        FROM users u
       WHERE u.last_login_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM starships s WHERE s.owner_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM starship_members sm WHERE sm.user_id = u.id)
      `
    );
    const targets = getRows<{ id: string; display_name: string | null; email: string | null }>(targetRes);

    const initialCredits = 200;
    const balanceStr = initialCredits.toFixed(6);

    for (const t of targets) {
      const userId = String(t.id);

      const starshipId = nanoid();
      const slug = `my-starship-${nanoid(8).toLowerCase()}`;
      const starshipName = 'My Starship';

      const defaultConversationId = nanoid();
      const walletId = nanoid();
      const ledgerId = nanoid();

      // 1) Create starship (default channel pointer is set AFTER the conversation exists).
      // Use explicit values for columns that are relied on throughout the app.
      await client.query(
        `
        INSERT INTO starships (
          id,
          slug,
          owner_id,
          name,
          description,
          ship_class,
          max_agents,
          max_concurrent_turns,
          status,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          ''::text,
          'scout',
          5,
          1,
          'active',
          NOW(),
          NOW()
        )
        `,
        [starshipId, slug, userId, starshipName]
      );

      // 2) Create default #lobby conversation + channel.
      await client.query(
        `
        INSERT INTO conversations (id, title, status, state, starship_id, created_at, updated_at)
        VALUES ($1, $2, 'active', '{}'::jsonb, $3, NOW(), NOW())
        `,
        [defaultConversationId, 'Lobby', starshipId]
      );

      await client.query(
        `
        INSERT INTO channels (conversation_id, starship_id, slug, name, is_private, topic, created_at, updated_at)
        VALUES ($1, $2, 'lobby', 'Lobby', false, NULL, NOW(), NOW())
        `,
        [defaultConversationId, starshipId]
      );

      // Now that the conversation exists, set starships.default_channel_conversation_id.
      await client.query(
        `
        UPDATE starships
           SET default_channel_conversation_id = $1,
               updated_at = NOW()
         WHERE id = $2
        `,
        [defaultConversationId, starshipId]
      );

      // 3) Create wallet with welcome credits (currency: CREDITS).
      await client.query(
        `
        INSERT INTO wallets (id, starship_id, currency, balance, created_at, updated_at)
        VALUES ($1, $2, $3, $4::decimal, NOW(), NOW())
        `,
        [walletId, starshipId, 'CREDITS', balanceStr]
      );

      // 4) Record the welcome credits in wallet_ledger for UI/audit consistency.
      await client.query(
        `
        INSERT INTO wallet_ledger (id, wallet_id, type, amount, balance_after, meta, created_at)
        VALUES ($1, $2, 'ADJUSTMENT', $3::decimal, $4::decimal, $5::jsonb, NOW())
        `,
        [
          ledgerId,
          walletId,
          balanceStr,
          balanceStr,
          JSON.stringify({
            reason: 'WELCOME_CREDIT_BACKFILL_MISSING_STARSHIP',
            userId,
            starshipId,
            initialCredits,
            userEmail: t.email ?? null,
            userDisplayName: t.display_name ?? null,
          }),
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(_client: Client): Promise<void> {
  // Data backfill migrations are not safely reversible.
  // Intentionally a no-op.
}

