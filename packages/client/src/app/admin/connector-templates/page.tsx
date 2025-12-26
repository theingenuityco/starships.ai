'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import { useAdminConnectorTemplates, useUpdateAdminConnectorTemplate } from '@/hooks/useAdminConnectorTemplates'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AdminConnectorTemplatesPage(): React.JSX.Element {
  const router = useRouter()
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const { data: connectors = [], isLoading, isError, error } = useAdminConnectorTemplates(isAuthenticated && isInstanceAdmin)
  const updateMutation = useUpdateAdminConnectorTemplate()

  if (!isAuthenticated) {
    return (
      <PageLayout title="Connector templates" description="Sign in to manage connector templates." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Connector templates" description="Instance admin tools for managing connector templates." showHeader>
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
                <Link href="/admin/connector-templates" className="text-sm font-medium underline underline-offset-4">
                  Connector templates
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/agents/pending" className="text-sm font-medium underline underline-offset-4">
                  Agent approvals
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/platform-secrets" className="text-sm font-medium underline underline-offset-4">
                  Platform secrets
                </Link>
              </div>
              <p className="text-muted-foreground mt-3">Manage connector templates (enabled/disabled, runtime fields like auth/baseUrl/endpoints) for this instance.</p>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-end">
                <Button onClick={() => router.push('/admin/connector-templates/new')}>
                  <Icon name="plus" className="h-4 w-4 mr-1" />
                  New connector template
                </Button>
              </div>
              <div className="w-full rounded-md border overflow-visible">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Provider</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Name</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Auth type</th>
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
                          {(error as any)?.message || 'Failed to load connector templates.'}
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
                        <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/admin/connector-templates/${c.id}`)}>
                          <td className="px-4 py-3 text-sm font-mono">{c.provider}</td>
                          <td className="px-4 py-3 text-sm">{c.name}</td>
                          <td className="px-4 py-3 text-sm font-mono">{c.authType}</td>
                          <td className="px-4 py-3 text-sm">
                            <div
                              className="inline-flex items-center gap-2"
                              onClick={e => {
                                // Prevent row navigation when toggling.
                                e.stopPropagation()
                              }}
                            >
                              <Switch
                                size="sm"
                                checked={c.isEnabled}
                                disabled={updateMutation.isPending}
                                onCheckedChange={async checked => {
                                  await updateMutation.mutateAsync({
                                    id: c.id,
                                    updates: { isEnabled: checked },
                                  })
                                }}
                              />
                              <span className="text-xs font-mono text-muted-foreground">{c.isEnabled ? 'enabled' : 'disabled'}</span>
                            </div>
                          </td>
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
