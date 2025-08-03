import { useState, useEffect, useCallback, useRef } from 'react';
import { expeditionAPI, ExpeditionAPIError, LoadingState, APIOptions } from '@/lib/expeditionApi';
import { expeditionSocketAPI } from '@/lib/expedition-socket-api';
import { useAuth } from '@/hooks/useAuth';
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
  PaginationOptions,
  CreateTaskRequest,
  SendMessageRequest,
  CreateResultRequest
} from '@starships/protocol';

interface UseExpeditionDataProps {
  starshipId?: string;
  expeditionId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableRetry?: boolean;
  maxRetries?: number;
  enableWebSocket?: boolean;
}

interface UseExpeditionDataReturn {
  // Expedition list data
  expeditions: Expedition[];
  expeditionsLoading: boolean;
  expeditionsError: ExpeditionAPIError | null;
  totalExpeditions: number;
  currentPage: number;
  
  // Single expedition data
  expedition: Expedition | null;
  expeditionLoading: boolean;
  expeditionError: ExpeditionAPIError | null;
  
  // Related data
  tasks: ExpeditionTask[];
  tasksLoading: boolean;
  tasksError: ExpeditionAPIError | null;
  messages: ExpeditionMessage[];
  messagesLoading: boolean;
  messagesError: ExpeditionAPIError | null;
  results: ExpeditionResult[];
  resultsLoading: boolean;
  resultsError: ExpeditionAPIError | null;
  stats: ExpeditionStatsResponse | null;
  statsLoading: boolean;
  statsError: ExpeditionAPIError | null;
  
  // Real-time status data
  expeditionStatus: any;
  expeditionProgress: any;
  activeExpeditions: any[];
  
  // Loading states
  loadingStates: {
    expeditions: LoadingState;
    expedition: LoadingState;
    tasks: LoadingState;
    messages: LoadingState;
    results: LoadingState;
    stats: LoadingState;
  };
  
  // Enhanced actions
  refreshExpeditions: () => Promise<void>;
  refreshExpedition: () => Promise<void>;
  loadExpeditions: (filters?: ExpeditionFilters, sort?: ExpeditionSort, pagination?: PaginationOptions, options?: APIOptions) => Promise<void>;
  loadExpedition: (expeditionId: string, options?: APIOptions) => Promise<void>;
  loadMessages: (expeditionId: string, options?: APIOptions) => Promise<void>;
  loadTasks: (expeditionId: string, options?: APIOptions) => Promise<void>;
  loadResults: (expeditionId: string, options?: APIOptions) => Promise<void>;
  loadStats: (starshipId: string, options?: APIOptions) => Promise<void>;
  
  // New enhanced actions
  loadExpeditionStatus: (expeditionId: string) => Promise<void>;
  loadExpeditionProgress: (expeditionId: string) => Promise<void>;
  loadActiveExpeditions: () => Promise<void>;
  loadRecentMessages: (expeditionId: string, limit?: number, offset?: number) => Promise<void>;
  
  // Task management actions
  createTask: (request: CreateTaskRequest) => Promise<ExpeditionTask | null>;
  updateTask: (taskId: string, updates: Partial<ExpeditionTask>) => Promise<ExpeditionTask | null>;
  deleteTask: (taskId: string) => Promise<boolean>;
  assignTask: (taskId: string, agentId: string) => Promise<ExpeditionTask | null>;
  completeTask: (taskId: string, result?: string) => Promise<ExpeditionTask | null>;
  
  // Messaging actions
  sendMessage: (content: string, messageType?: any) => Promise<boolean>;
  
  // Results actions
  createResult: (request: CreateResultRequest) => Promise<ExpeditionResult | null>;
  updateResultQuality: (resultId: string, qualityScore: any) => Promise<ExpeditionResult | null>;
  
  // Expedition control actions
  startExpedition: (expeditionId: string) => Promise<boolean>;
  pauseExpedition: (expeditionId: string) => Promise<boolean>;
  resumeExpedition: (expeditionId: string) => Promise<boolean>;
  cancelExpedition: (expeditionId: string) => Promise<boolean>;
  
  // Utility actions
  clearCache: () => void;
  retryLastOperation: () => Promise<void>;
  isRetryableError: (error: ExpeditionAPIError) => boolean;
}

export function useExpeditionData({
  starshipId,
  expeditionId,
  autoRefresh = false,
  refreshInterval = 30000,
  enableRetry = true,
  maxRetries = 3,
  enableWebSocket = true
}: UseExpeditionDataProps = {}): UseExpeditionDataReturn {
  const { user } = useAuth();
  // Expedition list state
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [expeditionsLoading, setExpeditionsLoading] = useState(false);
  const [expeditionsError, setExpeditionsError] = useState<ExpeditionAPIError | null>(null);
  const [totalExpeditions, setTotalExpeditions] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Single expedition state
  const [expedition, setExpedition] = useState<Expedition | null>(null);
  const [expeditionLoading, setExpeditionLoading] = useState(false);
  const [expeditionError, setExpeditionError] = useState<ExpeditionAPIError | null>(null);

  // Related data state
  const [tasks, setTasks] = useState<ExpeditionTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<ExpeditionAPIError | null>(null);
  
  const [messages, setMessages] = useState<ExpeditionMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<ExpeditionAPIError | null>(null);
  
  const [results, setResults] = useState<ExpeditionResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<ExpeditionAPIError | null>(null);
  
  const [stats, setStats] = useState<ExpeditionStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<ExpeditionAPIError | null>(null);

  // Real-time status state
  const [expeditionStatus, setExpeditionStatus] = useState<any>(null);
  const [expeditionProgress, setExpeditionProgress] = useState<any>(null);
  const [activeExpeditions, setActiveExpeditions] = useState<any[]>([]);

  // Last operation ref for retry functionality
  const lastOperationRef = useRef<(() => Promise<void>) | null>(null);

  // Helper function to handle API errors
  const handleError = useCallback((error: any): ExpeditionAPIError => {
    if (error instanceof ExpeditionAPIError) {
      return error;
    }
    return new ExpeditionAPIError(
      error.message || 'Unknown error occurred',
      'VALIDATION_ERROR',
      500
    );
  }, []);

  // Create loading states
  const loadingStates: UseExpeditionDataReturn['loadingStates'] = {
    expeditions: {
      isLoading: expeditionsLoading,
      error: expeditionsError,
      lastUpdated: expeditionsError ? null : new Date().toISOString()
    },
    expedition: {
      isLoading: expeditionLoading,
      error: expeditionError,
      lastUpdated: expeditionError ? null : new Date().toISOString()
    },
    tasks: {
      isLoading: tasksLoading,
      error: tasksError,
      lastUpdated: tasksError ? null : new Date().toISOString()
    },
    messages: {
      isLoading: messagesLoading,
      error: messagesError,
      lastUpdated: messagesError ? null : new Date().toISOString()
    },
    results: {
      isLoading: resultsLoading,
      error: resultsError,
      lastUpdated: resultsError ? null : new Date().toISOString()
    },
    stats: {
      isLoading: statsLoading,
      error: statsError,
      lastUpdated: statsError ? null : new Date().toISOString()
    }
  };

  // API options configuration (removed retry since we're using direct HTTP calls)
  const getAPIOptions = useCallback((options?: APIOptions): APIOptions => ({
    ...options
  }), []);

  // Load expeditions for a starship
  const loadExpeditions = useCallback(async (
    filters?: ExpeditionFilters,
    sort?: ExpeditionSort,
    pagination?: PaginationOptions,
    options?: APIOptions
  ) => {
    if (!starshipId) return;

    const operation = async () => {
      setExpeditionsLoading(true);
      setExpeditionsError(null);

      try {
        const response = await expeditionAPI.getExpeditionsByStarship(
          starshipId,
          filters,
          sort,
          pagination,
          getAPIOptions(options)
        );
        
        setExpeditions(response.expeditions);
        setTotalExpeditions(response.total);
        setCurrentPage(response.page);
      } catch (error) {
        const apiError = handleError(error);
        setExpeditionsError(apiError);
        console.error('[EXPEDITION DATA] Failed to load expeditions:', apiError);
      } finally {
        setExpeditionsLoading(false);
      }
    };

    lastOperationRef.current = operation;
    await operation();
  }, [starshipId, getAPIOptions, handleError]);

  // Load single expedition
  const loadExpedition = useCallback(async (expeditionId: string, options?: APIOptions) => {
    if (!starshipId) return;

    const operation = async () => {
      setExpeditionLoading(true);
      setExpeditionError(null);

      try {
        const response = await expeditionAPI.getExpedition(starshipId, expeditionId, getAPIOptions(options));
        setExpedition(response.expedition);
        
        // Also load related data if available
        if (response.tasks) setTasks(response.tasks);
        if (response.messages) setMessages(response.messages);
        if (response.results) setResults(response.results);
      } catch (error) {
        const apiError = handleError(error);
        setExpeditionError(apiError);
        console.error('[EXPEDITION DATA] Failed to load expedition:', apiError);
      } finally {
        setExpeditionLoading(false);
      }
    };

    lastOperationRef.current = operation;
    await operation();
  }, [starshipId, getAPIOptions, handleError]);

  // Load expedition messages
  const loadMessages = useCallback(async (expeditionId: string, options?: APIOptions) => {
    if (!starshipId) return;

    const operation = async () => {
      setMessagesLoading(true);
      setMessagesError(null);

      try {
        const messages = await expeditionAPI.getMessages(starshipId, expeditionId, getAPIOptions(options));
        setMessages(messages);
      } catch (error) {
        const apiError = handleError(error);
        setMessagesError(apiError);
        console.error('[EXPEDITION DATA] Failed to load messages:', apiError);
      } finally {
        setMessagesLoading(false);
      }
    };

    lastOperationRef.current = operation;
    await operation();
  }, [starshipId, getAPIOptions, handleError]);

  // Load expedition tasks
  const loadTasks = useCallback(async (expeditionId: string, options?: APIOptions) => {
    if (!starshipId) return;

    const operation = async () => {
      setTasksLoading(true);
      setTasksError(null);

      try {
        const tasks = await expeditionAPI.getTasks(starshipId, expeditionId, getAPIOptions(options));
        setTasks(tasks);
      } catch (error) {
        const apiError = handleError(error);
        setTasksError(apiError);
        console.error('[EXPEDITION DATA] Failed to load tasks:', apiError);
      } finally {
        setTasksLoading(false);
      }
    };

    lastOperationRef.current = operation;
    await operation();
  }, [starshipId, getAPIOptions, handleError]);

  // Load expedition results
  const loadResults = useCallback(async (expeditionId: string, options?: APIOptions) => {
    if (!starshipId) return;

    const operation = async () => {
      setResultsLoading(true);
      setResultsError(null);

      try {
        const results = await expeditionAPI.getResults(starshipId, expeditionId, getAPIOptions(options));
        setResults(results);
      } catch (error) {
        const apiError = handleError(error);
        setResultsError(apiError);
        console.error('[EXPEDITION DATA] Failed to load results:', apiError);
      } finally {
        setResultsLoading(false);
      }
    };

    lastOperationRef.current = operation;
    await operation();
  }, [starshipId, getAPIOptions, handleError]);

  // Load expedition statistics
  const loadStats = useCallback(async (starshipId: string, options?: APIOptions) => {
    const operation = async () => {
      setStatsLoading(true);
      setStatsError(null);

      try {
        const stats = await expeditionAPI.getStats(starshipId, getAPIOptions(options));
        setStats(stats);
      } catch (error: any) {
        const apiError = handleError(error);
        setStatsError(apiError);
        console.error('[EXPEDITION DATA] Failed to load stats:', apiError);
        
        // If starship not found, set empty stats to prevent continuous retries
        if (apiError.statusCode === 404 || apiError.message?.includes('Starship not found')) {
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
      } finally {
        setStatsLoading(false);
      }
    };

    lastOperationRef.current = operation;
    await operation();
  }, [getAPIOptions, handleError]);

  // Load expedition status
  const loadExpeditionStatus = useCallback(async (expeditionId: string) => {
    if (!starshipId) return;

    try {
      const status = await expeditionAPI.getExpeditionStatus(starshipId, expeditionId, getAPIOptions());
      setExpeditionStatus(status);
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to load expedition status:', error);
    }
  }, [starshipId, getAPIOptions]);

  // Load expedition progress
  const loadExpeditionProgress = useCallback(async (expeditionId: string) => {
    if (!starshipId) return;

    try {
      const progress = await expeditionAPI.getExpeditionProgress(starshipId, expeditionId, getAPIOptions());
      setExpeditionProgress(progress);
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to load expedition progress:', error);
    }
  }, [starshipId, getAPIOptions]);

  // Load active expeditions
  const loadActiveExpeditions = useCallback(async () => {
    if (!starshipId) return;

    try {
      const activeData = await expeditionAPI.getActiveExpeditions(starshipId, getAPIOptions());
      setActiveExpeditions(activeData.expeditions || []);
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to load active expeditions:', error);
      // Set empty array on error to prevent UI issues
      setActiveExpeditions([]);
    }
  }, [starshipId, getAPIOptions]);

  // Load recent messages
  const loadRecentMessages = useCallback(async (expeditionId: string, limit = 50, offset = 0) => {
    if (!starshipId) return;

    try {
      const data = await expeditionAPI.getRecentMessages(starshipId, expeditionId, limit, offset, getAPIOptions());
      setMessages(data.messages);
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to load recent messages:', error);
    }
  }, [starshipId, getAPIOptions]);

  // Task management actions
  const createTask = useCallback(async (request: CreateTaskRequest): Promise<ExpeditionTask | null> => {
    if (!starshipId) return null;

    try {
      const task = await expeditionAPI.createTask(starshipId, request, getAPIOptions());
      // Refresh tasks after creation
      if (request.expeditionId) {
        await loadTasks(request.expeditionId);
      }
      return task;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to create task:', error);
      return null;
    }
  }, [starshipId, getAPIOptions, loadTasks]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<ExpeditionTask>): Promise<ExpeditionTask | null> => {
    if (!starshipId || !expeditionId) return null;

    try {
      const task = await expeditionAPI.updateTask(starshipId, expeditionId, taskId, updates, getAPIOptions());
      // Refresh tasks after update
      await loadTasks(expeditionId);
      return task;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to update task:', error);
      return null;
    }
  }, [starshipId, expeditionId, getAPIOptions, loadTasks]);

  const deleteTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!starshipId || !expeditionId) return false;

    try {
      await expeditionAPI.deleteTask(starshipId, expeditionId, taskId, getAPIOptions());
      // Refresh tasks after deletion
      await loadTasks(expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to delete task:', error);
      return false;
    }
  }, [starshipId, expeditionId, getAPIOptions, loadTasks]);

  const assignTask = useCallback(async (taskId: string, agentId: string): Promise<ExpeditionTask | null> => {
    if (!starshipId || !expeditionId) return null;

    try {
      const task = await expeditionAPI.assignTask(starshipId, expeditionId, taskId, agentId, getAPIOptions());
      // Refresh tasks after assignment
      await loadTasks(expeditionId);
      return task;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to assign task:', error);
      return null;
    }
  }, [starshipId, expeditionId, getAPIOptions, loadTasks]);

  const completeTask = useCallback(async (taskId: string, result?: string): Promise<ExpeditionTask | null> => {
    if (!starshipId || !expeditionId) return null;

    try {
      const task = await expeditionAPI.completeTask(starshipId, expeditionId, taskId, result, getAPIOptions());
      // Refresh tasks after completion
      await loadTasks(expeditionId);
      return task;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to complete task:', error);
      return null;
    }
  }, [starshipId, expeditionId, getAPIOptions, loadTasks]);

  // Messaging actions
  const sendMessage = useCallback(async (content: string, messageType: any = 'user-input'): Promise<boolean> => {
    if (!starshipId || !expeditionId) return false;

    try {
      const request: SendMessageRequest = {
        expeditionId,
        content,
        messageType
      };
      await expeditionAPI.sendMessage(starshipId, request, getAPIOptions());
      // Refresh messages after sending
      await loadMessages(expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to send message:', error);
      return false;
    }
  }, [starshipId, expeditionId, getAPIOptions, loadMessages]);

  // Results actions
  const createResult = useCallback(async (request: CreateResultRequest): Promise<ExpeditionResult | null> => {
    if (!starshipId) return null;

    try {
      const result = await expeditionAPI.createResult(starshipId, request, getAPIOptions());
      // Refresh results after creation
      if (request.expeditionId) {
        await loadResults(request.expeditionId);
      }
      return result;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to create result:', error);
      return null;
    }
  }, [starshipId, getAPIOptions, loadResults]);

  const updateResultQuality = useCallback(async (resultId: string, qualityScore: any): Promise<ExpeditionResult | null> => {
    if (!starshipId || !expeditionId) return null;

    try {
      const result = await expeditionAPI.updateResultQuality(starshipId, expeditionId, resultId, qualityScore, getAPIOptions());
      // Refresh results after quality update
      await loadResults(expeditionId);
      return result;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to update result quality:', error);
      return null;
    }
  }, [starshipId, expeditionId, getAPIOptions, loadResults]);

  // Expedition control actions
  const startExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!starshipId) return false;

    try {
      await expeditionAPI.startExpedition(starshipId, expeditionId, getAPIOptions());
      // Refresh expedition after starting
      await loadExpedition(expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to start expedition:', error);
      return false;
    }
  }, [starshipId, getAPIOptions, loadExpedition]);

  const pauseExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!starshipId) return false;

    try {
      await expeditionAPI.pauseExpedition(starshipId, expeditionId, getAPIOptions());
      // Refresh expedition after pausing
      await loadExpedition(expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to pause expedition:', error);
      return false;
    }
  }, [starshipId, getAPIOptions, loadExpedition]);

  const resumeExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!starshipId) return false;

    try {
      await expeditionAPI.resumeExpedition(starshipId, expeditionId, getAPIOptions());
      // Refresh expedition after resuming
      await loadExpedition(expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to resume expedition:', error);
      return false;
    }
  }, [starshipId, getAPIOptions, loadExpedition]);

  const cancelExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!starshipId) return false;

    try {
      await expeditionAPI.cancelExpedition(starshipId, expeditionId, getAPIOptions());
      // Refresh expedition after cancelling
      await loadExpedition(expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION DATA] Failed to cancel expedition:', error);
      return false;
    }
  }, [starshipId, getAPIOptions, loadExpedition]);

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

  // Utility functions
  const clearCache = useCallback(() => {
    expeditionAPI.clearCache(expeditionId, starshipId);
  }, [expeditionId, starshipId]);

  const retryLastOperation = useCallback(async () => {
    if (lastOperationRef.current) {
      await lastOperationRef.current();
    }
  }, []);

  const isRetryableError = useCallback((error: ExpeditionAPIError): boolean => {
    // Since we removed withRetry, we'll consider server errors (5xx) and network errors as retryable
    // but handle this at the component level rather than API level
    return error.statusCode >= 500 || error.statusCode === 0;
  }, []);

  // Initial data loading
  useEffect(() => {
    if (starshipId) {
      loadExpeditions();
      loadStats(starshipId);
      loadActiveExpeditions();
    }
  }, [starshipId, loadExpeditions, loadStats, loadActiveExpeditions]);

  useEffect(() => {
    if (expeditionId && starshipId) {
      loadExpedition(expeditionId);
      loadTasks(expeditionId); // Explicitly load tasks
      loadExpeditionStatus(expeditionId);
      loadExpeditionProgress(expeditionId);
    }
  }, [expeditionId, starshipId, loadExpedition, loadTasks, loadExpeditionStatus, loadExpeditionProgress]);

  // WebSocket setup for real-time updates
  useEffect(() => {
    if (!enableWebSocket || !expeditionId || !user?.id) return;

    // Join expedition room
    expeditionSocketAPI.joinExpeditionRoom(expeditionId, user.id);

    // Subscribe to status changes
    const unsubscribeStatus = expeditionSocketAPI.subscribeToStatusChanges(expeditionId, (expId, newStatus) => {
      console.log('[EXPEDITION DATA] Status changed:', { expId, newStatus });
      // Update local expedition state
      setExpedition(prev => {
        if (!prev) return prev;
        return { ...prev, status: newStatus as any };
      });
      // Reload full expedition data
      if (starshipId) {
        loadExpedition(expeditionId);
      }
    });

    // Subscribe to task updates
    const unsubscribeTask = expeditionSocketAPI.subscribeToTaskUpdates(expeditionId, (task) => {
      console.log('[EXPEDITION DATA] ✅ Task updated via WebSocket:', task);
      console.log('[EXPEDITION DATA] ✅ Task ID:', task.id, 'Status:', task.status);
      // Update local tasks state
      setTasks(prev => {
        console.log('[EXPEDITION DATA] ✅ Current tasks before update:', prev.length);
        const index = prev.findIndex(t => t.id === task.id);
        if (index >= 0) {
          // Update existing task
          console.log('[EXPEDITION DATA] ✅ Updating existing task at index:', index);
          const newTasks = [...prev];
          newTasks[index] = { ...newTasks[index], ...task, updatedAt: new Date().toISOString() };
          console.log('[EXPEDITION DATA] ✅ Updated tasks:', newTasks.length);
          return newTasks;
        } else {
          // Add new task
          console.log('[EXPEDITION DATA] ✅ Adding new task:', task.id);
          const newTasks = [...prev, { ...task, updatedAt: new Date().toISOString() }];
          console.log('[EXPEDITION DATA] ✅ New tasks total:', newTasks.length);
          return newTasks;
        }
      });
    });

    // Subscribe to messages
    const unsubscribeMessage = expeditionSocketAPI.subscribeToMessages(expeditionId, (message) => {
      console.log('[EXPEDITION DATA] New message:', message);
      // Add message to local state if not already present
      setMessages(prev => {
        const exists = prev.some(m => m.id === message.id);
        if (!exists) {
          return [...prev, message];
        }
        return prev;
      });
    });

    // Subscribe to progress updates
    const unsubscribeProgress = expeditionSocketAPI.subscribeToProgressUpdates(expeditionId, (expId, progress) => {
      console.log('[EXPEDITION DATA] Progress update:', { expId, progress });
      setExpeditionProgress(progress);
    });

    // Subscribe to agent activities
    const unsubscribeActivity = expeditionSocketAPI.subscribeToAgentActivities(expeditionId, (agentId, activity) => {
      console.log('[EXPEDITION DATA] Agent activity:', { agentId, activity });
      // Handle agent activity updates as needed
    });

    // Cleanup
    return () => {
      unsubscribeStatus();
      unsubscribeTask();
      unsubscribeMessage();
      unsubscribeProgress();
      unsubscribeActivity();
      expeditionSocketAPI.leaveExpeditionRoom(expeditionId, user.id);
    };
  }, [enableWebSocket, expeditionId, user?.id, starshipId, loadExpedition]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (starshipId) {
        refreshExpeditions();
        loadActiveExpeditions();
      }
      if (expeditionId && starshipId) {
        refreshExpedition();
        loadMessages(expeditionId);
        loadTasks(expeditionId); // Add task refresh
        loadExpeditionStatus(expeditionId);
        loadExpeditionProgress(expeditionId);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [
    autoRefresh, 
    refreshInterval, 
    starshipId, 
    expeditionId, 
    refreshExpeditions, 
    refreshExpedition, 
    loadMessages, 
    loadTasks, // Add loadTasks dependency
    loadActiveExpeditions,
    loadExpeditionStatus,
    loadExpeditionProgress
  ]);

  // Task-specific polling for active expeditions (reduced frequency since we have WebSocket)
  useEffect(() => {
    if (!expeditionId || !starshipId || !autoRefresh) return;

    // Fallback polling for task updates (less frequent since WebSocket handles real-time updates)
    const taskInterval = setInterval(() => {
      if (expedition?.status === 'in-progress' || expedition?.status === 'planning') {
        console.log('[EXPEDITION DATA] 🔄 Fallback polling tasks for active expedition');
        loadTasks(expeditionId);
      }
    }, 30000); // Reduced to poll every 30 seconds for active expeditions

    return () => clearInterval(taskInterval);
  }, [expeditionId, starshipId, expedition?.status, loadTasks, autoRefresh]);

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
    tasksLoading,
    tasksError,
    messages,
    messagesLoading,
    messagesError,
    results,
    resultsLoading,
    resultsError,
    stats,
    statsLoading,
    statsError,
    
    // Real-time status data
    expeditionStatus,
    expeditionProgress,
    activeExpeditions,
    
    // Loading states
    loadingStates,
    
    // Enhanced actions
    refreshExpeditions,
    refreshExpedition,
    loadExpeditions,
    loadExpedition,
    loadMessages,
    loadTasks,
    loadResults,
    loadStats,
    
    // New enhanced actions
    loadExpeditionStatus,
    loadExpeditionProgress,
    loadActiveExpeditions,
    loadRecentMessages,
    
    // Task management actions
    createTask,
    updateTask,
    deleteTask,
    assignTask,
    completeTask,
    
    // Messaging actions
    sendMessage,
    
    // Results actions
    createResult,
    updateResultQuality,
    
    // Expedition control actions
    startExpedition,
    pauseExpedition,
    resumeExpedition,
    cancelExpedition,
    
    // Utility actions
    clearCache,
    retryLastOperation,
    isRetryableError
  };
}