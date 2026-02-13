import type { Client } from 'pg';
import { nanoid } from 'nanoid';
import { AgentRepository } from '@/repositories/AgentRepository';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { ToolRepository } from '@/repositories/ToolRepository';

// Keep this dictionary aligned with the server's starship name generator
// (`packages/server/src/utils/starshipNames.ts`) so backfilled starships match
// the naming style used for new signups.
const STARSHIP_NAMES = [
  'Endeavour',
  'Discovery',
  'Voyager',
  'Pioneer',
  'Explorer',
  'Pathfinder',
  'Navigator',
  'Horizon',
  'Aurora',
  'Meridian',
  'Andromeda',
  'Cassiopeia',
  'Orion',
  'Vega',
  'Sirius',
  'Polaris',
  'Centauri',
  'Nebula',
  'Pulsar',
  'Quasar',
  'Phoenix',
  'Titan',
  'Atlas',
  'Prometheus',
  'Icarus',
  'Odyssey',
  'Genesis',
  'Excalibur',
  'Valkyrie',
  'Serenity',
  'Quantum',
  'Vector',
  'Prism',
  'Nexus',
  'Helix',
  'Matrix',
  'Catalyst',
  'Synthesis',
  'Axiom',
  'Theorem',
  'Tempest',
  'Thunder',
  'Lightning',
  'Storm',
  'Comet',
  'Meteor',
  'Eclipse',
  'Solar',
  'Lunar',
  'Stellar',
  'Infinity',
  'Eternity',
  'Legacy',
  'Destiny',
  'Fortune',
  'Glory',
  'Honor',
  'Liberty',
  'Justice',
  'Triumph',
  'Stardust',
  'Starlight',
  'Starfire',
  'Starborn',
  'Starwind',
  'Starforge',
  'Starfall',
  'Starhawk',
  'Starseeker',
  'Starwalker',
  'Ascendant',
  'Transcendent',
  'Radiant',
  'Luminous',
  'Brilliant',
  'Majestic',
  'Noble',
  'Sovereign',
  'Supreme',
  'Ultimate',
  'Harbinger',
  'Sentinel',
  'Guardian',
  'Defiant',
  'Resolute',
  'Intrepid',
  'Dauntless',
  'Fearless',
  'Relentless',
  'Unstoppable',
  'Dreamcatcher',
  'Wishmaker',
  'Starwhisper',
  'Voidwalker',
  'Timekeeper',
  'Spaceforge',
  'Moonrider',
  'Sunblade',
  'Nightfall',
  'Dawnbreaker',
] as const;

function getRandomStarshipName(): string {
  const randomIndex = Math.floor(Math.random() * STARSHIP_NAMES.length);
  return String(STARSHIP_NAMES[randomIndex] ?? 'Voyager');
}

function getOwnerLabel(displayName: string | null, email: string | null): string | null {
  const fromDisplay = String(displayName ?? '').trim();
  if (fromDisplay) {
    const first = fromDisplay.split(/\s+/).filter(Boolean)[0] ?? '';
    return first.trim() || null;
  }
  const fromEmail = String(email ?? '').trim();
  if (fromEmail) {
    const local = fromEmail.split('@')[0] ?? '';
    const cleaned = local.trim();
    return cleaned || null;
  }
  return null;
}

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
  const createdStarshipIds: string[] = [];
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
      const randomShipName = getRandomStarshipName();
      const ownerLabel = getOwnerLabel(t.display_name ?? null, t.email ?? null);
      const starshipName = ownerLabel ? `${ownerLabel}'s ${randomShipName}` : `My ${randomShipName}`;

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

      createdStarshipIds.push(starshipId);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  // ---------------------------------------------------------------------------
  // Provisioning pass (best-effort)
  //
  // These users historically ended up with no starship at all. After creating the
  // default starship record + wallet + #lobby, also provision:
  // - baseline starship-level tools: read-url, read-older-messages (permission allow)
  // - Aria agent + all her assigned tools + allow permissions
  //
  // Note: Repositories use the normal app connection pool rather than the migration
  // client passed into this function. This is consistent with earlier migrations
  // (e.g. 021/022/079) and is intentionally best-effort.
  // ---------------------------------------------------------------------------
  try {
    const agentRepo = new AgentRepository();
    const templateRepo = new AgentTemplateRepository();
    const toolRepo = new ToolRepository();

    const ariaTemplate = await templateRepo.findBySlug('aria');
    if (!ariaTemplate?.id) {
      console.warn('[119_backfill_active_users_without_starships] Aria agent template not found (slug="aria"); skipping Aria provisioning.');
      return;
    }

    const ariaToolSlugs =
      Array.isArray(ariaTemplate.assignedToolSlugs) && ariaTemplate.assignedToolSlugs.length > 0
        ? ariaTemplate.assignedToolSlugs
        : [
            // Fallback to the expected Aria toolset (see models seeders).
            'list-agents',
            'list-agents-from-marketplace',
            'call-agent',
            'list-tools',
            'read-older-messages',
            'search-connector',
            'suggest-connectors',
            'suggest-agents',
            'render-starship-details',
          ];

    for (const starshipId of createdStarshipIds) {
      if (!starshipId) continue;

      // Best-effort advisory lock on the migration connection (matches earlier migrations).
      try {
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [starshipId]);
      } catch {
        /* ignore */
      }

      try {
        // 1) Baseline starship-level tools + allow permissions
        for (const baseSlug of ['read-url', 'read-older-messages'] as const) {
          try {
            let tool = await toolRepo.findByTemplateSlugAndStarship(baseSlug, starshipId);
            if (!tool) {
              tool = await toolRepo.createFromTemplate(baseSlug, starshipId);
            }
            // Upsert the starship-level permission mapping.
            await agentRepo.setStarshipToolPermissionBySlug({ starshipId, toolSlug: baseSlug, permission: 'allow' });
            void tool;
          } catch (e) {
            console.warn('[119_backfill_active_users_without_starships] Failed to ensure baseline tool for starship', {
              starshipId,
              tool: baseSlug,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // 2) Ensure Aria exists on the starship
        let ariaAgentId: string | null = null;
        try {
          const agents = await agentRepo.findByStarship(starshipId);
          const existing = agents.find((a) => a.sourceTemplateId === ariaTemplate.id) ?? null;
          if (existing?.id) {
            ariaAgentId = existing.id;
          } else {
            const created = await agentRepo.createFromTemplate(ariaTemplate.id, starshipId);
            ariaAgentId = created?.id ?? null;
          }
        } catch (e) {
          console.warn('[119_backfill_active_users_without_starships] Failed to ensure Aria agent for starship', {
            starshipId,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        if (!ariaAgentId) continue;

        // 3) Ensure Aria's assigned tools are deployed and wired to the agent
        const deployedToolIds: string[] = [];
        for (const toolSlug of ariaToolSlugs) {
          const slug = String(toolSlug || '').trim();
          if (!slug) continue;
          try {
            let tool = await toolRepo.findByTemplateSlugAndStarship(slug, starshipId);
            if (!tool) {
              tool = await toolRepo.createFromTemplate(slug, starshipId);
            }
            if (tool?.id) deployedToolIds.push(tool.id);
          } catch (e) {
            console.warn('[119_backfill_active_users_without_starships] Failed to ensure Aria tool for starship', {
              starshipId,
              tool: slug,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        for (const toolId of deployedToolIds) {
          try {
            await agentRepo.addToolRelationship(ariaAgentId, toolId);
          } catch {
            /* ignore */
          }
        }

        // 4) Allow all assigned tool relationships for Aria (matches current default-starship provisioning)
        try {
          await agentRepo.setAllAssignedToolPermissionsForAgent(ariaAgentId, 'allow');
        } catch {
          /* ignore */
        }
      } finally {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [starshipId]);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    // Do not fail the migration after the starship backfill has succeeded.
    console.warn('[119_backfill_active_users_without_starships] Provisioning pass failed (non-fatal):', e);
  }
}

export async function down(_client: Client): Promise<void> {
  // Data backfill migrations are not safely reversible.
  // Intentionally a no-op.
}

