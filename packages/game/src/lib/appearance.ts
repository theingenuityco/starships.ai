import { cyrb53, hashToHex53 } from './hash'

export type AppearanceKeyArgs = {
  agentId: string
  avatarAttachmentId: string | null | undefined
  styleId: string
  modelVersion: string
  generatorVersion: string
}

export function deriveAgentAppearanceKey(args: AppearanceKeyArgs): string {
  const agentId = String(args.agentId || '').trim()
  const avatar = String(args.avatarAttachmentId || '').trim()
  const styleId = String(args.styleId || '').trim() || 'default'
  const modelVersion = String(args.modelVersion || '').trim() || 'unknown'
  const generatorVersion = String(args.generatorVersion || '').trim() || 'v1'
  const key = `${agentId}:${avatar}:${styleId}:${modelVersion}:${generatorVersion}`
  return hashToHex53(cyrb53(key, 0))
}

export function deriveRoomSeed(roomConversationId: string, generatorVersion: string = 'v1'): string {
  const id = String(roomConversationId || '').trim()
  const v = String(generatorVersion || '').trim() || 'v1'
  return hashToHex53(cyrb53(`${id}:${v}`, 1337))
}

export function colorFromAppearanceKey(appearanceKey: string | null | undefined): string {
  const key = String(appearanceKey || '').trim()
  if (!key) return '#64748b'
  const n = cyrb53(key, 42)
  const hue = n % 360
  // pleasant mid-sat mid-light
  return `hsl(${hue} 65% 55%)`
}

