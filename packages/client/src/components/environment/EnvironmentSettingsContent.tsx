'use client'

import { useState } from 'react'
import { EnvironmentSummary } from '@starships/protocol'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useEnvironmentVariables, useCreateEnvironmentVariable, useUpdateEnvironmentVariable, useDeleteEnvironmentVariable } from '@/hooks/useEnvironmentVariables'
import { EnvironmentVariableList } from './EnvironmentVariableList'
import { EnvironmentVariableForm } from './EnvironmentVariableForm'
import { EnvironmentVariableDeleteModal } from './EnvironmentVariableDeleteModal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageLayout } from '@/components/layout/PageLayout'
import { Settings, Key, Shield, Info } from 'lucide-react'

interface EnvironmentSettingsContentProps {
  slug: string
}

export function EnvironmentSettingsContent({ slug }: EnvironmentSettingsContentProps) {
  // State for modals and selected items
  const [showForm, setShowForm] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedVariable, setSelectedVariable] = useState<EnvironmentSummary | undefined>()

  // Fetch starship data
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug)

  // Fetch environment variables
  const { data: variables = [], isLoading: variablesLoading, error: variablesError } = useEnvironmentVariables(starship?.id || '', !!starship?.id)

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
        variable: selectedVariable,
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
      await deleteMutation.mutateAsync(selectedVariable)
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
        <div className="container mx-auto py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-muted-foreground">Loading starship...</span>
          </div>
        </div>
      </PageLayout>
    )
  }

  if (!starship) {
    return (
      <PageLayout>
        <div className="container mx-auto py-8">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>Starship not found. Please check the URL and try again.</AlertDescription>
          </Alert>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Key className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Environment Variables</h1>
          </div>
          <p className="text-muted-foreground">
            Manage environment variables for <strong>{starship.name}</strong>. These variables will be securely encrypted and available to your agents.
          </p>
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
            <EnvironmentVariableList variables={variables} loading={variablesLoading} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} />
          )}
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
