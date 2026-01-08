'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ToolBuilderView, ToolBuilderViewRef } from '@/components/tools/ToolBuilder'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipTool } from '@/hooks/useTools'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents } from '@/hooks/useConversations'
import { useConversationStreamContext } from '@/hooks/ConversationStreamContext'
import { ToolUpdateNotification } from '@/components/tools/ToolUpdateNotification'

export default function ToolBuilderPage(): React.JSX.Element | null {
  const { slug, toolSlug } = useParams<{ slug: string; toolSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, true)
  const toolBuilderRef = useRef<ToolBuilderViewRef>(null)
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const conversationId = useMemo(() => searchParams.get('conversationId') || null, [searchParams])
  const { data: agents = [] } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming state via the ship-layout provider
  const { isResponding } = useConversationStreamContext()

  // Control the expandable overlay: user-driven; semi-expanded shows automatically while streaming
  const [isOverlayExpanded, setIsOverlayExpanded] = useState<boolean>(false)

  // Autofocus the conversation input when the page loads (and conversation is present)
  useEffect(() => {
    if (!conversationId) return
    const t = setTimeout(() => {
      try {
        messageInputRef.current?.focusInput?.()
      } catch {}
    }, 150)
    return () => clearTimeout(t)
  }, [conversationId])

  // Tool call streaming side-effects intentionally removed: tool call logic is generic in the client.

  // Prefill when editing an existing tool
  const { data: existingTool } = useStarshipTool(starship?.id || '', toolSlug || '', !!starship?.id && !!toolSlug && toolSlug !== 'new')
  useEffect(() => {
    if (!existingTool || !toolBuilderRef.current) return
    toolBuilderRef.current.updateField('name', existingTool.name || '')
    if (existingTool.description) toolBuilderRef.current.updateField('description', existingTool.description)
    if (existingTool.parameters) toolBuilderRef.current.updateField('parameters', JSON.stringify(existingTool.parameters, null, 2))
    if (existingTool.blueprint) toolBuilderRef.current.updateField('blueprint', JSON.stringify(existingTool.blueprint, null, 2))
  }, [existingTool])

  const handleCancel = () => {
    if (conversationId) {
      router.push(`/ship/${slug}/conversations/${conversationId}`)
    } else {
      router.push(`/ship/${slug}/conversations`)
    }
  }

  if (!starship?.id) return null

  return (
    <div className="relative h-screen w-full">
      {/* Update Notification - Floating top right */}
      {existingTool && (
        <div className="absolute top-6 right-6 z-50">
          <ToolUpdateNotification tool={existingTool} />
        </div>
      )}
      <ToolBuilderView ref={toolBuilderRef} starshipId={starship.id} onCancel={handleCancel} toolId={existingTool?.id} templateId={existingTool?.sourceTemplateId} />
      {conversationId && (
        <div className="absolute left-0 right-0 bottom-[22px] px-6 z-30 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <ConversationMessageInput
              ref={messageInputRef}
              selectedAgent={selectedAgent}
              starshipId={starship.id}
              conversationId={conversationId}
              isToolFormOpen={true}
              minimal={true}
              showExpandableOverlay={true}
              isOverlayExpanded={isOverlayExpanded}
              onFocus={() => {
                if (!isResponding) setIsOverlayExpanded(true)
              }}
              onBlur={() => setIsOverlayExpanded(false)}
              onToggleOverlay={() => setIsOverlayExpanded(prev => !prev)}
              starshipSlug={slug}
            >
              <AgentSelector selectedAgent={selectedAgent} onAgentChange={() => {}} starshipId={starship.id} compact={true} />
            </ConversationMessageInput>
          </div>
        </div>
      )}
    </div>
  )
}
