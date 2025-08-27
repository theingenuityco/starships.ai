'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, UserMinus, UserCheck, Bot, Settings, Star, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStarshipStore } from '@/store/starship-store'
import { agentAPI, starshipAPI, type Agent } from '@/lib/api'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { cn } from '@/lib/utils'


export function CrewManagement() {
  const { activeStarshipId, deployAgent, removeAgent } = useStarshipStore()
  const [agents, setAgents] = useState<Agent[]>([])
  const [deployedAgents, setDeployedAgents] = useState<Agent[]>([])
  const [availableSlots, setAvailableSlots] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deployingAgent, setDeployingAgent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Agent management dialog state
  const [showAgentManager, setShowAgentManager] = useState(false)

  // Load agents and starship data
  useEffect(() => {
    const loadData = async () => {
      if (!activeStarshipId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // Load all agents
        const allAgents = await agentAPI.getAll()
        console.log('CrewManagement: Loaded agents:', allAgents)

        // Check if any agents have the current user as author
        const userInfo = await fetch('/api/auth/me')
          .then(res => res.json())
          .catch(() => null)
        if (userInfo?.id) {
          console.log('CrewManagement: Current user ID:', userInfo.id)
          console.log(
            'CrewManagement: Agents with matching authorId:',
            allAgents.filter(agent => agent.authorId === userInfo.id).map(a => a.id)
          )
        }

        setAgents(allAgents)

        // Load starship details including deployed agents
        const starshipData = await starshipAPI.getStarship(activeStarshipId)
        setDeployedAgents(starshipData.agents)
        setAvailableSlots(starshipData.availableSlots)
      } catch (error) {
        console.error('Failed to load crew data:', error)
        setError(error instanceof Error ? error.message : 'Failed to load crew data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [activeStarshipId])

  const handleDeployAgent = async (agentId: string) => {
    if (!activeStarshipId || availableSlots <= 0) return

    setDeployingAgent(agentId)
    try {
      await deployAgent(agentId)

      // Refresh data
      const starshipData = await starshipAPI.getStarship(activeStarshipId)
      setDeployedAgents(starshipData.agents)
      setAvailableSlots(starshipData.availableSlots)
    } catch (error) {
      console.error('Failed to deploy agent:', error)
      setError('Failed to deploy agent')
    } finally {
      setDeployingAgent(null)
    }
  }

  const handleRemoveAgent = async (agentId: string) => {
    if (!activeStarshipId) return

    setDeployingAgent(agentId)
    try {
      await removeAgent(agentId)

      // Refresh data
      const starshipData = await starshipAPI.getStarship(activeStarshipId)
      setDeployedAgents(starshipData.agents)
      setAvailableSlots(starshipData.availableSlots)
    } catch (error) {
      console.error('Failed to remove agent:', error)
      setError('Failed to remove agent')
    } finally {
      setDeployingAgent(null)
    }
  }

  const getAgentIcon = (agentName: string) => {
    const name = agentName.toLowerCase()
    if (name.includes('science') || name.includes('research')) return '🔬'
    if (name.includes('engineer') || name.includes('tech')) return '⚙️'
    if (name.includes('navigator') || name.includes('pilot')) return '🧭'
    if (name.includes('commander') || name.includes('captain')) return '⭐'
    if (name.includes('medical') || name.includes('doctor')) return '⚕️'
    return '🚀'
  }

  const getModelBadgeColor = (model: string) => {
    const lowerModel = model.toLowerCase()
    if (lowerModel.includes('gpt-4')) return 'bg-green-500/20 text-green-400 border-green-500/30'
    if (lowerModel.includes('gpt-3.5')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    if (lowerModel.includes('claude'))
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  if (!activeStarshipId) {
    return (
      <Card className="p-6 bg-black/20 border-white/10">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-white/40" />
            <p className="text-sm text-white/60">No active starship</p>
            <p className="text-xs text-white/40">Select a starship to manage crew</p>
          </div>
        </div>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="p-6 bg-black/20 border-white/10">
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-t-transparent border-white/20 rounded-full animate-spin" />
        </div>
      </Card>
    )
  }

  const availableAgents = agents.filter(
    agent => !deployedAgents.some(deployed => deployed.id === agent.id)
  )

  return (
    <Card className="p-8 bg-black/20 border-white/10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 p-2 rounded-md">
            <Users className="w-6 h-6 text-blue-400" />
          </div>
          <h3 className="font-semibold text-white text-lg">Crew Management</h3>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-1"
          >
            {deployedAgents.length} deployed
          </Badge>
          <Badge
            variant="outline"
            className="text-xs bg-green-500/20 text-green-400 border-green-500/30 px-3 py-1"
          >
            {availableSlots} slots free
          </Badge>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-red-400 mr-3" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Deployed Agents */}
        {deployedAgents.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white/80 mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-green-400" />
              Active Crew ({deployedAgents.length})
            </h4>
            <div className="space-y-3">
              {deployedAgents.map(agent => (
                <div
                  key={agent.id}
                  className="flex items-center gap-4 p-4 bg-black/30 border border-white/10 rounded-lg hover:bg-black/40 transition-colors overflow-visible"
                >
                  <div className="text-lg">{getAgentIcon(agent.name)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white text-sm">{agent.name}</span>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getModelBadgeColor(agent.model))}
                      >
                        {agent.model}
                      </Badge>
                      {/* ADD: Category badge */}
                      {agent.category && (
                        <Badge variant="secondary" className="text-xs">
                          {agent.category.charAt(0).toUpperCase() + agent.category.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {/* ADD: Enhanced description */}
                    {agent.description && (
                      <p className="text-xs text-white/60 truncate mb-1">{agent.description}</p>
                    )}
                    {/* ADD: Tags display */}
                    {agent.tags && agent.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {agent.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs bg-white/10 px-1 rounded">
                            {tag.charAt(0).toUpperCase() + tag.slice(1)}
                          </span>
                        ))}
                        {agent.tags.length > 2 && (
                          <span className="text-xs text-white/40">+{agent.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                    {/* ADD: Usage stats */}
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      {agent.usageCount !== undefined && <span>{agent.usageCount} uses</span>}
                      {agent.version && <span>v{agent.version}</span>}
                      {agent.rating && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500 fill-current" />
                          <span>{agent.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveAgent(agent.id)}
                    disabled={deployingAgent === agent.id}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    {deployingAgent === agent.id ? (
                      <div className="w-4 h-4 border-2 border-t-transparent border-current rounded-full animate-spin" />
                    ) : (
                      <UserMinus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Agents */}
        {availableAgents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-400" />
                Available Agents ({availableAgents.length})
              </h4>
              <Button
                onClick={() => setShowAgentManager(true)}
                size="sm"
                variant="outline"
                className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-9"
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Agents
              </Button>
            </div>
            <div className="space-y-3">
              {availableAgents.map(agent => (
                <div
                  key={agent.id}
                  className="flex items-center gap-4 p-4 bg-black/20 border border-white/5 rounded-lg hover:bg-black/25 transition-colors overflow-visible"
                >
                  <div className="text-lg opacity-60">{getAgentIcon(agent.name)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white/80 text-sm">{agent.name}</span>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getModelBadgeColor(agent.model))}
                      >
                        {agent.model}
                      </Badge>
                      {/* ADD: Category badge */}
                      {agent.category && (
                        <Badge variant="secondary" className="text-xs opacity-80">
                          {agent.category.charAt(0).toUpperCase() + agent.category.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {/* ADD: Enhanced description */}
                    {agent.description && (
                      <p className="text-xs text-white/50 truncate mb-1">{agent.description}</p>
                    )}
                    {/* ADD: Tags display */}
                    {agent.tags && agent.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {agent.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs bg-white/5 px-1 rounded opacity-80">
                            {tag.charAt(0).toUpperCase() + tag.slice(1)}
                          </span>
                        ))}
                        {agent.tags.length > 2 && (
                          <span className="text-xs text-white/30">+{agent.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                    {/* ADD: Usage stats */}
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      {agent.usageCount !== undefined && <span>{agent.usageCount} uses</span>}
                      {agent.version && <span>v{agent.version}</span>}
                      {agent.rating && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500 fill-current" />
                          <span>{agent.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeployAgent(agent.id)}
                    disabled={deployingAgent === agent.id || availableSlots <= 0}
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  >
                    {deployingAgent === agent.id ? (
                      <div className="w-4 h-4 border-2 border-t-transparent border-current rounded-full animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty States */}
        {deployedAgents.length === 0 && availableAgents.length === 0 && (
          <div className="text-center py-12 bg-black/10 rounded-lg border border-white/5">
            <Users className="w-16 h-16 mx-auto mb-4 text-white/20" />
            <p className="text-base text-white/60 mb-2">No agents available</p>
            <p className="text-sm text-white/40 max-w-md mx-auto">
              Create agents to deploy to your starship and enhance your mission capabilities
            </p>
          </div>
        )}

        {deployedAgents.length === 0 && availableAgents.length > 0 && (
          <div className="text-center py-6 border border-dashed border-white/10 rounded-lg bg-black/10">
            <UserCheck className="w-12 h-12 mx-auto mb-3 text-white/20" />
            <p className="text-base text-white/60 mb-2">No crew deployed</p>
            <p className="text-sm text-white/40 max-w-md mx-auto">
              Deploy agents from the available list above to enhance your starship&apos;s capabilities
            </p>
          </div>
        )}
      </div>

      {/* Agent Management Dialog */}
      <Dialog open={showAgentManager} onOpenChange={setShowAgentManager}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Agent Management</DialogTitle>
          </DialogHeader>
          <AgentSelector
            selectedAgent={null}
            onAgentSelect={agent => {
              // Optionally auto-deploy selected agent if slots available
              if (availableSlots > 0) {
                handleDeployAgent(agent.id)
              }
              setShowAgentManager(false)
            }}
            showCreateButton={true}
            showFilters={true}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
