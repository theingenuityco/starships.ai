'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from '@/platform/navigation'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useAuth } from '@/hooks/useAuth'
import {
  useAgentTemplateMarketingJob,
  useGenerateAgentTemplateMarketingContent,
  useRevalidateMarketplaceMarketingCaches,
  useSetMarketplaceMarketingRenderingDisabled,
} from '@/hooks/useAdminAgentTemplates'
import { cn } from '@/lib/utils'

export function MarketplaceAgentMarketingFab(props: {
  templateId?: string | null
  marketingRenderingDisabled?: boolean
}): React.JSX.Element | null {
  const { templateId, marketingRenderingDisabled: initialMarketingRenderingDisabled } = props
  const router = useRouter()
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const generateMutation = useGenerateAgentTemplateMarketingContent()
  const revalidateMutation = useRevalidateMarketplaceMarketingCaches()
  const setRenderingMutation = useSetMarketplaceMarketingRenderingDisabled()

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const hasTemplateId = !!(templateId && String(templateId).trim())

  const [marketingRenderDisabled, setMarketingRenderDisabled] = React.useState(Boolean(initialMarketingRenderingDisabled))
  React.useEffect(() => {
    setMarketingRenderDisabled(Boolean(initialMarketingRenderingDisabled))
  }, [initialMarketingRenderingDisabled])

  const [jobId, setJobId] = React.useState<string | null>(null)
  const [panelOpen, setPanelOpen] = React.useState(false)
  const jobQuery = useAgentTemplateMarketingJob(jobId)
  const job = jobQuery.data

  React.useEffect(() => {
    if (!job) return
    if (job.status === 'completed') {
      router.refresh()
    }
  }, [job?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const canShow = Boolean(mounted && isAuthenticated && isInstanceAdmin && hasTemplateId)
  if (!canShow) return null

  const stepIcon = (status: string) => {
    if (status === 'completed') return <Icon name="check-circle" className="h-4 w-4 text-emerald-600" />
    if (status === 'failed') return <Icon name="x-circle" className="h-4 w-4 text-red-600" />
    if (status === 'running') return <Icon name="loading" className="h-4 w-4 animate-spin text-primary" />
    return <Icon name="circle" className="h-4 w-4 text-muted-foreground/60" />
  }

  const node = (
    <div
      className="fixed right-6 z-[9999] pointer-events-auto"
      style={{
        bottom: `calc(32px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {panelOpen ? (
        <div className="mb-3 w-[320px] rounded-xl border border-border/70 bg-background/95 shadow-lg backdrop-blur p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Generating marketing content</div>
              <div className="text-xs text-muted-foreground">
                {job?.status === 'completed'
                  ? 'Done'
                  : job?.status === 'failed'
                    ? 'Failed'
                    : jobId
                      ? 'In progress…'
                      : 'Starting…'}
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              onClick={() => setPanelOpen(false)}
              aria-label="Close progress"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {(job?.steps || []).map(step => (
              <div key={step.key} className="flex items-start gap-2">
                <div className="mt-0.5">{stepIcon(step.status)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground">{step.label}</div>
                  {step.status === 'failed' && step.error ? (
                    <div className="text-[11px] text-red-600 line-clamp-2">{step.error}</div>
                  ) : null}
                </div>
              </div>
            ))}

            {job?.status === 'failed' && job.error ? (
              <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/5 p-2 text-[11px] text-red-700">
                {job.error}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <Button
        size="sm"
        className="shadow-lg rounded-full px-4"
        disabled={generateMutation.isPending || (job?.status === 'running' && !!jobId)}
        onClick={() => {
          if (!hasTemplateId) return
          setPanelOpen(true)
          generateMutation.mutate(String(templateId), {
            onSuccess: data => {
              setJobId(data.jobId)
            },
          })
        }}
      >
        {generateMutation.isPending || (job?.status === 'running' && !!jobId) ? (
          <>
            <Icon name="loading" className="h-4 w-4 mr-2 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Icon name="sparkles" className="h-4 w-4 mr-2" />
            Generate marketing
          </>
        )}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className={cn(
          'shadow-lg rounded-full px-4 ml-2 bg-background/70',
          marketingRenderDisabled ? 'border-red-500/30 text-red-600 hover:text-red-700' : undefined
        )}
        disabled={!hasTemplateId || setRenderingMutation.isPending}
        onClick={() => {
          if (!hasTemplateId) return
          const id = String(templateId)
          const next = !marketingRenderDisabled
          setMarketingRenderDisabled(next)
          setRenderingMutation.mutate(
            { templateId: id, disabled: next },
            {
              onSuccess: () => {
                router.refresh()
              },
              onError: () => {
                setMarketingRenderDisabled(!next)
              },
            }
          )
        }}
      >
        {marketingRenderDisabled ? (
          <>
            <Icon name="x-circle" className="h-4 w-4 mr-2" />
            Marketing hidden
          </>
        ) : (
          <>
            <Icon name="check-circle" className="h-4 w-4 mr-2" />
            Hide marketing
          </>
        )}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="shadow-lg rounded-full px-4 ml-2 bg-background/70"
        disabled={!hasTemplateId || revalidateMutation.isPending}
        onClick={() => {
          if (!hasTemplateId) return
          revalidateMutation.mutate(String(templateId), {
            onSuccess: () => {
              router.refresh()
            },
          })
        }}
      >
        {revalidateMutation.isPending ? (
          <>
            <Icon name="loading" className="h-4 w-4 mr-2 animate-spin" />
            Revalidating…
          </>
        ) : (
          <>
            <Icon name="rotate-ccw" className="h-4 w-4 mr-2" />
            Revalidate
          </>
        )}
      </Button>

      {job?.status === 'completed' ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn('mt-2 w-full justify-center text-xs text-muted-foreground hover:text-foreground')}
          onClick={() => {
            setPanelOpen(false)
            setJobId(null)
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  )

  return createPortal(node, document.body)
}

