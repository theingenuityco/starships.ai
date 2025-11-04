'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { ToolModel } from '@starships/protocol'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface DeployedToolCardProps {
  tool: ToolModel
  onClick: () => void
  onOpen?: (tool: ToolModel) => void
  onEdit?: (tool: ToolModel) => void
  onDelete?: (tool: ToolModel) => void
  showActions?: boolean
}

export function DeployedToolCard({ tool, onClick, onOpen, onEdit, onDelete, showActions = false }: DeployedToolCardProps) {
  return (
    <Card
      className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-xl group relative overflow-hidden transition-all duration-300 cursor-pointer border-border/20 hover:border-border/40"
      onClick={onClick}
    >
      <CardHeader className="pb-3 relative z-10">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-6 w-6 rounded-full ring-1 ring-border/40 flex items-center justify-center bg-muted/20">
              <Icon name="wrench" className="w-3.5 h-3.5" />
            </div>
            <CardTitle className="truncate text-base font-semibold">{tool.name}</CardTitle>
            {tool.slug && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                {tool.slug}
              </Badge>
            )}
          </div>
          {showActions && onEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={e => {
                e.stopPropagation()
                onEdit(tool)
              }}
            >
              <Icon name="pencil" className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        {tool.description && <CardDescription className="line-clamp-2 text-xs">{tool.description}</CardDescription>}
      </CardHeader>
      <CardContent className="relative z-10 pt-0">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs flex items-center gap-1.5">
            <Icon name="fingerprint" className="w-3 h-3" />
            <span className="font-mono">{(tool as any)?.id?.slice?.(0, 6) || 'tool'}</span>
          </Badge>
          {onOpen ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={e => {
                e.stopPropagation()
                onOpen(tool)
              }}
            >
              <Icon name="external-link" className="mr-1 h-3.5 w-3.5" />
              Open
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default DeployedToolCard
