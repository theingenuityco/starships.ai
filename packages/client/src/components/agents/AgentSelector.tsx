'use client'

import { AgentAnalytics } from '@/components/agents/AgentAnalytics'
import { AgentCard } from '@/components/agents/AgentCard'
import { AgentForm } from '@/components/agents/AgentForm'
import { AgentTemplateSelector } from '@/components/agents/AgentTemplateSelector'
import { AgentTester } from '@/components/agents/AgentTester'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AGENT_TEXT, ERROR_TEXT, LOADING_TEXT } from '@/constants/text'
import { useDeleteAgent, useStarshipAgents } from '@/hooks/useAgents'
import type { AgentModel } from '@starships/protocol'
import { Bot, Loader2, Plus, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface AgentSelectorProps {
  selectedAgent: AgentModel | null
  onAgentSelect: (agent: AgentModel) => void
  showCreateButton?: boolean
  showFilters?: boolean
  starshipId?: string
  onAgentsCountChange?: (count: number) => void
}

interface FilterState {
  category?: 'general' | 'coding' | 'creative' | 'analysis' | 'support'
  searchQuery: string
}

export function AgentSelector({ selectedAgent, onAgentSelect, showCreateButton = true, showFilters = true, starshipId, onAgentsCountChange }: AgentSelectorProps) {
  // TanStack Query hooks
  const { data, isLoading: loading, error: agentsError } = useStarshipAgents(starshipId || '', !!starshipId)
  const agents = useMemo(() => data ?? [], [data])
  const deleteAgentMutation = useDeleteAgent()

  const [filteredAgents, setFilteredAgents] = useState<AgentModel[]>([])
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentModel | null>(null)

  // Test state
  const [showTester, setShowTester] = useState(false)
  const [testingAgent, setTestingAgent] = useState<AgentModel | null>(null)

  // Analytics state
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [analyticsAgent, setAnalyticsAgent] = useState<AgentModel | null>(null)

  // Filter state
  const [filters] = useState<FilterState>({
    searchQuery: '',
  })

  // Apply filters when agents change
  useEffect(() => {
    let filtered = [...agents]

    // Category filter
    if (filters.category) {
      const inferCategoryFromName = (agentName: string): 'general' | 'coding' | 'creative' | 'analysis' | 'support' => {
        const name = agentName.toLowerCase()
        if (name.includes('support')) return 'support'
        if (name.includes('data') || name.includes('analyst')) return 'analysis'
        if (name.includes('creative')) return 'creative'
        if (name.includes('code') || name.includes('coding')) return 'coding'
        return 'general'
      }
      filtered = filtered.filter(agent => inferCategoryFromName(agent.name) === filters.category)
    }

    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(agent => agent.name.toLowerCase().includes(query) || agent.description?.toLowerCase().includes(query))
    }

    setFilteredAgents(filtered)
  }, [agents, filters.category, filters.searchQuery])

  // Notify parent of agents count change
  useEffect(() => {
    if (onAgentsCountChange) {
      onAgentsCountChange(agents.length)
    }
  }, [agents.length, onAgentsCountChange])

  // Handle query errors
  useEffect(() => {
    if (agentsError) {
      setError(ERROR_TEXT.FAILED_TO_LOAD_AGENTS)
    } else {
      setError(null)
    }
  }, [agentsError])

  // Shared function to handle agent creation from template
  const handleCreateFromTemplate = async (templateId: string) => {
    // Validate that we have a valid starshipId
    if (!starshipId || typeof starshipId !== 'string' || starshipId.trim() === '') {
      console.error('Cannot create agent: Invalid or missing starshipId:', starshipId)
      setError('Cannot create agent: No valid starship selected. Please ensure you have access to a starship first.')
      return
    }

    try {
      // Use the real API to create agent from template
      const { templateAPI } = await import('@/lib/api')
      const newAgent = await templateAPI.createAgentFromTemplate(templateId, starshipId)

      // Select the newly created agent
      onAgentSelect(newAgent)
    } catch (error) {
      console.error('Failed to create agent from template:', error)
      // Enhanced error handling with specific error messages
      let errorMessage = 'Failed to create agent from template'

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error
        } else if (axiosError.response?.data?.message) {
          errorMessage = axiosError.response.data.message
        }
      }

      setError(errorMessage)
    }
  }

  const handleCreateAgent = () => {
    setEditingAgent(null)
    setShowForm(true)
  }

  const handleEditAgent = (agent: AgentModel) => {
    setEditingAgent(agent)
    setShowForm(true)
  }

  const handleDeleteAgent = async (agent: AgentModel) => {
    if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      return
    }

    try {
      await deleteAgentMutation.mutateAsync(agent.id)

      // If the deleted agent was selected, clear selection
      if (selectedAgent?.id === agent.id) {
        onAgentSelect(null as any) // Clear selection
      }
    } catch (error) {
      console.error('Failed to delete agent:', error)
      setError('Failed to delete agent')
    }
  }

  const handleFormSave = async (savedAgent: AgentModel) => {
    setShowForm(false)
    setEditingAgent(null)

    // If this was the selected agent, update the selection
    if (selectedAgent?.id === savedAgent.id) {
      onAgentSelect(savedAgent)
    }
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingAgent(null)
  }

  const handleTestAgent = (agent: AgentModel) => {
    setTestingAgent(agent)
    setShowTester(true)
  }

  const handleTestClose = () => {
    setShowTester(false)
    setTestingAgent(null)
  }

  const handleAnalyticsAgent = (agent: AgentModel) => {
    setAnalyticsAgent(agent)
    setShowAnalytics(true)
  }

  const handleAnalyticsClose = () => {
    setShowAnalytics(false)
    setAnalyticsAgent(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">{LOADING_TEXT.AGENTS}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5l-6.928-12c-.77-.833-2.694-.833-3.464 0l-6.928 12c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header with better visual hierarchy */}
      <div className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg space-y-6">
        <div className="flex items-center gap-4">
          <span className="bg-primary/20 p-3 rounded-lg shadow-sm flex-shrink-0">
            <Bot className="h-6 w-6 text-primary" />
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-xl font-bold text-foreground">{AGENT_TEXT.SECTION_TITLE}</h3>
            <p className="text-sm text-muted-foreground">Manage your starship&apos;s AI crew members</p>
          </div>
        </div>
        {showCreateButton && (
          <div className="flex items-center gap-2 justify-end">
            <AgentTemplateSelector
              onSelectTemplate={template => {
                // Handle template selection if needed
              }}
              onCreateFromTemplate={handleCreateFromTemplate}
              trigger={
                <Button
                  variant="default"
                  size="sm"
                  disabled={!starshipId || typeof starshipId !== 'string' || starshipId.trim() === ''}
                  className="h-9 whitespace-nowrap bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-md hover:shadow-lg border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!starshipId ? 'No starship available for agent deployment' : undefined}
                >
                  <Sparkles className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>From Template</span>
                </Button>
              }
            />
            <Button
              onClick={handleCreateAgent}
              size="sm"
              variant="outline"
              disabled={!starshipId || typeof starshipId !== 'string' || starshipId.trim() === ''}
              className="h-9 whitespace-nowrap border-primary/30 hover:border-primary/50 text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!starshipId ? 'No starship available for agent deployment' : undefined}
            >
              <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>Create Agent</span>
            </Button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="space-y-4">
          {/* Enhanced Search & Filter Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px bg-gradient-to-r from-primary/50 to-transparent flex-1"></div>
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">ACTIVE AGENTS</h4>
              <div className="h-px bg-gradient-to-l from-primary/50 to-transparent flex-1"></div>
            </div>

            {/* Search and Filters Side by Side - COMMENTED OUT FOR NOW */}
            {/* <div className="flex flex-col lg:flex-row gap-4">
              {/* Search Input */}
            {/* <div className="flex-1 relative">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10">
                  <Search className="w-4 h-4" />
                </div>
                <Input
                  placeholder="Search agents..."
                  value={filters.searchQuery}
                  onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                  className="pl-12 pr-4 h-12 bg-background border-2 border-primary/30 hover:border-primary/50 transition-all duration-200 shadow-sm hover:shadow-md"
                />
              </div> */}

            {/* Filters */}
            {/* <div className="lg:flex-shrink-0">
                <AgentFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  availableTags={Array.from(new Set(agents.flatMap(agent => agent.tags || [])))}
                />
              </div> */}
            {/* </div> */}
          </div>
        </div>
      )}

      {filteredAgents.length === 0 ? (
        <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
          <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <p className="text-base text-muted-foreground mb-3">{filters.searchQuery || filters.category ? 'No agents match your filters' : AGENT_TEXT.NO_AGENTS_AVAILABLE}</p>
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          {filteredAgents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent?.id === agent.id}
              onClick={() => onAgentSelect(agent)}
              onEdit={handleEditAgent}
              onDelete={handleDeleteAgent}
              onTest={handleTestAgent}
              onAnalytics={handleAnalyticsAgent}
              showActions={true}
            />
          ))}
        </div>
      )}

      {/* Agent Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent ? 'Edit Agent' : 'Create New Agent'}</DialogTitle>
          </DialogHeader>
          <AgentForm agent={editingAgent || undefined} onSave={handleFormSave} onCancel={handleFormCancel} />
        </DialogContent>
      </Dialog>

      {/* Agent Tester Dialog */}
      <Dialog open={showTester} onOpenChange={setShowTester}>
        <DialogContent className="max-w-7xl max-h-[95vh] p-0">{testingAgent && <AgentTester agent={testingAgent} onClose={handleTestClose} />}</DialogContent>
      </Dialog>

      {/* Agent Analytics Dialog */}
      <Dialog open={showAnalytics} onOpenChange={setShowAnalytics}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {analyticsAgent && <AgentAnalytics agentId={analyticsAgent.id} agentName={analyticsAgent.name} onClose={handleAnalyticsClose} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
