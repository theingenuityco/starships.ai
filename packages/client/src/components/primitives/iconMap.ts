export type ResolvedIcon = { type: 'phosphor'; component: string } | { type: 'radix'; component: string } | { type: 'iconify'; icon: string }

const map: Record<string, ResolvedIcon> = {
  // Controls → Radix
  'chevron-right': { type: 'radix', component: 'ChevronRightIcon' },
  'chevron-left': { type: 'radix', component: 'ChevronLeftIcon' },
  'chevron-down': { type: 'radix', component: 'ChevronDownIcon' },
  'chevron-up': { type: 'radix', component: 'ChevronUpIcon' },
  'arrow-right': { type: 'radix', component: 'ArrowRightIcon' },
  'arrow-left': { type: 'radix', component: 'ArrowLeftIcon' },
  // Caret (filled supported via weight)
  'caret-right': { type: 'phosphor', component: 'CaretRight' },

  // Common → Phosphor
  search: { type: 'phosphor', component: 'MagnifyingGlass' },
  user: { type: 'phosphor', component: 'User' },
  settings: { type: 'phosphor', component: 'GearSix' },
  bot: { type: 'phosphor', component: 'Robot' },
  rocket: { type: 'phosphor', component: 'Rocket' },
  'rocket-launch': { type: 'phosphor', component: 'RocketLaunch' },
  sparkles: { type: 'phosphor', component: 'Sparkle' },
  wrench: { type: 'phosphor', component: 'Wrench' },
  'check-circle': { type: 'phosphor', component: 'CheckCircle' },
  check: { type: 'phosphor', component: 'Check' },
  wallet: { type: 'phosphor', component: 'Wallet' },
  mail: { type: 'radix', component: 'EnvelopeClosedIcon' },
  'user-cog': { type: 'phosphor', component: 'UserGear' },
  tag: { type: 'phosphor', component: 'Tag' },
  cpu: { type: 'phosphor', component: 'Brain' },
  // Use Iconify for head-circuit to support broader versions
  'head-circuit': { type: 'iconify', icon: 'ph:head-circuit' },

  // Navbar / UI common
  store: { type: 'phosphor', component: 'Storefront' },
  key: { type: 'phosphor', component: 'Key' },
  'message-square': { type: 'phosphor', component: 'ChatCircleText' },
  // Send / paper plane
  send: { type: 'phosphor', component: 'PaperPlaneTilt' },
  // Stop (square)
  stop: { type: 'phosphor', component: 'Stop' },
  plus: { type: 'phosphor', component: 'Plus' },
  x: { type: 'phosphor', component: 'X' },
  history: { type: 'phosphor', component: 'ClockCounterClockwise' },
  sun: { type: 'phosphor', component: 'Sun' },
  moon: { type: 'phosphor', component: 'Moon' },

  // Security & system
  'shield-check': { type: 'phosphor', component: 'ShieldCheck' },
  'file-text': { type: 'phosphor', component: 'FileText' },
  eye: { type: 'phosphor', component: 'Eye' },
  'eye-off': { type: 'phosphor', component: 'EyeSlash' },
  lock: { type: 'phosphor', component: 'Lock' },
  activity: { type: 'phosphor', component: 'ChartLineUp' },
  plug: { type: 'phosphor', component: 'Plug' },

  // Data & visuals
  'bar-chart3': { type: 'phosphor', component: 'ChartBar' },
  globe: { type: 'phosphor', component: 'Globe' },
  code: { type: 'phosphor', component: 'Code' },
  'git-branch': { type: 'phosphor', component: 'GitBranch' },
  cog: { type: 'phosphor', component: 'Gear' },
  'edit-3': { type: 'phosphor', component: 'PencilSimpleLine' },
  split: { type: 'phosphor', component: 'ArrowsSplit' },
  play: { type: 'phosphor', component: 'Play' },
  zap: { type: 'phosphor', component: 'Lightning' },

  // Commerce & actions
  download: { type: 'phosphor', component: 'DownloadSimple' },
  'user-plus': { type: 'phosphor', component: 'UserPlus' },
  'log-in': { type: 'phosphor', component: 'SignIn' },
  'loader-2': { type: 'radix', component: 'ReloadIcon' },

  // Health & info
  'alert-circle': { type: 'phosphor', component: 'WarningCircle' },
  lightbulb: { type: 'phosphor', component: 'Lightbulb' },
  'heart-pulse': { type: 'phosphor', component: 'Heartbeat' },

  // Status & help
  'alert-triangle': { type: 'phosphor', component: 'Warning' },
  'help-circle': { type: 'phosphor', component: 'Question' },
  'shield-alert': { type: 'phosphor', component: 'ShieldWarning' },
  lifebuoy: { type: 'phosphor', component: 'Lifebuoy' },

  // Animated affordances → Iconify line-md
  loading: { type: 'iconify', icon: 'line-md:loading-twotone-loop' },

  // External/action affordances
  'external-link': { type: 'radix', component: 'ExternalLinkIcon' },
  copy: { type: 'radix', component: 'CopyIcon' },
  book: { type: 'phosphor', component: 'Book' },
  menu: { type: 'radix', component: 'HamburgerMenuIcon' },
}

export function resolveIcon(name: string): ResolvedIcon | undefined {
  return map[name]
}

export function registerIcons(entries: Record<string, ResolvedIcon>) {
  Object.assign(map, entries)
}
