'use client'

import React, { createContext, useContext, PropsWithChildren } from 'react'
import { useConversationStreamed } from './useConversations'

interface ConversationStreamProviderProps {
  conversationId: string | null
  starshipId?: string | null
}

type ConversationStreamValue = ReturnType<typeof useConversationStreamed>

const ConversationStreamContext = createContext<ConversationStreamValue | null>(null)

export function ConversationStreamProvider({ conversationId, starshipId, children }: PropsWithChildren<ConversationStreamProviderProps>) {
  const value = useConversationStreamed(conversationId, starshipId, { enabled: true })
  return <ConversationStreamContext.Provider value={value}>{children}</ConversationStreamContext.Provider>
}

export function useConversationStreamContext() {
  const ctx = useContext(ConversationStreamContext)
  if (!ctx) {
    throw new Error('useConversationStreamContext must be used within a ConversationStreamProvider')
  }
  return ctx
}

export function useConversationStreamContextOptional() {
  return useContext(ConversationStreamContext)
}
