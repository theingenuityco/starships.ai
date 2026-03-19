'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'

export function RoomParticipantsButton(props: {
  onClick: () => void
  className?: string
}) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={props.onClick} className={props.className}>
      <Icon name="users" className="h-4 w-4 mr-1" />
      Participants
    </Button>
  )
}

