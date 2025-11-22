import type { ConnectorProvider } from '@starships/protocol'

/**
 * Static mapping of connector provider -> logo asset path.
 *
 * Logos are served from the client `public/` directory.
 * For example, `/connectors/linkedin.svg` corresponds to
 * `packages/client/public/connectors/linkedin.svg`.
 */
export const CONNECTOR_LOGOS: Partial<Record<ConnectorProvider, string>> = {
  linkedin: '/connectors/linkedin.svg',
  discord: '/connectors/discord.svg',
  google_drive: '/connectors/google-drive.svg',
}
