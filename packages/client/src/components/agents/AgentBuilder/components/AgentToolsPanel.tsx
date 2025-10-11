'use client'

import Icon from '@/components/primitives/Icon'

import React, { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { AgentFormData, FormErrors } from '../types'

interface AgentToolsPanelProps {
  formData: AgentFormData
  errors: FormErrors
  onFieldChange: (field: keyof AgentFormData, value: string[]) => void
}

export const AgentToolsPanel: React.FC<AgentToolsPanelProps> = ({ formData, errors, onFieldChange }) => {
  const [newToolSlug, setNewToolSlug] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const handleAddTool = () => {
    const slug = newToolSlug.trim()
    if (slug && !formData.assignedToolSlugs.includes(slug)) {
      onFieldChange('assignedToolSlugs', [...formData.assignedToolSlugs, slug])
      setNewToolSlug('')
    }
  }

  const handleRemoveTool = (slug: string) => {
    onFieldChange(
      'assignedToolSlugs',
      formData.assignedToolSlugs.filter(s => s !== slug)
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTool()
    }
  }

  const filteredTools = formData.assignedToolSlugs.filter(slug => slug.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <Collapsible defaultOpen={false}>
      <div className="frosted-glass-card rounded-xl shadow-frosted-lg overflow-hidden w-full">
        <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Assigned Tools</span>
              {formData.assignedToolSlugs.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  {formData.assignedToolSlugs.length}
                </Badge>
              )}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/40">
            <div className="p-3 space-y-3">
              {/* Add New Tool */}
              <div className="space-y-1.5">
                <Label htmlFor="new-tool-slug" className="text-xs font-medium">
                  Add Tool by Slug
                </Label>
                <div className="flex gap-2">
                  <Input id="new-tool-slug" placeholder="tool-slug" value={newToolSlug} onChange={e => setNewToolSlug(e.target.value)} onKeyDown={handleKeyDown} className="text-xs font-mono flex-1" />
                  <Button onClick={handleAddTool} size="sm" className="h-8 px-3">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Enter a tool slug to assign it to this agent</p>
              </div>

              {/* Search Tools */}
              {formData.assignedToolSlugs.length > 0 && (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input placeholder="Search tools..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="text-xs pl-7 h-7" />
                  </div>
                </div>
              )}

              {/* Assigned Tools List */}
              {formData.assignedToolSlugs.length > 0 ? (
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-1">
                    {filteredTools.map(slug => (
                      <div key={slug} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
                        <span className="text-xs font-mono flex-1 truncate">{slug}</span>
                        <Button onClick={() => handleRemoveTool(slug)} variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {filteredTools.length === 0 && searchQuery && <p className="text-xs text-muted-foreground text-center py-4">No tools match &quot;{searchQuery}&quot;</p>}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-6 space-y-2">
                  <Wrench className="w-8 h-8 mx-auto text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">No tools assigned yet</p>
                  <p className="text-[10px] text-muted-foreground">Add tools to give this agent capabilities</p>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
