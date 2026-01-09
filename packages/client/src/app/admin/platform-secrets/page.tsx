'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformSecretDeleteModal, PlatformSecretForm, PlatformSecretList } from '@/components/platform-secrets'
import { useAuth } from '@/hooks/useAuth'
import { useCreatePlatformSecret, useDeletePlatformSecret, usePlatformSecrets, useUpdatePlatformSecret } from '@/hooks/usePlatformSecrets'
import type { PlatformSecretSummary } from '@starships/protocol'
import { useState } from 'react'
import Link from 'next/link'

export default function PlatformSecretsAdminPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()

  const { data: secrets = [], isLoading } = usePlatformSecrets(isAuthenticated && isInstanceAdmin)
  const createMutation = useCreatePlatformSecret()
  const updateMutation = useUpdatePlatformSecret()
  const deleteMutation = useDeletePlatformSecret()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selected, setSelected] = useState<PlatformSecretSummary | null>(null)

  if (!isAuthenticated) {
    return (
      <PageLayout title="Platform secrets" description="Sign in to manage platform secrets." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Platform secrets" description="Instance admin tools for managing platform secrets." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can view and manage platform secrets.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageLayout>
    )
  }

  const openCreate = () => {
    setSelected(null)
    setIsFormOpen(true)
  }

  const openEdit = (secret: PlatformSecretSummary) => {
    setSelected(secret)
    setIsFormOpen(true)
  }

  const openDelete = (secret: PlatformSecretSummary) => {
    setSelected(secret)
    setIsDeleteOpen(true)
  }

  const handleSubmit = async (data: { key: string; value?: string; description?: string }) => {
    if (!selected) {
      await createMutation.mutateAsync({
        key: data.key,
        value: data.value || '',
        description: data.description,
      })
      setIsFormOpen(false)
      return
    }

    await updateMutation.mutateAsync({
      key: selected.key,
      updates: {
        value: data.value ? data.value : undefined,
        description: data.description,
      },
    })
    setIsFormOpen(false)
  }

  const handleConfirmDelete = async () => {
    if (!selected) return
    await deleteMutation.mutateAsync(selected.key)
    setIsDeleteOpen(false)
    setSelected(null)
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
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/llm-models" className="text-sm font-medium underline underline-offset-4">
                  LLM models
                </Link>
              </div>
              <p className="text-muted-foreground mt-2">Instance-level encrypted secrets used by connectors (OAuth client IDs/secrets, bot tokens, etc.). Values are never displayed after saving.</p>
            </div>

            <PlatformSecretList secrets={secrets} loading={isLoading} onAdd={openCreate} onEdit={openEdit} onDelete={openDelete} />

            <PlatformSecretForm
              isOpen={isFormOpen}
              onClose={() => setIsFormOpen(false)}
              onSubmit={handleSubmit}
              secret={selected || undefined}
              loading={createMutation.isPending || updateMutation.isPending}
            />

            <PlatformSecretDeleteModal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={handleConfirmDelete} secret={selected || undefined} loading={deleteMutation.isPending} />
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
