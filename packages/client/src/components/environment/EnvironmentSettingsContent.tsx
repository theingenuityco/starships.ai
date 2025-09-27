'use client'

import { useState } from 'react'
import { EnvironmentSummary } from '@starships/protocol'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useEnvironmentVariables, useCreateEnvironmentVariable, useUpdateEnvironmentVariable, useDeleteEnvironmentVariable } from '@/hooks/useEnvironmentVariables'
import { EnvironmentVariableList } from './EnvironmentVariableList'
import { EnvironmentVariableForm } from './EnvironmentVariableForm'
import { EnvironmentVariableDeleteModal } from './EnvironmentVariableDeleteModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageLayout } from '@/components/layout/PageLayout'
import { Input } from '@/components/ui/input'
import { Settings, Key, Shield, Info, Search, Plus } from 'lucide-react'

interface EnvironmentSettingsContentProps {
  slug: string
}

export function EnvironmentSettingsContent({ slug }: EnvironmentSettingsContentProps) {
  // State for modals and selected items
  const [showForm, setShowForm] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedVariable, setSelectedVariable] = useState<EnvironmentSummary | undefined>()
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch starship data
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug)

  // Fetch environment variables
  const { data: variables = [], isLoading: variablesLoading, error: variablesError } = useEnvironmentVariables(starship?.id || '', !!starship?.id)

  // Filter variables based on search query
  const filteredVariables = variables.filter(
    variable => variable.key.toLowerCase().includes(searchQuery.toLowerCase()) || (variable.description && variable.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

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
              <Key className="w-8 h-8 text-primary animate-pulse" />
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
              <Info className="h-4 w-4" />
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
                <Key className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Environment Variables</h1>
              </div>
              <p className="text-muted-foreground">
                Manage environment variables for <strong>{starship.name}</strong>. These variables will be securely encrypted and available to your agents.
              </p>
            </div>

            {/* Search */}
            <div className="mb-8">
              <div className="relative max-w-md mb-6 mx-auto">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <Input type="text" placeholder="Search environment variables..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 pr-4 py-2 w-full" />
              </div>
            </div>

            {/* Security Notice */}
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>All environment variables are encrypted at rest and in transit. Variable values are never displayed in the interface for security.</AlertDescription>
            </Alert>

            {/* Variables List */}
            <div>
              {variablesError ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>Failed to load environment variables. Please try refreshing the page.</AlertDescription>
                </Alert>
              ) : (
                <EnvironmentVariableList variables={filteredVariables} loading={variablesLoading} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} />
              )}
            </div>
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
