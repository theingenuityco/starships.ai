'use client'

import Icon from '@/components/primitives/Icon'
import { useConversationSearch } from '@/components/conversation/ConversationSearchContext'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { usePathname } from 'next/navigation'

export function TopRightUserProfile(): React.JSX.Element | null {
  const pathname = usePathname()
  const searchContext = useConversationSearch()
  const { isAuthenticated } = useAuth()

  const isShipPage = typeof pathname === 'string' && pathname.startsWith('/ship/')
  const showNavbarSearch = isShipPage && searchContext != null

  if (!isAuthenticated) return null
  if (!showNavbarSearch) return null

  return (
    <div className="fixed top-4 right-4 z-[60]">
      <div className="flex items-center gap-3">
        <div className="relative min-w-[100px] w-[140px] max-w-[160px] flex-shrink-0">
          <Icon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            type="text"
            placeholder="Find in chat"
            value={searchContext!.searchInputValue}
            onChange={e => searchContext!.setSearchInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const q = searchContext!.searchInputValue.trim()
                if (q) searchContext!.setSubmittedQuery(q)
              }
            }}
            className="pl-7 pr-7 h-8 text-xs w-full"
            aria-label="Search in conversation"
            autoComplete="off"
          />
          {searchContext!.searchInputValue ? (
            <button
              type="button"
              onClick={() => {
                searchContext!.setSearchInputValue('')
                searchContext!.setSubmittedQuery('')
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
