'use client'

import Icon from '@/components/primitives/Icon'

import { useState } from 'react'
import { EnvironmentSummary } from '@starships/protocol'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { cn } from '@/lib/utils'

interface EnvironmentVariableListProps {
  variables: EnvironmentSummary[]
  loading?: boolean
  onAdd: () => void
  onEdit: (variable: EnvironmentSummary) => void
  onDelete: (variable: EnvironmentSummary) => void
  /**
   * Optional map of connectorId -> display label (e.g. "LinkedIn", "Discord")
   * Used to visually group variables managed by connectors.
   */
  managedConnectorLabelsById?: Record<string, string>
}

export function EnvironmentVariableList({
  variables,
  loading = false,
  onAdd,
  onEdit,
  onDelete,
  managedConnectorLabelsById = {},
}: EnvironmentVariableListProps) {
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

  const renderVariableRow = (variable: EnvironmentSummary) => (
    <div key={variable.id} className="group px-6 py-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="key" className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="font-mono font-medium text-sm">{variable.key}</span>
          </div>

          {variable.description && (
            <div className="flex items-start gap-2 mb-2">
              <Icon name="file-text" className="h-3 w-3 text-muted-foreground mt-1 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">{variable.description}</span>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Icon name="calendar" className="h-3 w-3" />
              <span>Created {formatDate(variable.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Icon name="calendar" className="h-3 w-3" />
              <span>Updated {formatDate(variable.updatedAt)}</span>
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
            <DropdownMenuItem onClick={() => onEdit(variable)} className="flex items-center gap-2">
              <Icon name="edit" className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(variable)}
              className="flex items-center gap-2 text-destructive focus:text-destructive"
            >
              <Icon name="trash" className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  if (loading) {
    return (
      <Card className="frosted-glass-card shadow-frosted-lg">
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-muted-foreground">Loading environment variables...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="frosted-glass-card shadow-frosted-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Variables</h3>
          <Button onClick={onAdd} size="sm" className="flex items-center gap-2">
            <Icon name="plus" className="h-4 w-4" />
            Add Variable
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {variables.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="key" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            {variables.length === 0 ? (
              <>
                <h3 className="text-lg font-medium mb-2">No environment variables</h3>
                <p className="text-muted-foreground mb-4">Get started by adding your first environment variable. These will be securely encrypted and available to your agents.</p>
                <Button onClick={onAdd} className="flex items-center gap-2 mx-auto">
                  <Icon name="plus" className="h-4 w-4" />
                  Add Your First Variable
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium mb-2">No matching variables</h3>
                <p className="text-muted-foreground">Try adjusting your search query to find the variable you&apos;re looking for.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Group variables that are managed by connectors */}
            {Object.entries(
              variables.reduce<Record<string, EnvironmentSummary[]>>((groups, variable) => {
                const connectorId = variable.connectorId
                if (connectorId && managedConnectorLabelsById[connectorId]) {
                  if (!groups[connectorId]) {
                    groups[connectorId] = []
                  }
                  groups[connectorId].push(variable)
                }
                return groups
              }, {})
            ).map(([connectorId, connectorVariables]) => {
              const label = managedConnectorLabelsById[connectorId]
              return (
                <div
                  key={connectorId}
                  className="mx-4 mt-2 rounded-xl border border-primary/40 bg-primary/5 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-2 text-xs font-medium text-primary">
                      <Icon name="plug" className="h-3 w-3" />
                      <span>Managed by {label} connector</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      Connector-managed
                    </Badge>
                  </div>
                  <div className="divide-y">
                    {connectorVariables.map(variable => renderVariableRow(variable))}
                  </div>
                </div>
              )
            })}

            {/* Variables not associated with any connector */}
            <div className="divide-y">
              {variables
                .filter(variable => !variable.connectorId || !managedConnectorLabelsById[variable.connectorId])
                .map(variable => renderVariableRow(variable))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
