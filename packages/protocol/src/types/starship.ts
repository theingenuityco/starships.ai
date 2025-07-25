// Starship-related types for API requests and responses

export interface UpdateStarshipRequest {
  name?: string;
  slug?: string; // Optional - will be auto-generated from name if not provided
  status?: 'active' | 'inactive';
  class?: 'scout' | 'cruiser';
  maxActiveExpeditions?: number;
}

export interface UpdateStarshipStatusRequest {
  status: 'active' | 'inactive';
}

export interface StarshipResponse {
  starship: {
    id: string;
    slug: string;
    ownerId: string;
    class: 'scout' | 'cruiser';
    name: string;
    maxActiveExpeditions: number;
    maxAgents: number;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
  };
}

export interface StarshipAgentsResponse {
  starshipId: string;
  starshipName: string;
  starshipClass: 'scout' | 'cruiser';
  maxAgents: number;
  deployedAgents: Array<{
    id: string;
    name: string;
    model: string;
    systemPrompt?: string;
    createdAt: string;
    description?: string;
    tags: string[];
    category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
    authorId: string;
    isPublic: boolean;
    version: string;
    updatedAt: string;
    usageCount: number;
    rating?: number;
    temperature?: number;
    maxTokens?: number;
    customInstructions?: string;
    allowedStarshipClasses?: ('scout' | 'cruiser')[];
    requiredPermissions?: string[];
  }>;
  availableSlots: number;
  deployedCount: number;
}

export interface StarshipListResponse {
  starships: StarshipResponse['starship'][];
}

export interface StarshipDetailsResponse extends StarshipResponse {
  agents: StarshipAgentsResponse['deployedAgents'];
  availableSlots: number;
}

export interface CreateStarshipRequest {
  name: string;
  class: 'scout' | 'cruiser';
  slug?: string; // Optional - will be auto-generated if not provided
}

export interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface ApiError {
  error: string;
  code?: number;
  details?: any;
}

// ============================================================================
// EXPEDITION INTEGRATION TYPES
// ============================================================================

/**
 * Extended starship response with expedition summary
 */
export interface StarshipWithExpeditionsResponse extends StarshipResponse {
  expeditionSummary: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    successRate: number;
    averageDuration: number; // in minutes
    recentExpeditions: Array<{
      id: string;
      title: string;
      status: 'draft' | 'planning' | 'in-progress' | 'review' | 'completed' | 'failed' | 'cancelled';
      priority: 'low' | 'medium' | 'high' | 'urgent';
      createdAt: string;
      updatedAt: string;
    }>;
  };
}

/**
 * Starship expedition capacity and limits
 */
export interface StarshipExpeditionCapacity {
  starshipId: string;
  starshipClass: 'scout' | 'cruiser';
  maxConcurrentExpeditions: number; // Based on class: Scout=2, Cruiser=5
  currentActiveExpeditions: number;
  availableExpeditionSlots: number;
  maxAgentsPerExpedition: number; // Based on class: Scout=2, Cruiser=4
  totalDeployedAgents: number;
  availableAgents: number;
  expeditionLimits: {
    maxTasksPerExpedition: number; // Scout=10, Cruiser=25
    maxDurationHours: number; // Scout=24, Cruiser=168 (1 week)
    allowedPriorities: ('low' | 'medium' | 'high' | 'urgent')[];
  };
}

/**
 * Starship agent availability for expeditions
 */
export interface StarshipAgentAvailability {
  agentId: string;
  agentName: string;
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  tags: string[];
  availability: 'available' | 'busy' | 'offline';
  currentExpeditions: string[]; // Expedition IDs
  completedTasks: number;
  averageTaskDuration: number; // in minutes
  successRate: number; // percentage
  specializations: string[];
  workload: 'light' | 'moderate' | 'heavy';
}

/**
 * Request to update starship expedition settings
 */
export interface UpdateStarshipExpeditionSettingsRequest {
  maxConcurrentExpeditions?: number;
  expeditionNotifications?: boolean;
  autoAssignAgents?: boolean;
  expeditionTimeoutHours?: number;
}

/**
 * Starship expedition statistics
 */
export interface StarshipExpeditionStats {
  starshipId: string;
  timeRange: {
    start: string;
    end: string;
  };
  expeditions: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    averageDuration: number;
    successRate: number;
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    averageDuration: number;
    successRate: number;
  };
  agents: {
    mostActive: Array<{
      agentId: string;
      agentName: string;
      tasksCompleted: number;
      averageQuality: number;
    }>;
    topPerformers: Array<{
      agentId: string;
      agentName: string;
      successRate: number;
      averageQuality: number;
    }>;
  };
  categories: {
    mostCommon: string[];
    successRateByCategory: Record<string, number>;
  };
}