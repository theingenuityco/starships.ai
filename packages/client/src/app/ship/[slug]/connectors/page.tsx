'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/PageHeader'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 400

export default function ConnectorsPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const [searchValue, setSearchValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchValue])

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <PageHeader icon="plug" title="Connectors" />

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8 hidden md:block">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex justify-start" />
              <div className="w-full sm:w-64">
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                  <Input
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    placeholder="Search connectors"
                    className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                    aria-label="Search connectors"
                  />
                </div>
              </div>
            </div>
          </div>

          {!starshipLoading && starshipId ? (
            <StarshipConnectorsPanel
              starshipId={starshipId}
              layout="list"
              paginateCatalog={true}
              catalogPageSize={50}
              catalogQuery={debouncedQuery}
              showLoadMore={true}
              sortBy="catalog"
              statusFilter="all"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
