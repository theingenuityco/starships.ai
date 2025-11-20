'use client'

import Icon from '@/components/primitives/Icon'

import { useMemo, useState } from 'react'
import { EnvironmentSummary } from '@starships/protocol'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useEnvironmentVariables, useCreateEnvironmentVariable, useUpdateEnvironmentVariable, useDeleteEnvironmentVariable, useSystemEnvironmentVariables } from '@/hooks/useEnvironmentVariables'
import { EnvironmentVariableList } from './EnvironmentVariableList'
import { EnvironmentVariableForm } from './EnvironmentVariableForm'
import { EnvironmentVariableDeleteModal } from './EnvironmentVariableDeleteModal'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageLayout } from '@/components/layout/PageLayout'
import { Input } from '@/components/ui/input'
import { useConnectorCatalog, useStarshipConnectors } from '@/hooks/useConnectors'

interface EnvironmentSettingsContentProps {
  slug: string
}

export function EnvironmentSettingsContent({ slug }: EnvironmentSettingsContentProps) {
  // State for modals and selected items
  const [showForm, setShowForm] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedVariable, setSelectedVariable] = useState<EnvironmentSummary | undefined>()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'variables' | 'connectors'>('variables')

  // Fetch starship data
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug)

  // Fetch connector data for grouping managed environment variables
  const { data: connectorCatalog = [] } = useConnectorCatalog()
  const { data: starshipConnectors = [] } = useStarshipConnectors(starship?.id || '', !!starship?.id)

  // Fetch environment variables
  const { data: variables = [], isLoading: variablesLoading, error: variablesError } = useEnvironmentVariables(starship?.id || '', !!starship?.id)

  // Fetch system-level environment variables passed into the workflow runner
  const { data: systemEnv = [], isLoading: systemEnvLoading } = useSystemEnvironmentVariables(starship?.id || '', !!starship?.id)

  // Filter variables based on search query
  const filteredVariables = variables.filter(
    variable => variable.key.toLowerCase().includes(searchQuery.toLowerCase()) || (variable.description && variable.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Map connectorId -> human-friendly connector label (e.g. "LinkedIn", "Discord")
  const managedConnectorLabelsById = useMemo(() => {
    if (!starshipConnectors || starshipConnectors.length === 0) return {}

    const catalogByProvider = new Map(connectorCatalog.map(entry => [entry.provider, entry]))

    return starshipConnectors.reduce<Record<string, string>>((acc, connector) => {
      const catalogEntry = catalogByProvider.get(connector.provider)
      const displayName = catalogEntry?.displayName || connector.provider.charAt(0).toUpperCase() + connector.provider.slice(1)

      acc[connector.id] = displayName
      return acc
    }, {})
  }, [starshipConnectors, connectorCatalog])

  // Mutations
  const createMutation = useCreateEnvironmentVariable(starship?.id || '')
  const updateMutation = useUpdateEnvironmentVariable(starship?.id || '')
  const deleteMutation = useDeleteEnvironmentVariable(starship?.id || '')

  // Handle form actions
  const handleAdd = () => {
    setSelectedVariable(undefined)
    setShowForm(true)
  }

  const handleEdit = (variable: EnvironmentSummary) => {
    setSelectedVariable(variable)
    setShowForm(true)
  }

  const handleDelete = (variable: EnvironmentSummary) => {
    setSelectedVariable(variable)
    setShowDeleteModal(true)
  }

  const handleFormSubmit = async (data: { key: string; value?: string; description?: string }) => {
    if (selectedVariable) {
      // Update existing variable
      await updateMutation.mutateAsync({
        variableId: selectedVariable.id,
        updates: {
          value: data.value,
          description: data.description,
        },
      })
    } else {
      // Create new variable
      await createMutation.mutateAsync({
        key: data.key,
        value: data.value || '',
        description: data.description,
      })
    }

    setShowForm(false)
    setSelectedVariable(undefined)
  }

  const handleDeleteConfirm = async () => {
    if (selectedVariable) {
      await deleteMutation.mutateAsync(selectedVariable.id)
      setShowDeleteModal(false)
      setSelectedVariable(undefined)
    }
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setSelectedVariable(undefined)
  }

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false)
    setSelectedVariable(undefined)
  }

  if (starshipLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col h-screen items-center justify-center">
          <div className="text-center space-y-4 opacity-100">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <Icon name="key" className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <p className="text-muted-foreground">Loading environment settings...</p>
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
            {/* Header */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="key" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Environment & Connectors</h1>
              </div>
              <p className="text-muted-foreground">
                Manage environment variables and third-party connectors for <strong>{starship.name}</strong>. These variables will be securely
                encrypted. Non-secret values may be exposed to workflows as configuration; secrets are only used by the platform when executing
                connectors and tools.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex items-center justify-center mb-6">
              <div className="inline-flex items-center rounded-full border border-border/40 bg-muted/40 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab('variables')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    activeTab === 'variables' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Variables
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('connectors')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    activeTab === 'connectors' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Connectors
                </button>
              </div>
            </div>

            {activeTab === 'variables' && (
              <>
                {/* Search */}
                <div className="mb-8 sticky top-6 z-30">
                  <div className="relative max-w-md mb-6 mx-auto">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="Search environment variables..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-10 pr-3 w-full frosted-glass-card shadow-frosted-lg rounded-2xl border border-border/40 bg-transparent"
                    />
                  </div>
                </div>

                {/* Security Notice */}
                <Alert>
                  <Icon name="shield" className="h-4 w-4" />
                  <AlertDescription>All environment variables are encrypted at rest and in transit. Variable values are never displayed in the interface for security.</AlertDescription>
                </Alert>

                {/* Variables List */}
                <div>
                  {variablesError ? (
                    <Alert>
                      <Icon name="info" className="h-4 w-4" />
                      <AlertDescription>Failed to load environment variables. Please try refreshing the page.</AlertDescription>
                    </Alert>
                  ) : (
                    <EnvironmentVariableList
                      variables={filteredVariables}
                      loading={variablesLoading}
                      onAdd={handleAdd}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      managedConnectorLabelsById={managedConnectorLabelsById}
                    />
                  )}
                </div>

                {/* System environment variables used by the runtime and connectors */}
                <div className="mt-6">
                  <Card className="frosted-glass-card shadow-frosted-lg">
                    <CardHeader className="pb-1">
                      <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                        <Icon name="server" className="h-4 w-4 text-primary" />
                        System environment variables
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <p className="text-xs text-muted-foreground mt-0 mb-1 px-6 pt-0">
                        These read-only variables indicate which system capabilities are configured for this deployment (for example, base API URL,
                        LLM provider keys, or Discord bot access). Non-secret values may be surfaced to workflows as configuration; secret values are
                        never directly readable from workflows and are only used by the platform when calling LLMs or connectors.
                      </p>

                      {systemEnvLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground px-6 py-4">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          <span>Loading system environment variables...</span>
                        </div>
                      ) : systemEnv.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-6 py-4">No system environment variables are currently configured.</p>
                      ) : (
                        <div className="divide-y">
                          {systemEnv.map(item => (
                            <div key={item.key} className="group px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Icon name="key" className="h-4 w-4 text-primary flex-shrink-0" />
                                  <span className="font-mono font-medium text-sm">{item.key}</span>
                                </div>
                                {item.description && <span className="text-[11px] text-muted-foreground">{item.description}</span>}
                              </div>
                              <div className="ml-4 flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    item.present ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/40' : 'bg-destructive/5 text-destructive border border-destructive/40'
                                  }`}
                                >
                                  {item.present ? 'Configured' : 'Missing'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {activeTab === 'connectors' && starship.id && (
              <div className="mt-4">
                <StarshipConnectorsPanel starshipId={starship.id} />
              </div>
            )}
          </div>
        </div>

        {/* Form Modal */}
        <EnvironmentVariableForm
          isOpen={showForm}
          onClose={handleCloseForm}
          onSubmit={handleFormSubmit}
          environmentVariable={selectedVariable}
          loading={createMutation.isPending || updateMutation.isPending}
        />

        {/* Delete Modal */}
        <EnvironmentVariableDeleteModal
          isOpen={showDeleteModal}
          onClose={handleCloseDeleteModal}
          onConfirm={handleDeleteConfirm}
          environmentVariable={selectedVariable}
          loading={deleteMutation.isPending}
        />
      </div>
    </PageLayout>
  )
}
