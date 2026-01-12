'use client'

import Icon from '@/components/primitives/Icon'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PROFILE_SECTION_CARD_CLASS } from './profileCardClasses'
import { useUserPreferencesStore } from '@/store/user-preferences-store'

export function ExpertModeCard(): React.JSX.Element {
  const expertMode = useUserPreferencesStore(s => s.expertMode)
  const setExpertMode = useUserPreferencesStore(s => s.setExpertMode)

  return (
    <Card className={PROFILE_SECTION_CARD_CLASS}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="settings" className="h-4 w-4 text-primary" />
            Expert mode
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="flex items-center justify-center">
                    <Icon name="info" className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[260px] px-3 py-2.5 bg-popover text-popover-foreground border">
                  <p className="text-xs">This will reveal additional controls across the app.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <Switch checked={expertMode} onCheckedChange={setExpertMode} />
        </div>
      </CardHeader>
    </Card>
  )
}

export default ExpertModeCard

