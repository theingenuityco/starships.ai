import SocketClient from '@/lib/socket-client'
import type {
  ConnectionStatus,
  ConnectionStatusEvent,
  SocketConnectionState,
} from '@starships/protocol'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface UseSocketConnectionReturn {
  isConnected: boolean
  connectionState: SocketConnectionState
  connectionStatus: ConnectionStatus
  connect: () => Promise<void>
  disconnect: () => void
  reconnect: () => Promise<void>
  error: string | null
}

export function useSocketConnection(): UseSocketConnectionReturn {
  const { getToken, userId, isAuthenticated } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<SocketConnectionState>({
    connected: false,
    authenticated: false,
    roomJoined: false,
  })
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const socketClient = SocketClient.getInstance()

  const connect = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      setError('User not authenticated')
      return
    }

    try {
      setError(null)
      setConnectionStatus('reconnecting')

      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      await socketClient.connect(token, userId)

      const state = socketClient.getConnectionState()
      setConnectionState(state)
      setIsConnected(state.connected)
      setConnectionStatus('connected')

      console.log('[SOCKET HOOK] Connected successfully')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed'
      setError(errorMessage)
      setConnectionStatus('error')
      setIsConnected(false)
      console.error('[SOCKET HOOK] Connection failed:', err)
    }
  }, [isAuthenticated, userId, getToken])

  const disconnect = useCallback(() => {
    socketClient.disconnect()
    setIsConnected(false)
    setConnectionState({
      connected: false,
      authenticated: false,
      roomJoined: false,
    })
    setConnectionStatus('disconnected')
    setError(null)
  }, [])

  const reconnect = useCallback(async () => {
    disconnect()
    await new Promise(resolve => setTimeout(resolve, 1000))
    await connect()
  }, [disconnect, connect])

  useEffect(() => {
    if (isAuthenticated && userId && !isConnected) {
      connect()
    }
  }, [isAuthenticated, userId, isConnected, connect])

  useEffect(() => {
    const socket = socketClient.getSocket()
    if (!socket) return

    const handleConnectionStatus = (event: ConnectionStatusEvent) => {
      setConnectionStatus(event.status)
      setIsConnected(event.status === 'connected')
    }

    const handleDisconnect = () => {
      setIsConnected(false)
      setConnectionStatus('disconnected')
    }

    const handleConnect = () => {
      setIsConnected(true)
      setConnectionStatus('connected')
      setError(null)
    }

    socket.on('connection-status', handleConnectionStatus)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect', handleConnect)

    return () => {
      socket.off('connection-status', handleConnectionStatus)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect', handleConnect)
    }
  }, [socketClient])

  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect()
      }
    }
  }, [])

  return {
    isConnected,
    connectionState,
    connectionStatus,
    connect,
    disconnect,
    reconnect,
    error,
  }
}
