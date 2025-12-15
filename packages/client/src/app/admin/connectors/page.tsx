'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useAdminConnectorTemplates } from '@/hooks/useAdminConnectors'

export default function AdminConnectorsPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const { data: connectors = [], isLoading, isError, error } = useAdminConnectorTemplates(isAuthenticated && isInstanceAdmin)

  if (!isAuthenticated) {
    return (
      <PageLayout title="Connectors" description="Sign in to manage connectors." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Connectors" description="Instance admin tools for managing connectors." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can view and manage connector templates.</CardDescription>
            </CardHeader>
          </Card>
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
                <Icon name="shield-check" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Admin</h1>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2">
                <a href="/admin/connectors" className="text-sm font-medium underline underline-offset-4">
                  Connectors
                </a>
                <span className="text-muted-foreground">·</span>
                <a href="/admin/agents/pending" className="text-sm font-medium underline underline-offset-4">
                  Agent approvals
                </a>
                <span className="text-muted-foreground">·</span>
                <a href="/admin/platform-secrets" className="text-sm font-medium underline underline-offset-4">
                  Platform secrets
                </a>
              </div>
              <p className="text-muted-foreground mt-3">Manage connector templates (runtime config and blueprints) for this instance.</p>
            </div>

            <section className="space-y-4">
              <div className="w-full rounded-md border overflow-visible">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Provider</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Display name</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Auth</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Enabled</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Version</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={6}>
                          Loading…
                        </td>
                      </tr>
                    )}
                    {isError && !isLoading && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={6}>
                          {(error as any)?.message || 'Failed to load connectors.'}
                        </td>
                      </tr>
                    )}
                    {!isLoading && !isError && connectors.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={6}>
                          No connector templates found.
                        </td>
                      </tr>
                    )}
                    {!isLoading &&
                      !isError &&
                      connectors.map(c => (
                        <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => (window.location.href = `/admin/connectors/${c.id}`)}>
                          <td className="px-4 py-3 text-sm font-mono">{c.provider}</td>
                          <td className="px-4 py-3 text-sm">{c.displayName}</td>
                          <td className="px-4 py-3 text-sm font-mono">{c.authType}</td>
                          <td className="px-4 py-3 text-sm font-mono">{c.isEnabled ? 'true' : 'false'}</td>
                          <td className="px-4 py-3 text-sm font-mono">{c.version}</td>
                          <td className="px-4 py-3 text-sm">{new Date(c.updatedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
