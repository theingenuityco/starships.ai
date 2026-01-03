export function formatAgentNameWithRole(name: string | null | undefined, role: string | null | undefined): string {
  const n = typeof name === 'string' ? name.trim() : ''
  const r = typeof role === 'string' ? role.trim() : ''
  if (!n) return r || ''
  return r ? `${n}: ${r}` : n
}

export function formatAgentDisplayName(agent: { name?: string | null; role?: string | null }): string {
  return formatAgentNameWithRole(agent?.name, agent?.role)
}


