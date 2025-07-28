'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocketConnection } from '@/hooks/useSocketConnection';
import type { ConnectionStatus, SocketConnectionState } from '@starships/protocol';

interface SocketContextType {
  isConnected: boolean;
  connectionState: SocketConnectionState;
  connectionStatus: ConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  error: string | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const { isAuthenticated } = useAuth();
  const {
    isConnected,
    connectionState,
    connectionStatus,
    connect,
    disconnect,
    reconnect,
    error
  } = useSocketConnection();

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && !isConnected && connectionStatus !== 'reconnecting') {
      console.log('[SOCKET PROVIDER] Auto-connecting WebSocket...');
      connect().catch(err => {
        console.warn('[SOCKET PROVIDER] Auto-connect failed:', err);
      });
    }
  }, [isAuthenticated, isConnected, connectionStatus, connect]);

  // Log connection status changes
  useEffect(() => {
    console.log('[SOCKET PROVIDER] Connection status changed:', {
      isConnected,
      connectionStatus,
      hasError: !!error
    });
  }, [isConnected, connectionStatus, error]);

  const value: SocketContextType = {
    isConnected,
    connectionState,
    connectionStatus,
    connect,
    disconnect,
    reconnect,
    error
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}