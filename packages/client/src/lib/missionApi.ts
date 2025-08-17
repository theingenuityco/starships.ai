/**
 * Mission API Client
 * Frontend API client for mission operations
 */

import type {
  Mission,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  MissionListResponse,
  MissionResponse,
  MissionMessage,
  SendMissionMessageRequest,
  MissionChatResponse,
  MissionClarity,
  MissionPlanResponse
} from '@starships/protocol';
import api from './api';

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/**
 * Make authenticated API request using the main API client
 */
async function apiRequest<T>(
  endpoint: string,
  options: { method?: string; body?: string } = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await api({
      url: endpoint,
      method: options.method || 'GET',
      data: options.body ? JSON.parse(options.body) : undefined,
    });

    // Handle server response format { success: true, data: actualData }
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
      return { data: response.data.data };
    }
    return { data: response.data };
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || error.message || 'Network error';
    return { error: errorMessage };
  }
}

/**
 * Mission API functions
 */
export const missionApi = {
  /**
   * Get all missions
   */
  async getAllMissions(
    filters?: MissionFilters,
    sort?: MissionSort
  ): Promise<ApiResponse<MissionListResponse>> {
    const searchParams = new URLSearchParams();
    
    if (filters?.status && filters.status.length > 0) {
      filters.status.forEach(status => searchParams.append('status', status));
    }
    
    if (filters?.starshipId) {
      searchParams.set('starshipId', filters.starshipId);
    }
    
    if (filters?.createdBy) {
      searchParams.set('createdBy', filters.createdBy);
    }
    
    if (sort?.field) {
      searchParams.set('sortField', sort.field);
    }
    
    if (sort?.direction) {
      searchParams.set('sortDirection', sort.direction);
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/missions${queryString ? `?${queryString}` : ''}`;
    
    return apiRequest<MissionListResponse>(endpoint);
  },

  /**
   * Get mission by ID
   */
  async getMissionById(id: string): Promise<ApiResponse<MissionResponse>> {
    return apiRequest<MissionResponse>(`/api/missions/${id}`);
  },

  /**
   * Get missions for a specific starship
   */
  async getMissionsByStarshipId(
    starshipId: string,
    filters?: MissionFilters,
    sort?: MissionSort
  ): Promise<ApiResponse<MissionListResponse>> {
    const searchParams = new URLSearchParams();
    
    if (filters?.status && filters.status.length > 0) {
      filters.status.forEach(status => searchParams.append('status', status));
    }
    
    if (filters?.createdBy) {
      searchParams.set('createdBy', filters.createdBy);
    }
    
    if (sort?.field) {
      searchParams.set('sortField', sort.field);
    }
    
    if (sort?.direction) {
      searchParams.set('sortDirection', sort.direction);
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/missions/starship/${starshipId}${queryString ? `?${queryString}` : ''}`;
    
    return apiRequest<MissionListResponse>(endpoint);
  },

  /**
   * Create a new mission
   */
  async createMission(request: CreateMissionRequest): Promise<ApiResponse<MissionResponse>> {
    return apiRequest<MissionResponse>('/api/missions', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  },

  /**
   * Update an existing mission
   */
  async updateMission(
    id: string,
    updates: UpdateMissionRequest
  ): Promise<ApiResponse<MissionResponse>> {
    return apiRequest<MissionResponse>(`/api/missions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Delete a mission
   */
  async deleteMission(id: string): Promise<ApiResponse<void>> {
    return apiRequest<void>(`/api/missions/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * Mission status transition helpers
   */
  async startMission(id: string): Promise<ApiResponse<MissionResponse>> {
    return this.updateMission(id, { status: 'active' });
  },

  async completeMission(id: string): Promise<ApiResponse<MissionResponse>> {
    return this.updateMission(id, { status: 'completed' });
  },

  async failMission(id: string): Promise<ApiResponse<MissionResponse>> {
    return this.updateMission(id, { status: 'failed' });
  },

  async cancelMission(id: string): Promise<ApiResponse<MissionResponse>> {
    return this.updateMission(id, { status: 'cancelled' });
  },

  /**
   * Chat functions
   */
  async sendMessage(missionId: string, content: string): Promise<ApiResponse<MissionChatResponse>> {
    return apiRequest<MissionChatResponse>(`/api/missions/${missionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },

  async getMessageHistory(missionId: string): Promise<ApiResponse<{ messages: MissionMessage[] }>> {
    return apiRequest<{ messages: MissionMessage[] }>(`/api/missions/${missionId}/messages`);
  },

  /**
   * Get mission clarity assessment
   */
  async getMissionClarity(missionId: string): Promise<ApiResponse<MissionClarity | null>> {
    return apiRequest<MissionClarity | null>(`/api/missions/${missionId}/clarity`);
  },

  /**
   * Get mission plan details
   */
  async getMissionPlan(missionId: string): Promise<ApiResponse<MissionPlanResponse | null>> {
    return apiRequest<MissionPlanResponse | null>(`/api/missions/${missionId}/plan`);
  },

  /**
   * Approve or reject mission plan
   */
  async approveMissionPlan(missionId: string, approved: boolean, reason?: string): Promise<ApiResponse<{ approved: boolean; message: string }>> {
    return apiRequest<{ approved: boolean; message: string }>(`/api/missions/${missionId}/approve-plan`, {
      method: 'POST',
      body: JSON.stringify({ approved, reason })
    });
  },

  /**
   * Regenerate mission plan
   */
  async regenerateMissionPlan(missionId: string): Promise<ApiResponse<{ message: string }>> {
    return apiRequest<{ message: string }>(`/api/missions/${missionId}/regenerate-plan`, {
      method: 'POST'
    });
  }
};