import { createContext, useContext } from 'react'

export type TurnHoverContextValue = {
  isTurnHovered: boolean
  mobileActionsOpen: boolean
  setMobileActionsOpen: (v: boolean) => void
}

export const TurnHoverContext = createContext<TurnHoverContextValue>({
  isTurnHovered: false,
  mobileActionsOpen: false,
  setMobileActionsOpen: () => {},
})

export function useTurnHover() {
  return useContext(TurnHoverContext)
}
