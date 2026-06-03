'use client'

import type { ConnectorProvider } from '@starships/protocol'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'
import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { useRoomSetupStatus, useRunRoomSetup } from '@/hooks/useRoomSetup'
import { useStartOAuthConnector } from '@/hooks/useConnectors'

function providerLabel(provider: string): string {
  if (provider === 'github') return 'GitHub'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

/**
 * Setup gate for a room with a server-side setup handler (e.g. the Engineering room).
 *
 * It is purely a one-time setup affordance, with three visible states:
 *  - connector(s) not connected  -> ask to connect them,
 *  - connected but not imported   -> ask to import (e.g. repositories),
 *  - connected + imported         -> setup complete, the banner disappears.
 *
 * Re-syncing already-imported data is a separate flow, not handled here.
 */
export function RoomSetupGate(props: { roomConversationId: string; starshipId: string }) {
  // The server is the authority on whether a room has a setup process (it matches by
  // bundle tag, falling back to slug) and returns null when there is none.
  const { data: setup } = useRoomSetupStatus(props.roomConversationId, Boolean(props.roomConversationId))
  const startOAuth = useStartOAuthConnector(props.starshipId)
  const runSetup = useRunRoomSetup(props.roomConversationId)

  // No handler / still loading -> nothing. Already set up -> setup is done, hide.
  if (!setup) return null
  if (setup.ready && setup.seeded) return null

  const handleConnect = async (provider: ConnectorProvider) => {
    try {
      const returnUrl = typeof window !== 'undefined' ? window.location.href : undefined
      const url = await startOAuth.mutateAsync(returnUrl ? { provider, returnUrl } : provider)
      if (url && typeof window !== 'undefined') window.location.href = url
    } catch {
      // Errors are surfaced as toasts by the hook.
    }
  }

  const connectedLabels = setup.connectors.filter((c) => c.connected).map((c) => providerLabel(c.provider))

  return (
    <div className="px-4 pt-4">
      <Card className="mx-auto w-full max-w-3xl border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="rocket" className="h-4 w-4 text-primary" />
            Set up this room
          </CardTitle>
          <CardDescription>
            {setup.ready
              ? 'Import your repositories to finish setting up this room.'
              : 'Connect the required integrations to activate this room.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {setup.ready ? (
            // Connected: skip the connect step entirely, ask only to import.
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {connectedLabels.length > 0 ? `${connectedLabels.join(', ')} connected` : 'Ready to import'}
              </span>
              <Button size="sm" variant="default" onClick={() => runSetup.mutate()} disabled={runSetup.isPending}>
                {runSetup.isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size={14} />
                    Importing…
                  </span>
                ) : (
                  'Import repositories'
                )}
              </Button>
            </div>
          ) : (
            // Not connected: ask to connect the missing integrations first.
            <ul className="flex flex-col gap-2">
              {setup.connectors
                .filter((c) => !c.connected)
                .map((c) => (
                  <li
                    key={c.provider}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Icon name={c.provider === 'github' ? 'github' : 'plug'} className="h-4 w-4 text-muted-foreground" />
                      {providerLabel(c.provider)}
                    </span>
                    <Button size="sm" variant="default" onClick={() => handleConnect(c.provider)} disabled={startOAuth.isPending}>
                      {startOAuth.isPending ? 'Connecting…' : `Connect ${providerLabel(c.provider)}`}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
