'use client'

import React, { createContext, useContext, PropsWithChildren } from 'react'
import { useConversationStreamed } from './useConversations'

interface ConversationStreamProviderProps {
  conversationId: string | null
  starshipId?: string | null
  /**
   * Optional pre-created stream value.
   * When provided, the provider will NOT create its own active SSE subscription.
   * This prevents duplicate streaming connections for the same conversation.
   */
  value?: ConversationStreamValue
}

type ConversationStreamValue = ReturnType<typeof useConversationStreamed>

const ConversationStreamContext = createContext<ConversationStreamValue | null>(null)

export function ConversationStreamProvider({ conversationId, starshipId, value: provided, children }: PropsWithChildren<ConversationStreamProviderProps>) {
  // If a stream value is provided by the caller, do NOT create another active SSE subscription.
  // We still call the hook (disabled) to satisfy React rules-of-hooks and keep the type stable.
  const computed = useConversationStreamed(conversationId, starshipId, { enabled: !provided })
  const finalValue = provided ?? computed
  return <ConversationStreamContext.Provider value={finalValue}>{children}</ConversationStreamContext.Provider>
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
