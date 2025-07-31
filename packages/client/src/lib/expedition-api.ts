import api from './api';
import type { 
  Expedition, 
  CreateExpeditionRequest, 
  ExpeditionResponse, 
  ExpeditionListResponse 
} from '@starships/protocol';

export const expeditionAPI = {
  // Create a new expedition
  create: async (starshipId: string, data: CreateExpeditionRequest): Promise<ExpeditionResponse> => {
    const response = await api.post(`/api/starships/${starshipId}/expeditions`, data);
    return response.data;
  },

  // List all expeditions for a starship
  list: async (starshipId: string): Promise<ExpeditionListResponse> => {
    const response = await api.get(`/api/starships/${starshipId}/expeditions`);
    return response.data;
  },

  // Get expedition details
  get: async (expeditionId: string): Promise<ExpeditionResponse> => {
    const response = await api.get(`/api/expeditions/${expeditionId}`);
    return response.data;
  },

  // Delete an expedition
  delete: async (expeditionId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/expeditions/${expeditionId}`);
    return response.data;
  },
};