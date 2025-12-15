'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { PlatformSecretSummary } from '@starships/protocol'

interface PlatformSecretListProps {
  secrets: PlatformSecretSummary[]
  loading?: boolean
  onAdd: () => void
  onEdit: (secret: PlatformSecretSummary) => void
  onDelete: (secret: PlatformSecretSummary) => void
}

export function PlatformSecretList({ secrets, loading = false, onAdd, onEdit, onDelete }: PlatformSecretListProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <Card className="frosted-glass-card shadow-frosted-lg">
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-muted-foreground">Loading platform secrets...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="frosted-glass-card shadow-frosted-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Secrets</h3>
          <Button onClick={onAdd} size="sm" className="flex items-center gap-2">
            <Icon name="plus" className="h-4 w-4" />
            Add Secret
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {secrets.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="key" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No platform secrets</h3>
            <p className="text-muted-foreground mb-4">Add a platform secret for connector templates (OAuth client IDs/secrets, bot tokens, etc.).</p>
            <Button onClick={onAdd} className="flex items-center gap-2 mx-auto">
              <Icon name="plus" className="h-4 w-4" />
              Add Your First Secret
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {secrets.map(secret => (
              <div key={secret.id} className="group px-6 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="key" className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-mono font-medium text-sm">{secret.key}</span>
                    </div>

                    {secret.description && (
                      <div className="flex items-start gap-2 mb-2">
                        <Icon name="file-text" className="h-3 w-3 text-muted-foreground mt-1 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">{secret.description}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Icon name="calendar" className="h-3 w-3" />
                        <span>Created {formatDate(secret.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Icon name="calendar" className="h-3 w-3" />
                        <span>Updated {formatDate(secret.updatedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icon name="dots-horizontal" className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(secret)} className="flex items-center gap-2">
                        <Icon name="edit" className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(secret)} className="flex items-center gap-2 text-destructive focus:text-destructive">
                        <Icon name="trash" className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
