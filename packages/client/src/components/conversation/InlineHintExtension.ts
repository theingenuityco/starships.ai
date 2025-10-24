import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import { Node as PMNode } from '@tiptap/pm/model'

export interface InlineHintOptions {
  getPrompts: () => string[]
  getEnabled: () => boolean
  typingSpeedMs?: number
  pauseMs?: number
  debug?: boolean
}

export const InlineHintExtension = Extension.create<InlineHintOptions>({
  name: 'inlineHint',

  addOptions() {
    return {
      getPrompts: () => [],
      getEnabled: () => true,
      typingSpeedMs: 55,
      pauseMs: 1100,
      debug: false,
    }
  },

  addProseMirrorPlugins() {
    const key = new PluginKey('inlineHint')
    const { getPrompts, getEnabled, typingSpeedMs, pauseMs, debug } = this.options

    return [
      new Plugin<{
        decorations: DecorationSet
        idx: number
        char: number
        lastTick: number
        lastReason?: string
        promptsSig?: string
      }>({
        key,
        state: {
          init: () => ({ decorations: DecorationSet.empty, idx: 0, char: 0, lastTick: 0, promptsSig: '' }),
          apply: (tr: Transaction, prev, _old: EditorState, state: EditorState) => {
            let { decorations, idx, char, lastTick, lastReason, promptsSig } = prev

            // Recompute every transaction
            const enabled = getEnabled()
            const prompts = getPrompts() || []
            const nextSig = Array.isArray(prompts) ? prompts.join('\n') : ''
            if (!enabled || prompts.length === 0) {
              const reason = `enabled=${enabled} prompts=${prompts.length}`
              if (debug && reason !== lastReason) console.debug('[InlineHint] hidden: ' + reason)
              return { decorations: DecorationSet.empty, idx: 0, char: 0, lastTick: 0, lastReason: reason, promptsSig: nextSig }
            }

            // Reset animation if prompt list changed (e.g., agent switched)
            if (nextSig !== promptsSig) {
              idx = 0
              char = 0
              lastTick = 0
              promptsSig = nextSig
              if (debug) console.debug('[InlineHint] prompts changed, resetting animation')
            }

            // Detect if content is only a leading mention node plus optional whitespace text, and compute anchor
            let onlyMention = false
            let anchorPos = 1
            try {
              const doc = state.doc
              const firstBlock = doc.firstChild
              if (firstBlock && firstBlock.type.name === 'paragraph') {
                let mentionFound = false
                let firstMentionLocalPos = 0
                let firstMentionSize = 0
                let textAfterMention = ''
                let seenMention = false
                firstBlock.descendants((node: PMNode, pos: number) => {
                  if (!mentionFound && node.type && node.type.name === 'mention') {
                    mentionFound = true
                    firstMentionLocalPos = pos
                    firstMentionSize = node.nodeSize
                    seenMention = true
                    return true
                  }
                  if (node.isText && seenMention) {
                    textAfterMention += node.text || ''
                  }
                  return true
                })
                if (mentionFound) {
                  const cleaned = (textAfterMention || '').replace(/[\s\u200B\u200C\u200D\uFEFF]/g, '')
                  onlyMention = cleaned.length === 0
                  // Anchor is directly after the mention node: docPos = 1 + localPos + nodeSize
                  anchorPos = 1 + firstMentionLocalPos + firstMentionSize
                  // If there is a single space text node immediately after mention, advance one char
                  try {
                    const nextChar = state.doc.textBetween(anchorPos, anchorPos + 1, undefined, '\uFFFC')
                    if (nextChar === ' ') {
                      anchorPos = anchorPos + 1
                    }
                  } catch {}
                }
              }
            } catch (e) {
              if (debug) console.debug('[InlineHint] error scanning doc', e)
            }
            if (!onlyMention) {
              const reason = 'not only mention'
              if (debug && reason !== lastReason) console.debug('[InlineHint] hidden: ' + reason)
              return { decorations: DecorationSet.empty, idx: 0, char: 0, lastTick: 0, lastReason: reason }
            }

            // Typing animation state advance (time-based)
            const now = Date.now()
            const current = String(prompts[idx % prompts.length] || '')
            const advance = now - (lastTick || 0) >= (char < current.length ? typingSpeedMs! : pauseMs!)
            if (advance) {
              if (char < current.length) {
                char += 1
              } else {
                char = 0
                idx = (idx + 1) % prompts.length
              }
              lastTick = now
            }

            const shown = current.slice(0, char)
            const span = document.createElement('span')
            span.className = 'inline-hint text-muted-foreground/80'
            // Allow wrapping within the editor flow
            span.style.whiteSpace = 'pre-wrap'
            span.style.wordBreak = 'break-word'
            span.style.maxWidth = '100%'
            span.textContent = shown

            const deco = Decoration.widget(anchorPos, span, { side: 1 })
            decorations = DecorationSet.empty.add(state.doc, [deco])
            return { decorations, idx, char, lastTick, lastReason: 'showing', promptsSig }
          },
        },
        props: {
          decorations(state: EditorState) {
            const s = key.getState(state)
            return s?.decorations || DecorationSet.empty
          },
        },
        view: (editorView: EditorView) => {
          let raf: number | null = null
          const tick = () => {
            // Trigger re-apply to advance animation
            editorView.dispatch(editorView.state.tr)
            raf = window.setTimeout(tick, 65)
          }
          raf = window.setTimeout(tick, 65)
          return {
            destroy() {
              if (raf) {
                clearTimeout(raf)
                raf = null
              }
            },
          }
        },
      }),
    ]
  },
})
