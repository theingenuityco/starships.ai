/**
 * Single source of truth for screenshot paths used on the landing.
 * Replace the `.svg` placeholders in `public/screenshots/` with real PNGs and
 * update the extensions below once you have them.
 */

export type Shot = { src: string; alt: string };

export const heroStrip: Shot[] = [
  { src: '/screenshots/01-room.svg', alt: 'Agent room with live conversation and tool calls' },
  { src: '/screenshots/02-agent-builder.svg', alt: 'Agent builder — name, prompt, model, tools' },
  { src: '/screenshots/03-connectors.svg', alt: 'Connectors page with multiple OAuth integrations' },
  { src: '/screenshots/04-approval.svg', alt: 'Tool approval flow inline in a conversation' },
];

export const capabilityShots = {
  workspace: { src: '/screenshots/05-workspace.svg', alt: 'Multi-tenant workspace with rooms and named agents' },
  connectors: { src: '/screenshots/06-connectors-detail.svg', alt: 'Connector library with OAuth and API-key integrations' },
  workflow: { src: '/screenshots/07-workflow.svg', alt: 'DAG workflow with parallel branches and event-driven nodes' },
  approval: { src: '/screenshots/08-approval-detail.svg', alt: 'Tool approval prompt with approve and deny actions' },
} satisfies Record<string, Shot>;
