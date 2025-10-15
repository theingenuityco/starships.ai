export type ResolvedIcon = { type: 'phosphor'; component: string } | { type: 'radix'; component: string } | { type: 'iconify'; icon: string }

const map: Record<string, ResolvedIcon> = {
  // Controls → Radix
  'chevron-right': { type: 'radix', component: 'ChevronRightIcon' },
  'chevron-left': { type: 'radix', component: 'ChevronLeftIcon' },
  'chevron-down': { type: 'radix', component: 'ChevronDownIcon' },
  'chevron-up': { type: 'radix', component: 'ChevronUpIcon' },
  'arrow-right': { type: 'radix', component: 'ArrowRightIcon' },
  'arrow-left': { type: 'radix', component: 'ArrowLeftIcon' },

  // Common → Phosphor
  search: { type: 'phosphor', component: 'MagnifyingGlass' },
  user: { type: 'phosphor', component: 'User' },
  settings: { type: 'phosphor', component: 'GearSix' },
  bot: { type: 'phosphor', component: 'Robot' },
  rocket: { type: 'phosphor', component: 'Rocket' },
  sparkles: { type: 'phosphor', component: 'Sparkle' },
  wrench: { type: 'phosphor', component: 'Wrench' },
  'check-circle': { type: 'phosphor', component: 'CheckCircle' },
  wallet: { type: 'phosphor', component: 'Wallet' },
  mail: { type: 'radix', component: 'EnvelopeClosedIcon' },
  'user-cog': { type: 'phosphor', component: 'UserGear' },

  // Navbar / UI common
  store: { type: 'phosphor', component: 'Storefront' },
  key: { type: 'phosphor', component: 'Key' },
  'message-square': { type: 'phosphor', component: 'ChatCircleText' },
  // Send / paper plane
  send: { type: 'phosphor', component: 'PaperPlaneTilt' },
  plus: { type: 'phosphor', component: 'Plus' },
  x: { type: 'phosphor', component: 'X' },
  history: { type: 'phosphor', component: 'ClockCounterClockwise' },
  sun: { type: 'phosphor', component: 'Sun' },
  moon: { type: 'phosphor', component: 'Moon' },

  // Status & help
  'alert-triangle': { type: 'phosphor', component: 'Warning' },
  'help-circle': { type: 'phosphor', component: 'Question' },
  'shield-alert': { type: 'phosphor', component: 'ShieldWarning' },
  lifebuoy: { type: 'phosphor', component: 'Lifebuoy' },

  // Animated affordances → Iconify line-md
  loading: { type: 'iconify', icon: 'line-md:loading-twotone-loop' },
}

export function resolveIcon(name: string): ResolvedIcon | undefined {
  return map[name]
}

export function registerIcons(entries: Record<string, ResolvedIcon>) {
  Object.assign(map, entries)
}
