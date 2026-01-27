'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRegenerateMarketingContent, useUpdateProblemStatements, useConfirmAgentPublication } from '@/hooks/useAdminAgents'
import { ProblemStatementsEditor } from './ProblemStatementsEditor'
import AgentAvatar from '@/components/animated/AgentAvatar'
import type { AgentModel } from '@starships/protocol'
import { cn } from '@/lib/utils'

interface AgentPublicationReviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: AgentModel
  templateId: string
  marketingContent: {
    avatarUrl?: string
    problemStatementsText?: string[]
    problemStatementsImageUrl?: string
    capabilitiesImageUrl?: string
    tryThesePromptsImageUrl?: string
  }
  onConfirm: () => void
}

export function AgentPublicationReviewModal({
  open,
  onOpenChange,
  agent,
  templateId,
  marketingContent: initialMarketingContent,
  onConfirm,
}: AgentPublicationReviewModalProps) {
  // Safely parse problem statements - handle both array and JSON string
  const parseProblemStatements = (input: string[] | string | undefined): string[] => {
    if (!input) return []
    if (Array.isArray(input)) return input
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        // If it's not JSON, treat as a single statement
        return input.trim() ? [input] : []
      }
    }
    return []
  }

  const [problemStatements, setProblemStatements] = useState<string[]>(parseProblemStatements(initialMarketingContent.problemStatementsText))
  const [marketingContent, setMarketingContent] = useState(initialMarketingContent)
  const [regeneratingType, setRegeneratingType] = useState<string | null>(null)

  const regenerateMutation = useRegenerateMarketingContent()
  const updateStatementsMutation = useUpdateProblemStatements()
  const confirmMutation = useConfirmAgentPublication()

  // Update local state when prop changes
  useEffect(() => {
    setMarketingContent(initialMarketingContent)
    setProblemStatements(parseProblemStatements(initialMarketingContent.problemStatementsText))
  }, [initialMarketingContent])

  const handleRegenerate = async (type: 'avatar' | 'problem_statements_text' | 'problem_statements_image' | 'capabilities_image' | 'try_these_prompts_image') => {
    setRegeneratingType(type)
    try {
      const result = await regenerateMutation.mutateAsync({
        agentId: agent.id,
        templateId,
        type,
      })

      // Update local state with regenerated content
      setMarketingContent(prev => ({
        ...prev,
        ...result.marketingContent,
      }))

      if (type === 'problem_statements_text' && result.marketingContent.problemStatementsText) {
        setProblemStatements(result.marketingContent.problemStatementsText)
      }
    } finally {
      setRegeneratingType(null)
    }
  }

  const handleUpdateStatements = async () => {
    await updateStatementsMutation.mutateAsync({
      agentId: agent.id,
      templateId,
      statements: problemStatements,
    })
  }

  const handleConfirm = async () => {
    // Save problem statements if changed
    if (JSON.stringify(problemStatements) !== JSON.stringify(marketingContent.problemStatementsText || [])) {
      await handleUpdateStatements()
    }

    await confirmMutation.mutateAsync(agent.id)
    onConfirm()
  }

  const isRegenerating = regeneratingType !== null || regenerateMutation.isPending
  const isConfirming = confirmMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Review Marketing Content</DialogTitle>
          <DialogDescription>Review and edit marketing content before publishing {agent?.name || 'this agent'}.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Avatar */}
            <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Avatar</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRegenerate('avatar')}
                  disabled={isRegenerating}
                  className="h-8 text-xs"
                >
                  {regeneratingType === 'avatar' ? (
                    <>
                      <LoadingSpinner className="w-3 h-3 mr-1" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <Icon name="refresh-cw" className="h-3 w-3 mr-1" />
                      Regenerate
                    </>
                  )}
                </Button>
              </div>
              {marketingContent.avatarUrl ? (
                <div className="flex justify-center">
                  <AgentAvatar
                    seed={agent.name}
                    imageUrl={marketingContent.avatarUrl}
                    size={128}
                    rounded
                    className="h-32 w-32 rounded-xl"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-border/60 bg-muted/20">
                  <p className="text-sm text-muted-foreground">No avatar</p>
                </div>
              )}
            </div>

            {/* Problem Statements */}
            <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Problem Statements</h3>
                {marketingContent.problemStatementsImageUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRegenerate('problem_statements_image')}
                    disabled={isRegenerating}
                    className="h-8 text-xs"
                  >
                    {regeneratingType === 'problem_statements_image' ? (
                      <>
                        <LoadingSpinner className="w-3 h-3 mr-1" />
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <Icon name="refresh-cw" className="h-3 w-3 mr-1" />
                        Regenerate Image
                      </>
                    )}
                  </Button>
                )}
              </div>

              {marketingContent.problemStatementsImageUrl && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={marketingContent.problemStatementsImageUrl}
                    alt="Problem statements"
                    className="max-w-full h-auto rounded-lg border border-border/60"
                  />
                </div>
              )}

              <ProblemStatementsEditor
                statements={problemStatements}
                onChange={setProblemStatements}
                onRegenerate={() => handleRegenerate('problem_statements_text')}
                disabled={isRegenerating}
              />
            </div>

            {/* Capabilities Image */}
            <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Capabilities Image</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRegenerate('capabilities_image')}
                  disabled={isRegenerating}
                  className="h-8 text-xs"
                >
                  {regeneratingType === 'capabilities_image' ? (
                    <>
                      <LoadingSpinner className="w-3 h-3 mr-1" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <Icon name="refresh-cw" className="h-3 w-3 mr-1" />
                      Regenerate
                    </>
                  )}
                </Button>
              </div>
              {marketingContent.capabilitiesImageUrl ? (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={marketingContent.capabilitiesImageUrl}
                    alt="Capabilities"
                    className="max-w-full h-auto rounded-lg border border-border/60"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-border/60 bg-muted/20">
                  <p className="text-sm text-muted-foreground">No image</p>
                </div>
              )}
            </div>

            {/* Try These Prompts Image */}
            <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Try These Prompts Image</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRegenerate('try_these_prompts_image')}
                  disabled={isRegenerating}
                  className="h-8 text-xs"
                >
                  {regeneratingType === 'try_these_prompts_image' ? (
                    <>
                      <LoadingSpinner className="w-3 h-3 mr-1" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <Icon name="refresh-cw" className="h-3 w-3 mr-1" />
                      Regenerate
                    </>
                  )}
                </Button>
              </div>
              {marketingContent.tryThesePromptsImageUrl ? (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={marketingContent.tryThesePromptsImageUrl}
                    alt="Try these prompts"
                    className="max-w-full h-auto rounded-lg border border-border/60"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-border/60 bg-muted/20">
                  <p className="text-sm text-muted-foreground">No image</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming || isRegenerating}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirming || isRegenerating}>
            {isConfirming ? (
              <>
                <LoadingSpinner className="w-4 h-4 mr-2" />
                Publishing...
              </>
            ) : (
              <>
                <Icon name="check-circle" className="h-4 w-4 mr-2" />
                Confirm & Publish
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
