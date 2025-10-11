export type ResolvedIcon = { type: 'phosphor'; component: string } | { type: 'radix'; component: string } | { type: 'iconify'; icon: string }

const map: Record<string, ResolvedIcon> = {
  // Controls → Radix
  'chevron-right': { type: 'radix', component: 'ChevronRightIcon' },
  'chevron-left': { type: 'radix', component: 'ChevronLeftIcon' },
  'chevron-down': { type: 'radix', component: 'ChevronDownIcon' },
  'chevron-up': { type: 'radix', component: 'ChevronUpIcon' },

  // Common → Phosphor
  search: { type: 'phosphor', component: 'MagnifyingGlass' },
  user: { type: 'phosphor', component: 'User' },
  settings: { type: 'phosphor', component: 'GearSix' },
  bot: { type: 'phosphor', component: 'Robot' },
  rocket: { type: 'phosphor', component: 'Rocket' },
  sparkles: { type: 'phosphor', component: 'Sparkle' },

  // Navbar / UI common
  store: { type: 'phosphor', component: 'Storefront' },
  key: { type: 'phosphor', component: 'Key' },
  'message-square': { type: 'phosphor', component: 'ChatCircleText' },
  plus: { type: 'phosphor', component: 'Plus' },
  x: { type: 'phosphor', component: 'X' },
  history: { type: 'phosphor', component: 'ClockCounterClockwise' },

  // Animated affordances → Iconify line-md
  loading: { type: 'iconify', icon: 'line-md:loading-twotone-loop' },
}

export function resolveIcon(name: string): ResolvedIcon | undefined {
  return map[name]
}

export function registerIcons(entries: Record<string, ResolvedIcon>) {
  Object.assign(map, entries)
}
