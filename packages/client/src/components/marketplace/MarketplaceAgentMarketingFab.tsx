'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useAuth } from '@/hooks/useAuth'
import { useGenerateAgentTemplateMarketingContent } from '@/hooks/useAdminAgentTemplates'

export function MarketplaceAgentMarketingFab(props: { templateId?: string | null }): React.JSX.Element | null {
  const { templateId } = props
  const router = useRouter()
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const generateMutation = useGenerateAgentTemplateMarketingContent()

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const hasTemplateId = !!(templateId && String(templateId).trim())
  const canShow = Boolean(mounted && isAuthenticated && isInstanceAdmin && hasTemplateId)
  if (!canShow) return null

  const node = (
    <div
      className="fixed right-6 z-[9999] pointer-events-auto"
      style={{
        bottom: `calc(32px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <Button
        size="sm"
        className="shadow-lg rounded-full px-4"
        disabled={generateMutation.isPending}
        onClick={() => {
          if (!hasTemplateId) return
          generateMutation.mutate(String(templateId), {
            onSuccess: () => {
              router.refresh()
            },
          })
        }}
      >
        {generateMutation.isPending ? (
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
    </div>
  )

  return createPortal(node, document.body)
}

