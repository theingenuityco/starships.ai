import { useEffect, useCallback, useState } from 'react';
import { useSocketConnection } from './useSocketConnection';
import SocketClient from '@/lib/socket-client';

interface UseExpeditionSocketProps {
  expeditionId?: string;
  onExpeditionUpdate?: (data: any) => void;
  onMessage?: (data: any) => void;
  onTaskUpdate?: (data: any) => void;
  onStatusChange?: (data: any) => void;
  onPhaseChange?: (data: any) => void;
  onError?: (error: any) => void;
}

interface UseExpeditionSocketReturn {
  isConnected: boolean;
  joinExpedition: (expeditionId: string) => void;
  leaveExpedition: (expeditionId: string) => void;
  sendMessage: (expeditionId: string, message: string) => void;
  startExpedition: (expeditionId: string) => void;
  pauseExpedition: (expeditionId: string) => void;
  cancelExpedition: (expeditionId: string) => void;
  error: string | null;
}

export function useExpeditionSocket({
  expeditionId,
  onExpeditionUpdate,
  onMessage,
  onTaskUpdate,
  onStatusChange,
  onPhaseChange,
  onError
}: UseExpeditionSocketProps = {}): UseExpeditionSocketReturn {
  const { isConnected } = useSocketConnection();
  const [error, setError] = useState<string | null>(null);
  const socketClient = SocketClient.getInstance();

  // Join expedition room when connected and expeditionId is provided
  useEffect(() => {
    if (isConnected && expeditionId) {
      joinExpedition(expeditionId);
      return () => {
        leaveExpedition(expeditionId);
      };
    }
  }, [isConnected, expeditionId]);

  // Set up event listeners
  useEffect(() => {
    if (!isConnected) return;

    const socket = socketClient.getSocket() as any;
    if (!socket) return;

    // Expedition lifecycle events
    const handleExpeditionCreated = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition created:', data);
      onExpeditionUpdate?.(data);
    };

    const handleExpeditionUpdated = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition updated:', data);
      onExpeditionUpdate?.(data);
    };

    const handleExpeditionDeleted = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition deleted:', data);
      onExpeditionUpdate?.(data);
    };

    const handleExpeditionStarted = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition started:', data);
      onStatusChange?.(data);
    };

    const handleExpeditionPaused = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition paused:', data);
      onStatusChange?.(data);
    };

    const handleExpeditionResumed = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition resumed:', data);
      onStatusChange?.(data);
    };

    const handleExpeditionCancelled = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition cancelled:', data);
      onStatusChange?.(data);
    };

    const handleExpeditionCompleted = (data: any) => {
      console.log('[EXPEDITION SOCKET] Expedition completed:', data);
      onStatusChange?.(data);
    };

    const handleStatusUpdate = (data: any) => {
      console.log('[EXPEDITION SOCKET] Status update:', data);
      onStatusChange?.(data);
    };

    // Task events
    const handleTaskAssigned = (data: any) => {
      console.log('[EXPEDITION SOCKET] Task assigned:', data);
      onTaskUpdate?.(data);
    };

    const handleTaskCompleted = (data: any) => {
      console.log('[EXPEDITION SOCKET] Task completed:', data);
      onTaskUpdate?.(data);
    };

    // Message events
    const handleMessage = (data: any) => {
      console.log('[EXPEDITION SOCKET] New message:', data);
      onMessage?.(data);
    };

    // Phase change events
    const handlePhaseChange = (data: any) => {
      console.log('[EXPEDITION SOCKET] Phase change:', data);
      onPhaseChange?.(data);
    };

    // Result events
    const handleResultAvailable = (data: any) => {
      console.log('[EXPEDITION SOCKET] Result available:', data);
      onExpeditionUpdate?.(data);
    };

    // Error events
    const handleExpeditionError = (data: any) => {
      // Add comprehensive debugging
      console.log('[EXPEDITION SOCKET] Raw error data received:', data, 'Type:', typeof data, 'Keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
      
      // Check if data is empty or meaningless first
      const isEmptyObject = data && typeof data === 'object' && Object.keys(data).length === 0;
      const isUndefinedOrNull = data === undefined || data === null;
      
      if (isEmptyObject || isUndefinedOrNull) {
        // Completely ignore empty error objects - don't log, don't set error, don't call onError
        console.warn('[EXPEDITION SOCKET] Received empty/null error object, ignoring completely. Data:', data);
        return;
      }
      
      // Additional check for objects that might appear non-empty but have no meaningful content
      if (data && typeof data === 'object') {
        const keys = Object.keys(data);
        const hasValidContent = keys.some(key => {
          const value = data[key];
          return value !== undefined && value !== null && value !== '';
        });
        
        if (!hasValidContent) {
          console.warn('[EXPEDITION SOCKET] Received object with no valid content, ignoring. Data:', data);
          return;
        }
      }
      
      // Handle meaningful error objects
      let errorMessage = 'An expedition error occurred';
      
      if (data && typeof data === 'object') {
        if (data.message) {
          errorMessage = data.message;
        } else if (data.error) {
          errorMessage = data.error;
        } else {
          // If object has properties but no standard error fields, stringify it
          const keys = Object.keys(data);
          if (keys.length > 0) {
            errorMessage = `Error: ${JSON.stringify(data)}`;
          } else {
            // This should never happen due to checks above, but just in case
            console.warn('[EXPEDITION SOCKET] Object passed validation but has no keys, ignoring. Data:', data);
            return;
          }
        }
      } else if (typeof data === 'string' && data.trim().length > 0) {
        errorMessage = data;
      } else {
        // Any other falsy or empty string values should be ignored
        console.warn('[EXPEDITION SOCKET] Received invalid error data, ignoring. Data:', data, 'Type:', typeof data);
        return;
      }
      
      // Only log and handle meaningful errors
      console.error('[EXPEDITION SOCKET] Processing meaningful expedition error:', data);
      console.log('[EXPEDITION SOCKET] Error message extracted:', errorMessage);
      setError(errorMessage);
      onError?.(data);
    };

    // Register all event listeners
    socket.on('expedition:created', handleExpeditionCreated);
    socket.on('expedition:updated', handleExpeditionUpdated);
    socket.on('expedition:deleted', handleExpeditionDeleted);
    socket.on('expedition:started', handleExpeditionStarted);
    socket.on('expedition:paused', handleExpeditionPaused);
    socket.on('expedition:resumed', handleExpeditionResumed);
    socket.on('expedition:cancelled', handleExpeditionCancelled);
    socket.on('expedition:completed', handleExpeditionCompleted);
    socket.on('expedition:status-update', handleStatusUpdate);
    socket.on('expedition:task-assigned', handleTaskAssigned);
    socket.on('expedition:task-completed', handleTaskCompleted);
    socket.on('expedition:message', handleMessage);
    socket.on('expedition:phase-change', handlePhaseChange);
    socket.on('expedition:result-available', handleResultAvailable);
    socket.on('expedition:error', handleExpeditionError);

    // Cleanup function
    return () => {
      socket.off('expedition:created', handleExpeditionCreated);
      socket.off('expedition:updated', handleExpeditionUpdated);
      socket.off('expedition:deleted', handleExpeditionDeleted);
      socket.off('expedition:started', handleExpeditionStarted);
      socket.off('expedition:paused', handleExpeditionPaused);
      socket.off('expedition:resumed', handleExpeditionResumed);
      socket.off('expedition:cancelled', handleExpeditionCancelled);
      socket.off('expedition:completed', handleExpeditionCompleted);
      socket.off('expedition:status-update', handleStatusUpdate);
      socket.off('expedition:task-assigned', handleTaskAssigned);
      socket.off('expedition:task-completed', handleTaskCompleted);
      socket.off('expedition:message', handleMessage);
      socket.off('expedition:phase-change', handlePhaseChange);
      socket.off('expedition:result-available', handleResultAvailable);
      socket.off('expedition:error', handleExpeditionError);
    };
  }, [isConnected, onExpeditionUpdate, onMessage, onTaskUpdate, onStatusChange, onPhaseChange, onError]);

  // Socket action functions
  const joinExpedition = useCallback((expeditionId: string) => {
    if (!isConnected) {
      console.warn('[EXPEDITION SOCKET] Cannot join expedition - not connected');
      return;
    }
    
    console.log('[EXPEDITION SOCKET] Joining expedition:', expeditionId);
    socketClient.emit('expedition:join', expeditionId);
  }, [isConnected]);

  const leaveExpedition = useCallback((expeditionId: string) => {
    if (!isConnected) {
      console.warn('[EXPEDITION SOCKET] Cannot leave expedition - not connected');
      return;
    }
    
    console.log('[EXPEDITION SOCKET] Leaving expedition:', expeditionId);
    socketClient.emit('expedition:leave', expeditionId);
  }, [isConnected]);

  const sendMessage = useCallback((expeditionId: string, message: string) => {
    if (!isConnected) {
      console.warn('[EXPEDITION SOCKET] Cannot send message - not connected');
      setError('Not connected to server');
      return;
    }
    
    console.log('[EXPEDITION SOCKET] Sending message to expedition:', expeditionId);
    socketClient.emit('expedition:send-message', { expeditionId, message });
    setError(null);
  }, [isConnected]);

  const startExpedition = useCallback((expeditionId: string) => {
    if (!isConnected) {
      console.warn('[EXPEDITION SOCKET] Cannot start expedition - not connected');
      setError('Not connected to server');
      return;
    }
    
    console.log('[EXPEDITION SOCKET] Starting expedition:', expeditionId);
    socketClient.emit('expedition:start', expeditionId);
    setError(null);
  }, [isConnected]);

  const pauseExpedition = useCallback((expeditionId: string) => {
    if (!isConnected) {
      console.warn('[EXPEDITION SOCKET] Cannot pause expedition - not connected');
      setError('Not connected to server');
      return;
    }
    
    console.log('[EXPEDITION SOCKET] Pausing expedition:', expeditionId);
    socketClient.emit('expedition:pause', expeditionId);
    setError(null);
  }, [isConnected]);

  const cancelExpedition = useCallback((expeditionId: string) => {
    if (!isConnected) {
      console.warn('[EXPEDITION SOCKET] Cannot cancel expedition - not connected');
      setError('Not connected to server');
      return;
    }
    
    console.log('[EXPEDITION SOCKET] Cancelling expedition:', expeditionId);
    socketClient.emit('expedition:cancel', expeditionId);
    setError(null);
  }, [isConnected]);

  return {
    isConnected,
    joinExpedition,
    leaveExpedition,
    sendMessage,
    startExpedition,
    pauseExpedition,
    cancelExpedition,
    error
  };
}