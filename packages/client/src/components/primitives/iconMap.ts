export type ResolvedIcon = { type: 'phosphor'; component: string } | { type: 'radix'; component: string } | { type: 'iconify'; icon: string }

const map: Record<string, ResolvedIcon> = {
  // Controls → Radix / Phosphor / Iconify
  'chevron-right': { type: 'radix', component: 'ChevronRightIcon' },
  'chevron-left': { type: 'radix', component: 'ChevronLeftIcon' },
  'chevron-down': { type: 'radix', component: 'ChevronDownIcon' },
  'chevron-up': { type: 'radix', component: 'ChevronUpIcon' },
  'arrow-right': { type: 'radix', component: 'ArrowRightIcon' },
  'arrow-left': { type: 'radix', component: 'ArrowLeftIcon' },
  'arrow-down': { type: 'phosphor', component: 'ArrowDown' },
  'arrow-up': { type: 'phosphor', component: 'ArrowUp' },
  // Caret (filled supported via weight)
  'caret-right': { type: 'phosphor', component: 'CaretRight' },
  // Sidebar toggle icon (used for nav collapse/expand)
  sidebar: { type: 'iconify', icon: 'ph:sidebar-simple' },

  // Common → Phosphor
  search: { type: 'phosphor', component: 'MagnifyingGlass' },
  user: { type: 'phosphor', component: 'User' },
  users: { type: 'phosphor', component: 'Users' },
  'user-minus': { type: 'phosphor', component: 'UserMinus' },
  settings: { type: 'phosphor', component: 'GearSix' },
  settings2: { type: 'phosphor', component: 'Gear' },
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
  brain: { type: 'phosphor', component: 'Brain' },
  // Use Iconify for head-circuit to support broader versions
  'head-circuit': { type: 'iconify', icon: 'ph:head-circuit' },
  circle: { type: 'phosphor', component: 'Circle' },
  star: { type: 'phosphor', component: 'Star' },
  stars: { type: 'phosphor', component: 'Stars' },
  heart: { type: 'phosphor', component: 'Heart' },
  info: { type: 'phosphor', component: 'Info' },
  calendar: { type: 'phosphor', component: 'Calendar' },
  clock: { type: 'phosphor', component: 'Clock' },
  percent: { type: 'phosphor', component: 'Percent' },

  // Navbar / UI common
  store: { type: 'phosphor', component: 'Storefront' },
  key: { type: 'phosphor', component: 'Key' },
  'message-square': { type: 'phosphor', component: 'ChatCircleText' },
  'message-circle-more': { type: 'phosphor', component: 'ChatCircleDots' },
  chat: { type: 'phosphor', component: 'Chat' },
  // Send / paper plane
  send: { type: 'phosphor', component: 'PaperPlaneTilt' },
  // Stop (square)
  stop: { type: 'phosphor', component: 'Stop' },
  'stop-circle': { type: 'phosphor', component: 'StopCircle' },
  plus: { type: 'phosphor', component: 'Plus' },
  minus: { type: 'phosphor', component: 'Minus' },
  x: { type: 'phosphor', component: 'X' },
  'x-circle': { type: 'phosphor', component: 'XCircle' },
  history: { type: 'phosphor', component: 'ClockCounterClockwise' },
  sun: { type: 'phosphor', component: 'Sun' },
  moon: { type: 'phosphor', component: 'Moon' },
  'dots-horizontal': { type: 'phosphor', component: 'DotsThree' },
  'dots-vertical': { type: 'phosphor', component: 'DotsThreeVertical' },
  list: { type: 'phosphor', component: 'List' },
  filter: { type: 'phosphor', component: 'Funnel' },
  compass: { type: 'phosphor', component: 'Compass' },
  workflow: { type: 'phosphor', component: 'FlowArrow' },

  // Security & system
  'shield-check': { type: 'phosphor', component: 'ShieldCheck' },
  shield: { type: 'phosphor', component: 'Shield' },
  'file-text': { type: 'phosphor', component: 'FileText' },
  file: { type: 'phosphor', component: 'File' },
  image: { type: 'phosphor', component: 'Image' },
  eye: { type: 'phosphor', component: 'Eye' },
  'eye-off': { type: 'phosphor', component: 'EyeSlash' },
  lock: { type: 'phosphor', component: 'Lock' },
  activity: { type: 'phosphor', component: 'ChartLineUp' },
  plug: { type: 'phosphor', component: 'Plug' },
  fingerprint: { type: 'phosphor', component: 'Fingerprint' },
  bug: { type: 'phosphor', component: 'Bug' },
  database: { type: 'phosphor', component: 'Database' },
  'hard-drive': { type: 'phosphor', component: 'HardDrive' },
  wifi: { type: 'phosphor', component: 'WifiHigh' },
  'wifi-off': { type: 'phosphor', component: 'WifiSlash' },

  // Data & visuals
  'bar-chart3': { type: 'phosphor', component: 'ChartBar' },
  'bar-chart': { type: 'phosphor', component: 'ChartBar' },
  'trending-up': { type: 'phosphor', component: 'TrendUp' },
  globe: { type: 'phosphor', component: 'Globe' },
  code: { type: 'phosphor', component: 'Code' },
  braces: { type: 'phosphor', component: 'CurlyBrackets' },
  'git-branch': { type: 'phosphor', component: 'GitBranch' },
  cog: { type: 'phosphor', component: 'Gear' },
  'edit-3': { type: 'phosphor', component: 'PencilSimpleLine' },
  edit: { type: 'phosphor', component: 'Pencil' },
  pencil: { type: 'phosphor', component: 'PencilSimple' },
  split: { type: 'phosphor', component: 'ArrowsSplit' },
  play: { type: 'phosphor', component: 'Play' },
  pause: { type: 'phosphor', component: 'Pause' },
  zap: { type: 'phosphor', component: 'Lightning' },

  // Commerce & actions
  download: { type: 'phosphor', component: 'DownloadSimple' },
  'user-plus': { type: 'phosphor', component: 'UserPlus' },
  'log-in': { type: 'phosphor', component: 'SignIn' },
  'log-out': { type: 'phosphor', component: 'SignOut' },
  'loader-2': { type: 'radix', component: 'ReloadIcon' },
  'dollar-sign': { type: 'phosphor', component: 'CurrencyDollar' },
  coins: { type: 'phosphor', component: 'Coins' },
  receipt: { type: 'phosphor', component: 'Receipt' },
  'credit-card': { type: 'phosphor', component: 'CreditCard' },
  trash: { type: 'phosphor', component: 'Trash' },
  unlink: { type: 'phosphor', component: 'LinkBreak' },
  refresh: { type: 'phosphor', component: 'ArrowClockwise' },
  'rotate-ccw': { type: 'phosphor', component: 'ArrowCounterClockwise' },
  repeat: { type: 'phosphor', component: 'ArrowsClockwise' },
  archive: { type: 'phosphor', component: 'Archive' },
  package: { type: 'phosphor', component: 'Package' },
  paperclip: { type: 'phosphor', component: 'Paperclip' },
  mic: { type: 'phosphor', component: 'Microphone' },
  headphones: { type: 'phosphor', component: 'Headphones' },
  palette: { type: 'phosphor', component: 'Palette' },
  'test-tube': { type: 'phosphor', component: 'TestTube' },

  // Health & info
  'alert-circle': { type: 'phosphor', component: 'WarningCircle' },
  lightbulb: { type: 'phosphor', component: 'Lightbulb' },
  'heart-pulse': { type: 'phosphor', component: 'Heartbeat' },

  // Status & help
  'alert-triangle': { type: 'phosphor', component: 'Warning' },
  'help-circle': { type: 'phosphor', component: 'Question' },
  'shield-alert': { type: 'phosphor', component: 'ShieldWarning' },
  lifebuoy: { type: 'phosphor', component: 'Lifebuoy' },
  'id-card': { type: 'phosphor', component: 'IdentificationCard' },

  // Animated affordances → Iconify line-md
  loading: { type: 'iconify', icon: 'line-md:loading-twotone-loop' },

  // External/action affordances
  'external-link': { type: 'radix', component: 'ExternalLinkIcon' },
  copy: { type: 'radix', component: 'CopyIcon' },
  book: { type: 'phosphor', component: 'Book' },
  menu: { type: 'radix', component: 'HamburgerMenuIcon' },
  // Social
  discord: { type: 'phosphor', component: 'DiscordLogo' },
  github: { type: 'phosphor', component: 'GithubLogo' },
  chrome: { type: 'phosphor', component: 'GoogleChromeLogo' },
}

export function resolveIcon(name: string): ResolvedIcon | undefined {
  return map[name]
}

export function registerIcons(entries: Record<string, ResolvedIcon>) {
  Object.assign(map, entries)
}
