'use client'

import { useState, useEffect } from 'react'
import { Agent, agentAPI } from '@/lib/api'
import { AgentCard } from './AgentCard'
import { AgentForm } from './AgentForm'
import { AgentFilters } from './AgentFilters'
import { AgentTester } from './AgentTester'
import { AgentAnalytics } from './AgentAnalytics'
import { AgentTemplateSelector } from './AgentTemplateSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Plus, Search, Sparkles, Bot } from 'lucide-react'
import { AGENT_TEXT, ERROR_TEXT, LOADING_TEXT } from '@/constants/text'

interface AgentSelectorProps {
  selectedAgent: Agent | null
  onAgentSelect: (agent: Agent) => void
  showCreateButton?: boolean
  showFilters?: boolean
}

interface FilterState {
  category?: Agent['category']
  tags: string[]
  isPublic?: boolean
  searchQuery: string
}

export function AgentSelector({
  selectedAgent,
  onAgentSelect,
  showCreateButton = true,
  showFilters = true,
}: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  // Test state
  const [showTester, setShowTester] = useState(false)
  const [testingAgent, setTestingAgent] = useState<Agent | null>(null)

  // Analytics state
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [analyticsAgent, setAnalyticsAgent] = useState<Agent | null>(null)

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    tags: [],
    searchQuery: '',
  })

  useEffect(() => {
    fetchAgents()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [agents, filters])

  // Shared function to handle agent creation from template
  const handleCreateFromTemplate = async (templateId: string, agentName: string) => {
    try {
      setLoading(true) // Prevent multiple submissions
      // Use the real API to create agent from template
      const { templateAPI } = await import('@/lib/api')
      const newAgent = await templateAPI.createAgentFromTemplate(templateId, agentName)

      // Refresh the agents list
      await fetchAgents()

      // Select the newly created agent
      onAgentSelect(newAgent)
    } catch (error) {
      console.error('Failed to create agent from template:', error)
      setError('Failed to create agent from template')
    } finally {
      setLoading(false)
    }
  }

  const fetchAgents = async () => {
    try {
      setLoading(true)
      const fetchedAgents = await agentAPI.getAll()
      setAgents(fetchedAgents)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch agents:', err)
      setError(ERROR_TEXT.FAILED_TO_LOAD_AGENTS)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...agents]

    // Category filter
    if (filters.category) {
      filtered = filtered.filter(agent => agent.category === filters.category)
    }

    // Tags filter
    if (filters.tags.length > 0) {
      filtered = filtered.filter(agent => filters.tags.some(tag => agent.tags?.includes(tag)))
    }

    // Public/Private filter
    if (filters.isPublic !== undefined) {
      filtered = filtered.filter(agent => agent.isPublic === filters.isPublic)
    }

    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(
        agent =>
          agent.name.toLowerCase().includes(query) ||
          agent.description?.toLowerCase().includes(query) ||
          agent.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    setFilteredAgents(filtered)
  }

  const handleCreateAgent = () => {
    setEditingAgent(null)
    setShowForm(true)
  }

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent)
    setShowForm(true)
  }

  const handleDeleteAgent = async (agent: Agent) => {
    if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      return
    }

    try {
      await agentAPI.delete(agent.id)
      await fetchAgents() // Refresh the list

      // If the deleted agent was selected, clear selection
      if (selectedAgent?.id === agent.id) {
        onAgentSelect(null as any) // Clear selection
      }
    } catch (error) {
      console.error('Failed to delete agent:', error)
      setError('Failed to delete agent')
    }
  }

  const handleFormSave = async (savedAgent: Agent) => {
    setShowForm(false)
    setEditingAgent(null)
    await fetchAgents() // Refresh the list

    // If this was the selected agent, update the selection
    if (selectedAgent?.id === savedAgent.id) {
      onAgentSelect(savedAgent)
    }
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingAgent(null)
  }

  const handleTestAgent = (agent: Agent) => {
    setTestingAgent(agent)
    setShowTester(true)
  }

  const handleTestClose = () => {
    setShowTester(false)
    setTestingAgent(null)
  }

  const handleAnalyticsAgent = (agent: Agent) => {
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
            <svg
              className="w-6 h-6 text-destructive"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5l-6.928-12c-.77-.833-2.694-.833-3.464 0l-6.928 12c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-sm text-destructive">{error}</p>
          <Button onClick={fetchAgents} className="mt-2" size="sm">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header with better visual hierarchy */}
      <div className="p-4 bg-gradient-to-r from-blue-500/5 to-blue-500/10 border border-blue-500/20 rounded-lg space-y-4">
        <div className="flex items-center gap-4">
          <span className="bg-blue-500/20 p-3 rounded-lg shadow-sm flex-shrink-0">
            <Bot className="h-6 w-6 text-blue-500" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-foreground">{AGENT_TEXT.SECTION_TITLE}</h3>
            <p className="text-sm text-muted-foreground">Manage your starship's AI crew members</p>
          </div>
        </div>
        {showCreateButton && (
          <div className="flex items-center gap-2 justify-end">
            <AgentTemplateSelector
              onSelectTemplate={template => {
                // Handle template selection if needed
                console.log('Template selected:', template)
              }}
              onCreateFromTemplate={handleCreateFromTemplate}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 whitespace-nowrap border-blue-500/30 hover:border-blue-500/50"
                >
                  <Sparkles className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>From Template</span>
                </Button>
              }
            />
            <Button
              onClick={handleCreateAgent}
              size="sm"
              className="h-9 whitespace-nowrap bg-blue-500 hover:bg-blue-600"
            >
              <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>Create Agent</span>
            </Button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="space-y-4">
          {/* Enhanced Search Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px bg-gradient-to-r from-blue-500/50 to-transparent flex-1"></div>
              <h4 className="text-sm font-semibold text-blue-500 uppercase tracking-wide">
                Search & Filter
              </h4>
              <div className="h-px bg-gradient-to-l from-blue-500/50 to-transparent flex-1"></div>
            </div>

            <div className="relative">
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10">
                <Search className="w-4 h-4" />
              </div>
              <Input
                placeholder="Search agents..."
                value={filters.searchQuery}
                onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                className="pl-12 pr-4 h-12 bg-gradient-to-r from-card to-muted/30 border-2 border-dashed border-blue-500/30 hover:border-blue-500/50 transition-all duration-200 shadow-sm hover:shadow-md"
              />
            </div>

            {/* Filters */}
            <AgentFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableTags={Array.from(new Set(agents.flatMap(agent => agent.tags || [])))}
            />
          </div>
        </div>
      )}

      {filteredAgents.length === 0 ? (
        <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
          <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <p className="text-base text-muted-foreground mb-3">
            {filters.searchQuery || filters.category || filters.tags.length > 0
              ? 'No agents match your filters'
              : AGENT_TEXT.NO_AGENTS_AVAILABLE}
          </p>
          {showCreateButton && (
            <div className="flex flex-col gap-3 justify-center max-w-xs mx-auto">
              <AgentTemplateSelector
                onSelectTemplate={template => {
                  console.log('Template selected:', template)
                }}
                onCreateFromTemplate={handleCreateFromTemplate}
                trigger={
                  <Button size="sm" variant="outline" className="h-10 w-full">
                    <Sparkles className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">From Template</span>
                  </Button>
                }
              />
              <Button
                onClick={handleCreateAgent}
                size="sm"
                variant="outline"
                className="h-10 w-full"
              >
                <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="whitespace-nowrap">Create Your First Agent</span>
              </Button>
            </div>
          )}
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
          <AgentForm
            agent={editingAgent || undefined}
            onSave={handleFormSave}
            onCancel={handleFormCancel}
          />
        </DialogContent>
      </Dialog>

      {/* Agent Tester Dialog */}
      <Dialog open={showTester} onOpenChange={setShowTester}>
        <DialogContent className="max-w-7xl max-h-[95vh] p-0">
          {testingAgent && <AgentTester agent={testingAgent} onClose={handleTestClose} />}
        </DialogContent>
      </Dialog>

      {/* Agent Analytics Dialog */}
      <Dialog open={showAnalytics} onOpenChange={setShowAnalytics}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {analyticsAgent && (
            <AgentAnalytics
              agentId={analyticsAgent.id}
              agentName={analyticsAgent.name}
              onClose={handleAnalyticsClose}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
