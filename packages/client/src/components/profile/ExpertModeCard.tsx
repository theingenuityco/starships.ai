'use client'

import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { PROFILE_SECTION_CARD_CLASS } from './profileCardClasses'
import { useUserPreferencesStore } from '@/store/user-preferences-store'

export function ExpertModeCard(): React.JSX.Element {
  const expertMode = useUserPreferencesStore(s => s.expertMode)
  const setExpertMode = useUserPreferencesStore(s => s.setExpertMode)

  return (
    <Card className={PROFILE_SECTION_CARD_CLASS}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="settings" className="h-4 w-4 text-primary" />
          Expert mode
        </CardTitle>
        <CardDescription className="text-sm">Enable advanced UI components (for power users).</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">Enable expert mode</div>
          <div className="text-xs text-muted-foreground">This will reveal additional controls across the app.</div>
        </div>
        <Switch checked={expertMode} onCheckedChange={setExpertMode} />
      </CardContent>
    </Card>
  )
}

export default ExpertModeCard

