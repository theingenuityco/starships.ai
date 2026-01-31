'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface ConversationSearchContextValue {
  searchInputValue: string
  setSearchInputValue: (value: string) => void
  submittedQuery: string
  setSubmittedQuery: (query: string) => void
}

const ConversationSearchContext = createContext<ConversationSearchContextValue | null>(null)

export function ConversationSearchProvider({ children }: { children: ReactNode }) {
  const [searchInputValue, setSearchInputValue] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  const value = useMemo<ConversationSearchContextValue>(
    () => ({
      searchInputValue,
      setSearchInputValue,
      submittedQuery,
      setSubmittedQuery,
    }),
    [searchInputValue, submittedQuery]
  )

  return <ConversationSearchContext.Provider value={value}>{children}</ConversationSearchContext.Provider>
}

export function useConversationSearch(): ConversationSearchContextValue | null {
  return useContext(ConversationSearchContext)
}
