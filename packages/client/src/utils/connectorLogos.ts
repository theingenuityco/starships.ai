/**
 * Shared helper for connector logo paths. Logos live in public/connectors/*.svg.
 * Keep in sync with StarshipConnectorsPanel and ConnectYourAppsDemo.
 */
export function toSafeConnectorLogoSlug(provider: string): string {
  return String(provider)
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export function getConnectorLogoSrc(provider: string): string {
  return `/connectors/${toSafeConnectorLogoSlug(provider)}.svg`
}
