export function getAtPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path.split('.').filter(Boolean)
  let cur: any = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

export function setAtPath<T extends Record<string, any>>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.').filter(Boolean)
  if (parts.length === 0) return obj

  const out: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) }
  let cur: any = out
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]
    if (i === parts.length - 1) {
      cur[key] = value
      break
    }
    const next = cur[key]
    const nextObj = next && typeof next === 'object' ? (Array.isArray(next) ? [...next] : { ...next }) : {}
    cur[key] = nextObj
    cur = nextObj
  }
  return out
}

