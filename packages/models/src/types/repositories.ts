import { Agent, LLM, User, Starship, Vision, AgentTemplate } from './entities';
import {
  MissionMessage,
  WorkflowNode,
  WorkflowEdge,
  Mission,
  MissionStatus,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  MissionListResponse,
  MissionWorkflow,
  CreateWorkflowRequest,
  UpdateWorkflowApprovalRequest,
  WorkflowRuntimeState,
  WorkflowExecutionStatus,
  WorkflowNodeResult,
  MissionClarity,
  CreateMissionClarityRequest,
  UpdateMissionClarityRequest
} from '@starships/protocol';

// Repository interfaces
export interface Repository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface AgentRepository extends Repository<Agent> {
  findByUser(userId: string): Promise<Agent[]>;
  findByStarship(starshipId: string): Promise<Agent[]>;

  // NEW: starshipId FK-based query methods
  findByStarshipId(starshipId: string): Promise<Agent[]>;
  updateStarshipId(agentId: string, starshipId: string): Promise<void>;
  findUndeployedAgents(): Promise<Agent[]>;

  // ADD: Enhanced query methods
  findByAuthor(authorId: string): Promise<Agent[]>;
  findByCategory(category: string): Promise<Agent[]>;
  findByTags(tags: string[]): Promise<Agent[]>;
  findPublic(limit?: number, offset?: number): Promise<Agent[]>;
  searchAgents(query: string): Promise<Agent[]>;

  // ADD: Marketplace features
  incrementUsageCount(id: string): Promise<void>;
  updateRating(id: string, rating: number): Promise<void>;

  // ADD: Advanced filtering
  findWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: 'scout' | 'cruiser';
  }): Promise<Agent[]>;
}

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByKindeId(kindeId: string): Promise<User | null>;
}

export interface LLMRepository extends Repository<LLM> {
  findByProvider(provider: string): Promise<LLM[]>;
}

// NEW: Aether Core Repository Interfaces
export interface StarshipRepository extends Repository<Starship> {
  findBySlug(slug: string, ownerId: string): Promise<Starship | null>;
  create(
    entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & {
      slug?: string;
    }
  ): Promise<Starship>;
  findByOwner(ownerId: string): Promise<Starship[]>;
  getDeployedAgents(starshipId: string): Promise<Agent[]>;
  deployAgent(starshipId: string, agentId: string): Promise<boolean>;
  removeAgent(starshipId: string, agentId: string): Promise<boolean>;
  getAvailableSlots(starshipId: string): Promise<number>;
  generateUniqueSlug(name: string, ownerId: string): Promise<string>;
  isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean>;
  createSlugFromName(name: string): string;
}

export interface VisionRepository extends Repository<Vision> {
  create(entity: Omit<Vision, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vision>;
  findByStarship(starshipId: string): Promise<Vision | null>;
  updateStatement(starshipId: string, statement: string): Promise<Vision | null>;
  getVisionByStarshipId(starshipId: string): Promise<{ vision: string } | null>;
  updateVision(starshipId: string, newVision: string): Promise<Vision | null>;
}

export interface AgentTemplateRepository extends Repository<AgentTemplate> {
  findByAuthor(authorId: string): Promise<AgentTemplate[]>;
  findByCategory(category: string): Promise<AgentTemplate[]>;
  findByTags(tags: string[]): Promise<AgentTemplate[]>;
  findPublic(limit?: number, offset?: number): Promise<AgentTemplate[]>;
  searchTemplates(query: string): Promise<AgentTemplate[]>;
  incrementUsageCount(id: string): Promise<void>;
  updateRating(id: string, rating: number): Promise<void>;

  // Create agent from template
  createAgentFromTemplate(
    templateId: string,
    agentName: string,
    authorId: string,
    starshipId: string
  ): Promise<Agent>;

  // Create template from public agent
  createTemplateFromAgent(agentId: string): Promise<AgentTemplate | null>;
}

export interface MissionMessageRepository {
  saveMessage(message: Omit<MissionMessage, 'id'>): Promise<MissionMessage>;
  getMessagesByMission(missionId: string, limit?: number, offset?: number): Promise<MissionMessage[]>;
  getMessageCount(missionId: string): Promise<number>;
  getMessagesByMissionWithPagination(missionId: string, page?: number, pageSize?: number): Promise<{
    messages: MissionMessage[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;
  deleteMessagesByMission(missionId: string): Promise<void>;
  deleteMessage(messageId: string): Promise<boolean>;
  findMessageById(messageId: string): Promise<MissionMessage | null>;
}

export interface WorkflowNodeRepository {
  createNode(workflowId: string, nodeData: Omit<WorkflowNode, 'id'>): Promise<WorkflowNode>;
  createNodes(workflowId: string, nodesData: Array<Omit<WorkflowNode, 'id'> & { aiId?: string }>): Promise<{ nodes: WorkflowNode[]; idMapping: Map<string, string> }>;
  getNodesByWorkflowId(workflowId: string): Promise<WorkflowNode[]>;
  getNodeById(nodeId: string): Promise<WorkflowNode | null>;
  updateNode(nodeId: string, updates: Partial<WorkflowNode>): Promise<WorkflowNode | null>;
  deleteNode(nodeId: string): Promise<boolean>;
  deleteNodesByWorkflowId(workflowId: string): Promise<void>;
}

export interface WorkflowEdgeRepository {
  createEdge(workflowId: string, edgeData: Omit<WorkflowEdge, 'id'>): Promise<WorkflowEdge>;
  createEdges(workflowId: string, edgesData: Array<Omit<WorkflowEdge, 'id'>>, idMapping?: Map<string, string>): Promise<WorkflowEdge[]>;
  getEdgesByWorkflowId(workflowId: string): Promise<WorkflowEdge[]>;
  getEdgeById(edgeId: string): Promise<WorkflowEdge | null>;
  updateEdge(edgeId: string, updates: Partial<WorkflowEdge>): Promise<WorkflowEdge | null>;
  deleteEdge(edgeId: string): Promise<boolean>;
  deleteEdgesByWorkflowId(workflowId: string): Promise<void>;
  getEdgesByFromNode(fromNodeId: string): Promise<WorkflowEdge[]>;
  getEdgesByToNode(toNodeId: string): Promise<WorkflowEdge[]>;
}

// Missing Repository Interfaces
export interface MissionRepository {
  createMission(request: CreateMissionRequest, userId: string): Promise<Mission>;
  getMissionById(id: string): Promise<Mission>;
  getMissionsByStarshipId(starshipId: string, filters?: MissionFilters, sort?: MissionSort): Promise<MissionListResponse>;
  getAllMissions(filters?: MissionFilters, sort?: MissionSort): Promise<MissionListResponse>;
  updateMission(id: string, updates: UpdateMissionRequest): Promise<Mission>;
  deleteMission(id: string): Promise<void>;
}

export interface WorkflowRepository {
  createWorkflow(request: CreateWorkflowRequest): Promise<MissionWorkflow>;
  getWorkflowByMissionId(missionId: string): Promise<MissionWorkflow | null>;
  updateApprovalStatus(workflowId: string, updates: UpdateWorkflowApprovalRequest): Promise<MissionWorkflow>;
  deleteWorkflow(workflowId: string): Promise<void>;
}

export interface WorkflowRuntimeStateRepository {
  create(runtimeState: Omit<WorkflowRuntimeState, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkflowRuntimeState>;
  findById(id: string): Promise<WorkflowRuntimeState | null>;
  findByWorkflowId(workflowId: string): Promise<WorkflowRuntimeState | null>;
  update(id: string, updates: Partial<WorkflowRuntimeState>): Promise<WorkflowRuntimeState | null>;
  updateStatus(id: string, status: WorkflowExecutionStatus): Promise<boolean>;
  updateNodeResult(id: string, nodeId: string, result: WorkflowNodeResult): Promise<boolean>;
  findByStatus(status: WorkflowExecutionStatus): Promise<WorkflowRuntimeState[]>;
  delete(id: string): Promise<boolean>;
}

export interface MissionClarityRepository {
  upsertByMissionId(missionId: string, request: CreateMissionClarityRequest): Promise<MissionClarity>;
  getByMissionId(missionId: string): Promise<MissionClarity | null>;
  updateByMissionId(missionId: string, request: UpdateMissionClarityRequest): Promise<MissionClarity>;
  deleteByMissionId(missionId: string): Promise<boolean>;
  getAll(): Promise<MissionClarity[]>;
  getByScoreRange(minScore: number, maxScore: number): Promise<MissionClarity[]>;
}

export interface NativeToolApiKeyRepository {
  saveApiKey(starshipId: string, toolName: string, apiKey: string): Promise<void>;
  getApiKey(starshipId: string, toolName: string): Promise<string | null>;
  getAllApiKeys(starshipId: string): Promise<Record<string, string>>;
  deleteApiKey(starshipId: string, toolName: string): Promise<void>;
  hasApiKey(starshipId: string, toolName: string): Promise<boolean>;
}

export interface WaitlistEntry {
  email: string;
  status: 'approved' | 'pending' | 'rejected';
  createdAt: Date;
  addedBy: string;
  notes?: string;
}

export interface WaitlistRepository {
  checkApproval(email: string): Promise<boolean>;
  getByEmail(email: string): Promise<WaitlistEntry | null>;
  addApprovedEmail(email: string, addedBy?: string, notes?: string): Promise<WaitlistEntry>;
  getAllApproved(): Promise<WaitlistEntry[]>;
  getApprovedCount(): Promise<number>;
  initializeSchema(): Promise<void>;
  seedInitialEmails(): Promise<void>;
}