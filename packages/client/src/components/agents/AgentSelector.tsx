'use client'

import { useState, useEffect } from 'react'
import { Agent, agentAPI } from '@/lib/api'
import { AgentCard } from './AgentCard'
import { AgentForm } from './AgentForm'
import { AgentFilters } from './AgentFilters'
import { AgentTester } from './AgentTester'
import { AgentAnalytics } from './AgentAnalytics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Plus, Search } from 'lucide-react'
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
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{AGENT_TEXT.SECTION_TITLE}</h2>
        {showCreateButton && (
          <Button onClick={handleCreateAgent} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Create Agent
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={filters.searchQuery}
              onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          <AgentFilters
            filters={filters}
            onFiltersChange={setFilters}
            availableTags={Array.from(new Set(agents.flatMap(agent => agent.tags || [])))}
          />
        </div>
      )}

      {filteredAgents.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-muted-foreground"
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
          <p className="text-sm text-muted-foreground mb-2">
            {filters.searchQuery || filters.category || filters.tags.length > 0
              ? 'No agents match your filters'
              : AGENT_TEXT.NO_AGENTS_AVAILABLE}
          </p>
          {showCreateButton && (
            <Button onClick={handleCreateAgent} size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Agent
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
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
