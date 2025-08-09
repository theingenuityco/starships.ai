'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Target,
  Plus,
  Edit,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Filter,
  SortAsc,
  SortDesc,
  Users
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { missionApi } from '@/lib/missionApi';
import { starshipAPI, type Agent } from '@/lib/api';

// Type for deployed agents (excludes starshipId since it's implied by context)
type DeployedAgent = Omit<Agent, 'starshipId'>;
import type { 
  Mission, 
  MissionStatus, 
  CreateMissionRequest, 
  UpdateMissionRequest,
  MissionFilters,
  MissionSort 
} from '@starships/protocol';

interface MissionListProps {
  starshipId?: string;
  showCreateButton?: boolean;
}

const statusIcons: Record<MissionStatus, React.ReactNode> = {
  draft: <Clock className="w-4 h-4" />,
  active: <Play className="w-4 h-4" />,
  completed: <CheckCircle className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
  cancelled: <AlertCircle className="w-4 h-4" />
};

const statusColors: Record<MissionStatus, string> = {
  draft: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
  active: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  completed: 'bg-green-100 text-green-800 hover:bg-green-200',
  failed: 'bg-red-100 text-red-800 hover:bg-red-200',
  cancelled: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
};

export function MissionList({ starshipId, showCreateButton = true }: MissionListProps) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [filters, setFilters] = useState<MissionFilters>({});
  const [sort, setSort] = useState<MissionSort>({ field: 'createdAt', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  // Load missions
  const loadMissions = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = starshipId
        ? await missionApi.getMissionsByStarshipId(starshipId, filters, sort)
        : await missionApi.getAllMissions(filters, sort);

      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        setMissions(response.data.missions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load missions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMissions();
  }, [starshipId, filters, sort]);

  // Filter missions by search term
  const filteredMissions = missions.filter(mission =>
    mission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mission.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Create mission
  const handleCreateMission = async (data: CreateMissionRequest) => {
    const response = await missionApi.createMission(data);
    
    if (response.error) {
      toast({
        title: 'Error',
        description: response.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Mission created successfully',
      });
      setShowCreateModal(false);
      loadMissions();
    }
  };

  // Update mission
  const handleUpdateMission = async (id: string, updates: UpdateMissionRequest) => {
    const response = await missionApi.updateMission(id, updates);
    
    if (response.error) {
      toast({
        title: 'Error',
        description: response.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Mission updated successfully',
      });
      setEditingMission(null);
      loadMissions();
    }
  };

  // Delete mission
  const handleDeleteMission = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mission?')) return;

    const response = await missionApi.deleteMission(id);
    
    if (response.error) {
      toast({
        title: 'Error',
        description: response.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Mission deleted successfully',
      });
      loadMissions();
    }
  };

  // Status transition actions
  const handleStatusChange = async (mission: Mission, newStatus: MissionStatus) => {
    await handleUpdateMission(mission.id, { status: newStatus });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-500 mb-2">⚠️ Error</div>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={loadMissions} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Missions
          </h2>
          <p className="text-muted-foreground">
            {filteredMissions.length} mission{filteredMissions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {showCreateButton && starshipId && (
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Mission
              </Button>
            </DialogTrigger>
            <DialogContent>
              <CreateMissionForm
                starshipId={starshipId}
                onSubmit={handleCreateMission}
                onCancel={() => setShowCreateModal(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search missions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Select 
          value={filters.status?.[0] || 'all'} 
          onValueChange={(value) => 
            setFilters({ ...filters, status: value === 'all' ? undefined : [value as MissionStatus] })
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={() => 
            setSort({ 
              ...sort, 
              direction: sort.direction === 'asc' ? 'desc' : 'asc' 
            })
          }
        >
          {sort.direction === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mission List */}
      <AnimatePresence>
        {filteredMissions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center p-8 border-2 border-dashed border-muted rounded-lg"
          >
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No missions found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? 'No missions match your search criteria.' : 'Create your first mission to get started.'}
            </p>
            {showCreateButton && starshipId && !searchTerm && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Mission
              </Button>
            )}
          </motion.div>
        ) : (
          <div className="grid gap-4">
            {filteredMissions.map((mission) => (
              <motion.div
                key={mission.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <MissionCard
                  mission={mission}
                  onEdit={setEditingMission}
                  onDelete={handleDeleteMission}
                  onStatusChange={handleStatusChange}
                />
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Edit Mission Modal */}
      <Dialog open={!!editingMission} onOpenChange={() => setEditingMission(null)}>
        <DialogContent>
          {editingMission && (
            <EditMissionForm
              mission={editingMission}
              onSubmit={(updates) => handleUpdateMission(editingMission.id, updates)}
              onCancel={() => setEditingMission(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Mission Card Component
function MissionCard({ 
  mission, 
  onEdit, 
  onDelete, 
  onStatusChange 
}: {
  mission: Mission;
  onEdit: (mission: Mission) => void;
  onDelete: (id: string) => void;
  onStatusChange: (mission: Mission, status: MissionStatus) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {statusIcons[mission.status]}
              {mission.name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={statusColors[mission.status]}>
                {mission.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Created {new Date(mission.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(mission)}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(mission.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4">{mission.description}</p>
        
        {/* Assigned Agents */}
        {mission.agentIds && mission.agentIds.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
              <Users className="w-3 h-3" />
              <span>{mission.agentIds.length} agent{mission.agentIds.length !== 1 ? 's' : ''} assigned</span>
            </div>
          </div>
        )}
        
        {/* Status Actions */}
        <div className="flex gap-2 flex-wrap">
          {mission.status === 'draft' && (
            <Button
              size="sm"
              onClick={() => onStatusChange(mission, 'active')}
            >
              <Play className="w-3 h-3 mr-1" />
              Start
            </Button>
          )}
          
          {mission.status === 'active' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStatusChange(mission, 'completed')}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Complete
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStatusChange(mission, 'failed')}
              >
                <XCircle className="w-3 h-3 mr-1" />
                Fail
              </Button>
            </>
          )}
          
          {mission.status !== 'completed' && mission.status !== 'cancelled' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange(mission, 'cancelled')}
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Create Mission Form Component
function CreateMissionForm({ 
  starshipId, 
  onSubmit, 
  onCancel 
}: {
  starshipId: string;
  onSubmit: (data: CreateMissionRequest) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<CreateMissionRequest>({
    starshipId,
    name: '',
    description: '',
    agentIds: []
  });
  const [agents, setAgents] = useState<DeployedAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  // Load agents for this starship
  useEffect(() => {
    const loadAgents = async () => {
      try {
        setLoadingAgents(true);
        setAgentsError(null);
        const response = await starshipAPI.getStarshipAgents(starshipId);
        setAgents(response.deployedAgents || []);
      } catch (error) {
        setAgentsError(error instanceof Error ? error.message : 'Failed to load agents');
      } finally {
        setLoadingAgents(false);
      }
    };

    loadAgents();
  }, [starshipId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim() && formData.description.trim() && formData.agentIds.length > 0) {
      onSubmit(formData);
    }
  };

  const handleAgentToggle = (agentId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      agentIds: checked 
        ? [...prev.agentIds, agentId]
        : prev.agentIds.filter(id => id !== agentId)
    }));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create New Mission</DialogTitle>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Mission Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Enter mission name"
            required
          />
        </div>
        
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe the mission objectives and details"
            rows={3}
            required
          />
        </div>

        {/* Agent Selection */}
        <div>
          <Label className="text-base font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Assign Agents
          </Label>
          <p className="text-sm text-muted-foreground mb-3">
            Select at least one agent to assign to this mission
          </p>
          
          {loadingAgents ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
              <span className="ml-2 text-sm text-muted-foreground">Loading agents...</span>
            </div>
          ) : agentsError ? (
            <div className="text-sm text-red-500 py-2">{agentsError}</div>
          ) : agents.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              No agents available. Deploy agents to your starship first.
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-3">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`agent-${agent.id}`}
                    checked={formData.agentIds.includes(agent.id)}
                    onCheckedChange={(checked) => 
                      handleAgentToggle(agent.id, checked as boolean)
                    }
                  />
                  <label 
                    htmlFor={`agent-${agent.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                  >
                    <div className="flex items-center justify-between">
                      <span>{agent.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {agent.category}
                      </Badge>
                    </div>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {agent.description}
                      </p>
                    )}
                  </label>
                </div>
              ))}
            </div>
          )}
          
          {formData.agentIds.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {formData.agentIds.length} agent{formData.agentIds.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={!formData.name.trim() || !formData.description.trim() || formData.agentIds.length === 0}
          >
            Create Mission
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// Edit Mission Form Component
function EditMissionForm({ 
  mission, 
  onSubmit, 
  onCancel 
}: {
  mission: Mission;
  onSubmit: (updates: UpdateMissionRequest) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<UpdateMissionRequest>({
    name: mission.name,
    description: mission.description,
    status: mission.status,
    agentIds: mission.agentIds
  });
  const [agents, setAgents] = useState<DeployedAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  // Load agents for this starship
  useEffect(() => {
    const loadAgents = async () => {
      try {
        setLoadingAgents(true);
        setAgentsError(null);
        const response = await starshipAPI.getStarshipAgents(mission.starshipId);
        setAgents(response.deployedAgents || []);
      } catch (error) {
        setAgentsError(error instanceof Error ? error.message : 'Failed to load agents');
      } finally {
        setLoadingAgents(false);
      }
    };

    loadAgents();
  }, [mission.starshipId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleAgentToggle = (agentId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      agentIds: checked 
        ? [...(prev.agentIds || []), agentId]
        : (prev.agentIds || []).filter(id => id !== agentId)
    }));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Mission</DialogTitle>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="edit-name">Mission Name</Label>
          <Input
            id="edit-name"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Enter mission name"
          />
        </div>
        
        <div>
          <Label htmlFor="edit-description">Description</Label>
          <Textarea
            id="edit-description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe the mission objectives and details"
            rows={3}
          />
        </div>

        {/* Agent Selection */}
        <div>
          <Label className="text-base font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Assigned Agents
          </Label>
          
          {loadingAgents ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
              <span className="ml-2 text-sm text-muted-foreground">Loading agents...</span>
            </div>
          ) : agentsError ? (
            <div className="text-sm text-red-500 py-2">{agentsError}</div>
          ) : agents.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              No agents available.
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-3">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`edit-agent-${agent.id}`}
                    checked={(formData.agentIds || []).includes(agent.id)}
                    onCheckedChange={(checked) => 
                      handleAgentToggle(agent.id, checked as boolean)
                    }
                  />
                  <label 
                    htmlFor={`edit-agent-${agent.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                  >
                    <div className="flex items-center justify-between">
                      <span>{agent.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {agent.category}
                      </Badge>
                    </div>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {agent.description}
                      </p>
                    )}
                  </label>
                </div>
              ))}
            </div>
          )}
          
          {(formData.agentIds || []).length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {(formData.agentIds || []).length} agent{(formData.agentIds || []).length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
        
        <div>
          <Label htmlFor="edit-status">Status</Label>
          <Select 
            value={formData.status} 
            onValueChange={(value: MissionStatus) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Update Mission</Button>
        </DialogFooter>
      </form>
    </>
  );
}