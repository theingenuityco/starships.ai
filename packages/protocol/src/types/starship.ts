// Starship-related types for API requests and responses

export interface UpdateStarshipRequest {
  name?: string;
  slug?: string; // Optional - will be auto-generated from name if not provided
  status?: 'active' | 'inactive';
  class?: 'scout' | 'cruiser' | 'draught';
}

export interface UpdateStarshipStatusRequest {
  status: 'active' | 'inactive';
}

export interface StarshipResponse {
  starship: {
    id: string;
    slug: string;
    ownerId: string;
    class: 'scout' | 'cruiser' | 'draught';
    name: string;
    maxAgents: number;
    status: 'active' | 'inactive' | 'restricted' | 'disabled' | 'pending_payment';
    createdAt: string;
    updatedAt: string;
    plan?: 'scout' | 'cruiser' | 'draught';
    subscriptionId?: string;
    billingPeriod?: 'monthly' | 'yearly';
  };
}

export interface StarshipAgentsResponse {
  starshipId: string;
  starshipName: string;
  starshipClass: 'scout' | 'cruiser' | 'draught';
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
    allowedStarshipClasses?: ('scout' | 'cruiser' | 'draught')[];
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
  class: 'scout' | 'cruiser' | 'draught';
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

// Legacy expedition integration types - deprecated
// These interfaces are kept for backward compatibility but should not be used in new code
// TODO: Remove these interfaces after migration is complete