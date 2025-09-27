'use client'

import { useState } from 'react'
import { EnvironmentSummary } from '@starships/protocol'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Key, MoreHorizontal, Edit, Trash2, Calendar, User, FileText, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface EnvironmentVariableListProps {
  variables: EnvironmentSummary[]
  loading?: boolean
  onAdd: () => void
  onEdit: (variable: EnvironmentSummary) => void
  onDelete: (variable: EnvironmentSummary) => void
}

export function EnvironmentVariableList({ variables, loading = false, onAdd, onEdit, onDelete }: EnvironmentVariableListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredVariables = variables.filter(
    variable => variable.key.toLowerCase().includes(searchQuery.toLowerCase()) || (variable.description && variable.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

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
            <span className="ml-3 text-muted-foreground">Loading environment variables...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="frosted-glass-card shadow-frosted-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search variables..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <Button onClick={onAdd} size="sm" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Variable
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filteredVariables.length === 0 ? (
          <div className="p-8 text-center">
            <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            {variables.length === 0 ? (
              <>
                <h3 className="text-lg font-medium mb-2">No environment variables</h3>
                <p className="text-muted-foreground mb-4">Get started by adding your first environment variable. These will be securely encrypted and available to your agents.</p>
                <Button onClick={onAdd} className="flex items-center gap-2 mx-auto">
                  <Plus className="h-4 w-4" />
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
          <div className="divide-y">
            {filteredVariables.map(variable => (
              <div key={variable.id} className="group px-6 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-mono font-medium text-sm">{variable.key}</span>
                    </div>

                    {variable.description && (
                      <div className="flex items-start gap-2 mb-2">
                        <FileText className="h-3 w-3 text-muted-foreground mt-1 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">{variable.description}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Created {formatDate(variable.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Updated {formatDate(variable.updatedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(variable)} className="flex items-center gap-2">
                        <Edit className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(variable)} className="flex items-center gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4" />
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
