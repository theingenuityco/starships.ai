'use client'

import Icon from '@/components/primitives/Icon'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChildConversationsPaged } from '@/hooks/useConversations'
import type { AgentModel, ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'

export function ForumChannelView(props: {
  starshipId: string
  channelConversationId: string
  channelSlug?: string | null
  channelName?: string | null
  starshipSlug?: string | null
  /** Open a draft thread (no persistence until first message). */
  onCreateDraftThread?: () => void
}) {
  const router = useRouter()
  const params = useParams()
  const effectiveStarshipSlug = (props.starshipSlug || (params.slug as string | undefined) || '').trim()

  const { conversations: children, isLoading, hasMoreBefore, isFetchingNextPage, fetchNextPage } = useChildConversationsPaged(props.channelConversationId, {
    enabled: true,
    limit: 10,
  })

  // Infinite scrolling: when the sentinel becomes visible, fetch the next page automatically.
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!hasMoreBefore) return
    if (isFetchingNextPage) return
    const el = loadMoreRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      entries => {
        const first = entries[0]
        if (!first?.isIntersecting) return
        if (!hasMoreBefore) return
        if (isFetchingNextPage) return
        void fetchNextPage()
      },
      // Trigger a little before bottom so it feels seamless.
      { root: null, rootMargin: '200px 0px 200px 0px', threshold: 0 }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [fetchNextPage, hasMoreBefore, isFetchingNextPage])

  const sortedChildren = useMemo(() => {
    const list = Array.isArray(children) ? children.slice() : []
    list.sort((a: any, b: any) => {
      const aAt = Date.parse(String((a as any)?.updatedAt || (a as any)?.createdAt || '0'))
      const bAt = Date.parse(String((b as any)?.updatedAt || (b as any)?.createdAt || '0'))
      return bAt - aAt
    })
    return list as Array<ConversationModel & { agents: AgentModel[] }>
  }, [children])

  const label = useMemo(() => {
    const name = String(props.channelName || '').trim()
    if (name) return name
    const slug = String(props.channelSlug || '').trim()
    return slug || 'Forum'
  }, [props.channelName, props.channelSlug])

  const onOpenChild = (conversationId: string) => {
    if (!effectiveStarshipSlug) return
    router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/conversations/${encodeURIComponent(conversationId)}`)
  }

  const onCreateThread = () => {
    // Prefer opening a draft thread pane (no persistence until first message).
    if (props.onCreateDraftThread) {
      props.onCreateDraftThread()
      return
    }
    // Fallback: if no handler was provided, navigate to the channel route (no create).
    if (!effectiveStarshipSlug) return
    const channelSlug = String(props.channelSlug || '').trim()
    if (channelSlug) {
      router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/channels/${encodeURIComponent(channelSlug)}?thread=draft`)
      return
    }
    router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/conversations/${encodeURIComponent(props.channelConversationId)}?thread=draft`)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ConversationSummaryBar
        conversationId={props.channelConversationId}
        starshipId={props.starshipId}
        titlePrefix={<Icon name="hash" className="h-5 w-5" />}
        // Keep the header stable while conversation details load.
        fallbackTitle={label}
        rightSlot={
          <Button type="button" size="sm" onClick={onCreateThread} disabled={!effectiveStarshipSlug} className="shrink-0">
            <Icon name="plus" className="h-4 w-4 mr-1" />
            New thread
          </Button>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : sortedChildren.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
              <Icon name="message-square" className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-foreground">No threads yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">This channel is a forum. Create a thread to start a new conversation.</p>
            <Button className="mt-4" type="button" onClick={onCreateThread} disabled={!effectiveStarshipSlug}>
              <Icon name="plus" className="h-4 w-4 mr-1" />
              New thread
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {sortedChildren.map(child => {
                const id = String((child as any)?.id || '')
                const title = String((child as any)?.title || '').trim() || `Conversation ${id.slice(0, 8)}`
                const agents = Array.isArray((child as any)?.agents) ? ((child as any).agents as AgentModel[]) : []
                const updatedAt = String((child as any)?.updatedAt || (child as any)?.createdAt || '')
                const when = updatedAt ? formatDistanceToNow(new Date(updatedAt), { addSuffix: true }) : ''

                const agentLabel = agents
                  .map(a => String((a as any)?.name || (a as any)?.slug || '').trim())
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(', ')

                return (
                  <button key={id} type="button" onClick={() => onOpenChild(id)} className="group text-left rounded-xl border border-border/60 bg-card/60 hover:bg-card transition-colors p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{agentLabel ? `Agents: ${agentLabel}` : 'Agents: —'}</p>
                      </div>
                      <Icon name="chevron-right" className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {when ? <p className="text-[11px] text-muted-foreground mt-2">{when}</p> : null}
                  </button>
                )
              })}
            </div>

            {hasMoreBefore ? (
              <div className="flex justify-center pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? 'Loading…' : 'Load more threads'}
                </Button>
              </div>
            ) : null}

            {/* Sentinel for infinite scrolling */}
            <div ref={loadMoreRef} className="h-px w-full" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}
