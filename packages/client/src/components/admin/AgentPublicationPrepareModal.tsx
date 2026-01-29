'use client'

import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { usePrepareAgentPublication } from '@/hooks/useAdminAgents'
import type { AgentModel } from '@starships/protocol'

interface AgentPublicationPrepareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: AgentModel
  onComplete: (result: {
    agent: AgentModel
    templateId: string
    marketingContent: {
      avatarUrl?: string
      problemStatementsText?: string[]
      problemStatementsImageUrl?: string
      capabilitiesImageUrl?: string
      tryThesePromptsImageUrl?: string
    }
  }) => void
}

type GenerationStep = 'checking' | 'avatar' | 'problem_statements_text' | 'problem_statements_image' | 'capabilities_image' | 'try_these_prompts_image' | 'complete'

export function AgentPublicationPrepareModal({
  open,
  onOpenChange,
  agent,
  onComplete,
}: AgentPublicationPrepareModalProps) {
  const [currentStep, setCurrentStep] = useState<GenerationStep>('checking')
  const prepareMutation = usePrepareAgentPublication()

  useEffect(() => {
    if (open && agent) {
      // Only trigger if not already pending/completed
      if (!prepareMutation.isPending && !prepareMutation.data) {
        setCurrentStep('checking')
        prepareMutation.mutate(agent.id, {
          onSuccess: result => {
            setCurrentStep('complete')
            // Auto-transition to review after a brief delay
            setTimeout(() => {
              onComplete(result)
            }, 1500)
          },
          onError: () => {
            // Error handled by mutation
          },
        })
      } else if (prepareMutation.data) {
        // Already prepared, show complete state
        setCurrentStep('complete')
      }
    } else if (!open) {
      // Reset when modal closes
      setCurrentStep('checking')
    }
  }, [open, agent?.id, prepareMutation.isPending, prepareMutation.data])

  const getStepLabel = (step: GenerationStep): string => {
    switch (step) {
      case 'checking':
        return 'Checking marketing content...'
      case 'avatar':
        return 'Generating avatar...'
      case 'problem_statements_text':
        return 'Generating problem statements...'
      case 'problem_statements_image':
        return 'Generating problem statements image...'
      case 'capabilities_image':
        return 'Generating capabilities image...'
      case 'try_these_prompts_image':
        return 'Generating try these prompts image...'
      case 'complete':
        return 'All content ready!'
      default:
        return 'Preparing...'
    }
  }

  const getCompletedSteps = (): GenerationStep[] => {
    const steps: GenerationStep[] = ['checking', 'avatar', 'problem_statements_text', 'problem_statements_image', 'capabilities_image', 'try_these_prompts_image']
    const currentIndex = steps.indexOf(currentStep)
    if (currentStep === 'complete') return steps
    return steps.slice(0, currentIndex)
  }

  const completedSteps = getCompletedSteps()
  const isGenerating = prepareMutation.isPending && currentStep !== 'complete'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preparing Publication</DialogTitle>
          <DialogDescription>Generating missing marketing content for {agent?.name || 'this agent'}...</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            {(['checking', 'avatar', 'problem_statements_text', 'problem_statements_image', 'capabilities_image', 'try_these_prompts_image'] as GenerationStep[]).map(step => {
              const isCompleted = completedSteps.includes(step)
              const isCurrent = currentStep === step && isGenerating
              const isPending = !isCompleted && !isCurrent

              return (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Icon name="check" className="h-4 w-4 text-white" />
                      </div>
                    ) : isCurrent ? (
                      <LoadingSpinner className="w-6 h-6" />
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm ${isCompleted ? 'text-emerald-600' : isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {getStepLabel(step)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {currentStep === 'complete' && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-4">
              <div className="flex items-center gap-2">
                <Icon name="check-circle" className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">All marketing content is ready!</p>
              </div>
            </div>
          )}

          {prepareMutation.isError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
              <div className="flex items-center gap-2">
                <Icon name="alert-circle" className="h-5 w-5 text-destructive" />
                <p className="text-sm font-medium text-destructive">
                  {(prepareMutation.error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
                    'Failed to prepare publication'}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          {currentStep === 'complete' && (
            <Button onClick={() => onComplete(prepareMutation.data!)}>
              Review & Confirm
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
