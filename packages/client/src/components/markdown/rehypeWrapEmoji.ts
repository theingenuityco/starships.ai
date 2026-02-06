/**
 * Rehype plugin that wraps emoji graphemes in a <span class="emoji-inline">…</span>
 * so we can slightly scale emojis in otherwise normal text.
 *
 * Important:
 * - Skips code-ish nodes (<pre>, <code>, <kbd>, <samp>) so code stays exact.
 * - Uses Intl.Segmenter (grapheme) when available to avoid splitting ZWJ emojis.
 */
type HastText = {
  type: 'text'
  value: string
}

type HastElement = {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: HastNode[]
}

type HastNode = HastText | HastElement

type HastRoot = {
  type: 'root'
  children: HastNode[]
}

// `Intl.Segmenter` typing is not always enabled in TS lib configs; keep this `any` to avoid requiring `es2022.intl`.
const GRAPHEME_SEGMENTER: any =
  typeof Intl !== 'undefined' && typeof (Intl as any)?.Segmenter === 'function' ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null

function splitGraphemes(input: string): string[] {
  const s = String(input ?? '')
  if (!s) return []
  if (!GRAPHEME_SEGMENTER) return Array.from(s)
  return Array.from(GRAPHEME_SEGMENTER.segment(s), (x: any) => String(x?.segment ?? ''))
}

const RE_EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u
const RE_FLAG = /^\p{Regional_Indicator}{2}$/u
const RE_KEYCAP = /^[0-9#*]\uFE0F?\u20E3$/u
const RE_QUICK_HAS_EMOJI = /(\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3)/u

function isEmojiGrapheme(grapheme: string): boolean {
  const g = String(grapheme ?? '')
  if (!g) return false
  if (RE_FLAG.test(g)) return true
  if (RE_KEYCAP.test(g)) return true
  return RE_EXTENDED_PICTOGRAPHIC.test(g)
}

function wrapEmojisInTextNode(value: string): HastNode[] | null {
  const v = String(value ?? '')
  if (!v) return null
  if (!RE_QUICK_HAS_EMOJI.test(v)) return null

  const graphemes = splitGraphemes(v)
  let sawEmoji = false
  let buf = ''
  const out: HastNode[] = []

  const flushBuf = () => {
    if (!buf) return
    out.push({ type: 'text', value: buf })
    buf = ''
  }

  for (const g of graphemes) {
    if (isEmojiGrapheme(g)) {
      sawEmoji = true
      flushBuf()
      out.push({
        type: 'element',
        tagName: 'span',
        properties: { className: ['emoji-inline'] },
        children: [{ type: 'text', value: g }],
      })
    } else {
      buf += g
    }
  }

  flushBuf()
  return sawEmoji ? out : null
}

function visit(node: HastRoot | HastElement | HastText | null | undefined, args: { inCode: boolean }): void {
  if (!node || typeof node !== 'object' || !('type' in node)) return
  if (node.type === 'text') return

  const children = (node as HastRoot | HastElement).children
  if (!Array.isArray(children)) return

  const nodeTag = (node as HastElement).tagName
  const nextInCode = args.inCode || nodeTag === 'pre' || nodeTag === 'code' || nodeTag === 'kbd' || nodeTag === 'samp'

  // Walk backwards so splice replacement doesn't affect upcoming indices.
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    if (!child || typeof child !== 'object') continue

    if (child.type === 'text') {
      if (nextInCode) continue
      const next = wrapEmojisInTextNode((child as HastText).value)
      if (!next) continue
      children.splice(i, 1, ...next)
      continue
    }

    visit(child as HastElement, { inCode: nextInCode })
  }
}

export function rehypeWrapEmoji() {
  return (tree: HastRoot) => {
    if (!tree || typeof tree !== 'object' || !Array.isArray((tree as { children?: unknown }).children)) return
    visit(tree as HastRoot, { inCode: false })
  }
}

