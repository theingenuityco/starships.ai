'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageLayout } from '@/components/layout/PageLayout'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'
import { useStarshipBySlug } from '@/hooks/useStarships'

interface ConnectorsSettingsContentProps {
  slug: string
}

export function ConnectorsSettingsContent({ slug }: ConnectorsSettingsContentProps) {
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug)

  if (starshipLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col h-screen items-center justify-center">
          <div className="text-center space-y-4 opacity-100">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <Icon name="plug" className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <p className="text-muted-foreground">Loading connectors...</p>
          </div>
        </div>
      </PageLayout>
    )
  }

  if (!starship) {
    return (
      <PageLayout>
        <div className="flex flex-col h-screen items-center justify-center">
          <div className="w-full max-w-6xl mx-auto px-6">
            <Alert>
              <Icon name="info" className="h-4 w-4" />
              <AlertDescription>Starship not found. Please check the URL and try again.</AlertDescription>
            </Alert>
          </div>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="plug" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Connectors</h1>
              </div>
              <p className="text-muted-foreground">
                Securely connect <strong>{starship.name}</strong> to your external accounts and data sources.
              </p>
            </div>

            {starship.id && (
              <div className="mt-4">
                <StarshipConnectorsPanel starshipId={starship.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
