export function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const AVATAR_COLOURS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-emerald-500',
  'bg-slate-500',
  'bg-rose-500',
  'bg-pink-500',
]

const CHIP_COLOURS = [
  'bg-violet-500/10 text-violet-400 border-violet-500/15',
  'bg-blue-500/10 text-blue-400 border-blue-500/15',
  'bg-cyan-500/10 text-cyan-400 border-cyan-500/15',
  'bg-teal-500/10 text-teal-400 border-teal-500/15',
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
  'bg-slate-500/10 text-slate-400 border-slate-500/15',
  'bg-rose-500/10 text-rose-400 border-rose-500/15',
  'bg-pink-500/10 text-pink-400 border-pink-500/15',
]

function nameHash(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}

export function avatarColour(name: string): string {
  return AVATAR_COLOURS[nameHash(name) % AVATAR_COLOURS.length]!
}

export function agentChipColour(name: string): string {
  return CHIP_COLOURS[nameHash(name) % CHIP_COLOURS.length]!
}

export function durationText(startStr: string | undefined, endStr: string | undefined): string {
  if (!startStr || !endStr) return ''
  const secs = Math.max(0, Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
