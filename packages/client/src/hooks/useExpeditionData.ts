import { useState, useEffect, useCallback } from 'react';
import { expeditionAPI } from '@/lib/expeditionApi';
import type {
  Expedition,
  ExpeditionTask,
  ExpeditionMessage,
  ExpeditionResult,
  ExpeditionListResponse,
  ExpeditionResponse,
  ExpeditionStatsResponse,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions
} from '@starships/protocol';

interface UseExpeditionDataProps {
  starshipId?: string;
  expeditionId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseExpeditionDataReturn {
  // Expedition list data
  expeditions: Expedition[];
  expeditionsLoading: boolean;
  expeditionsError: string | null;
  totalExpeditions: number;
  currentPage: number;
  
  // Single expedition data
  expedition: Expedition | null;
  expeditionLoading: boolean;
  expeditionError: string | null;
  
  // Related data
  tasks: ExpeditionTask[];
  messages: ExpeditionMessage[];
  results: ExpeditionResult[];
  stats: ExpeditionStatsResponse | null;
  
  // Actions
  refreshExpeditions: () => Promise<void>;
  refreshExpedition: () => Promise<void>;
  loadExpeditions: (filters?: ExpeditionFilters, sort?: ExpeditionSort, pagination?: PaginationOptions) => Promise<void>;
  loadExpedition: (expeditionId: string) => Promise<void>;
  loadMessages: (expeditionId: string) => Promise<void>;
  loadTasks: (expeditionId: string) => Promise<void>;
  loadResults: (expeditionId: string) => Promise<void>;
  loadStats: (starshipId: string) => Promise<void>;
}

export function useExpeditionData({
  starshipId,
  expeditionId,
  autoRefresh = false,
  refreshInterval = 30000
}: UseExpeditionDataProps = {}): UseExpeditionDataReturn {
  // Expedition list state
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [expeditionsLoading, setExpeditionsLoading] = useState(false);
  const [expeditionsError, setExpeditionsError] = useState<string | null>(null);
  const [totalExpeditions, setTotalExpeditions] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Single expedition state
  const [expedition, setExpedition] = useState<Expedition | null>(null);
  const [expeditionLoading, setExpeditionLoading] = useState(false);
  const [expeditionError, setExpeditionError] = useState<string | null>(null);

  // Related data state
  const [tasks, setTasks] = useState<ExpeditionTask[]>([]);
  const [messages, setMessages] = useState<ExpeditionMessage[]>([]);
  const [results, setResults] = useState<ExpeditionResult[]>([]);
  const [stats, setStats] = useState<ExpeditionStatsResponse | null>(null);

  // Load expeditions for a starship
  const loadExpeditions = useCallback(async (
    filters?: ExpeditionFilters,
    sort?: ExpeditionSort,
    pagination?: PaginationOptions
  ) => {
    if (!starshipId) return;

    setExpeditionsLoading(true);
    setExpeditionsError(null);

    try {
      const response = await expeditionAPI.getExpeditionsByStarship(
        starshipId,
        filters,
        sort,
        pagination
      );
      
      setExpeditions(response.expeditions);
      setTotalExpeditions(response.total);
      setCurrentPage(response.page);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load expeditions';
      setExpeditionsError(errorMessage);
      console.error('[EXPEDITION DATA] Failed to load expeditions:', error);
    } finally {
      setExpeditionsLoading(false);
    }
  }, [starshipId]);

  // Load single expedition
  const loadExpedition = useCallback(async (expeditionId: string) => {
    if (!starshipId) return;

    setExpeditionLoading(true);
    setExpeditionError(null);

    try {
      const response = await expeditionAPI.getExpedition(starshipId, expeditionId);
      setExpedition(response.expedition);
      
      // Also load related data if available
      if (response.tasks) setTasks(response.tasks);
      if (response.messages) setMessages(response.messages);
      if (response.results) setResults(response.results);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load expedition';
      setExpeditionError(errorMessage);
      console.error('[EXPEDITION DATA] Failed to load expedition:', error);
    } finally {
      setExpeditionLoading(false);
    }
  }, [starshipId]);

  // Load expedition messages
  const loadMessages = useCallback(async (expeditionId: string) => {
    if (!starshipId) return;

    try {
      const messages = await expeditionAPI.getMessages(starshipId, expeditionId);
      setMessages(messages);
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to load messages:', error);
    }
  }, [starshipId]);

  // Load expedition tasks
  const loadTasks = useCallback(async (expeditionId: string) => {
    if (!starshipId) return;

    try {
      const tasks = await expeditionAPI.getTasks(starshipId, expeditionId);
      setTasks(tasks);
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to load tasks:', error);
    }
  }, [starshipId]);

  // Load expedition results
  const loadResults = useCallback(async (expeditionId: string) => {
    if (!starshipId) return;

    try {
      const results = await expeditionAPI.getResults(starshipId, expeditionId);
      setResults(results);
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to load results:', error);
    }
  }, [starshipId]);

  // Load expedition statistics
  const loadStats = useCallback(async (starshipId: string) => {
    try {
      const stats = await expeditionAPI.getStats(starshipId);
      setStats(stats);
    } catch (error: any) {
      console.error('[EXPEDITION DATA] Failed to load stats:', error);
      
      // If starship not found, set empty stats to prevent continuous retries
      if (error.response?.status === 404 || error.message?.includes('Starship not found')) {
        console.warn('[EXPEDITION DATA] Starship not found, setting empty stats');
        setStats({
          totalExpeditions: 0,
          activeExpeditions: 0,
          completedExpeditions: 0,
          failedExpeditions: 0,
          averageDuration: 0,
          successRate: 0,
          topPerformingAgents: []
        });
      }
    }
  }, []);

  // Refresh functions
  const refreshExpeditions = useCallback(async () => {
    if (starshipId) {
      await loadExpeditions();
    }
  }, [starshipId, loadExpeditions]);

  const refreshExpedition = useCallback(async () => {
    if (expeditionId) {
      await loadExpedition(expeditionId);
    }
  }, [expeditionId, loadExpedition]);

  // Initial data loading
  useEffect(() => {
    if (starshipId) {
      loadExpeditions();
      loadStats(starshipId);
    }
  }, [starshipId, loadExpeditions, loadStats]);

  useEffect(() => {
    if (expeditionId) {
      loadExpedition(expeditionId);
    }
  }, [expeditionId, loadExpedition]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (starshipId) {
        refreshExpeditions();
      }
      if (expeditionId) {
        refreshExpedition();
        loadMessages(expeditionId);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, starshipId, expeditionId, refreshExpeditions, refreshExpedition, loadMessages]);

  return {
    // Expedition list data
    expeditions,
    expeditionsLoading,
    expeditionsError,
    totalExpeditions,
    currentPage,
    
    // Single expedition data
    expedition,
    expeditionLoading,
    expeditionError,
    
    // Related data
    tasks,
    messages,
    results,
    stats,
    
    // Actions
    refreshExpeditions,
    refreshExpedition,
    loadExpeditions,
    loadExpedition,
    loadMessages,
    loadTasks,
    loadResults,
    loadStats
  };
}