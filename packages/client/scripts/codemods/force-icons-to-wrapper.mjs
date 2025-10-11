#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../')
const srcRoot = path.join(repoRoot, 'src')

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

function kebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

// Common Lucide name overrides to our kebab-case names
const overrides = new Map([
  ['UserIcon', 'user'],
  ['Trash2', 'trash'],
  ['CheckCircle2', 'check-circle'],
  ['MoreHorizontal', 'more-horizontal'],
  ['MoreVertical', 'more-vertical'],
  ['Edit3', 'edit-3'],
  ['BarChart2', 'bar-chart'],
  ['BarChart3', 'bar-chart3'],
  ['TestTube', 'test-tube'],
  ['RefreshCw', 'refresh'],
  ['RotateCcw', 'rotate-ccw'],
  ['ExternalLink', 'external-link'],
  ['EyeOff', 'eye-off'],
  ['XCircle', 'x-circle'],
  ['MessageCircleMore', 'message-circle-more'],
  ['LogIn', 'log-in'],
  ['LogOut', 'log-out'],
  ['WifiOff', 'wifi-off'],
  ['ChevronDown', 'chevron-down'],
  ['ChevronUp', 'chevron-up'],
  ['ChevronLeft', 'chevron-left'],
  ['ChevronRight', 'chevron-right'],
])

// Heuristic: candidate icon identifiers (starts with capital letter and no dot)
const candidateTag = /<(\w+)(\s[^>]*?)?\s*\/?>(?![^<]*<\/\1>)/g
const candidateOpen = /<(\w+)(\s[^>]*?)?>/g

function ensureIconImport(text) {
  if (/from\s+['\"]@\/components\/primitives\/Icon['\"]/.test(text)) return text
  const useClientHeader = text.startsWith("'use client'\n") || text.startsWith('"use client"\n')
  const idx = useClientHeader ? text.indexOf('\n') + 1 : 0
  return text.slice(0, idx) + "import Icon from '@/components/primitives/Icon'\n" + text.slice(idx)
}

function toName(id) {
  return overrides.get(id) || kebabCase(id)
}

let filesChanged = 0
for (const file of walk(srcRoot)) {
  let text = fs.readFileSync(file, 'utf8')
  const original = text

  // Replace JSX self-closing tags
  text = text.replace(candidateTag, (m, tag, attrs = '') => {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(tag)) return m
    // Skip common React/Next components
    if (['Link', 'Image', 'Head', 'Html', 'Main', 'NextScript', 'Script', 'Fragment'].includes(tag)) return m
    // Avoid replacing our own Icon
    if (tag === 'Icon') return m
    const name = toName(tag)
    // Add spacing before attrs if needed
    const space = attrs && !/^\s/.test(attrs) ? ' ' : ''
    return `<Icon name=\"${name}\"${space}${attrs?.trim() || ''} />`
  })

  // Replace paired tags
  // First replace openings
  const openings = []
  text = text.replace(candidateOpen, (m, tag, attrs = '') => {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(tag)) return m
    if (['Link', 'Image', 'Head', 'Html', 'Main', 'NextScript', 'Script', 'Fragment', 'Icon'].includes(tag)) return m
    openings.push(tag)
    const name = toName(tag)
    const space = attrs && !/^\s/.test(attrs) ? ' ' : ''
    return `<Icon name=\"${name}\"${space}${attrs?.trim() || ''}>`
  })
  // Then replace closings for those tags
  for (const tag of new Set(openings)) {
    const reClose = new RegExp(`</${tag}>`, 'g')
    text = text.replace(reClose, '</Icon>')
  }

  // icon prop replacements
  text = text.replace(/icon=\{\s*([A-Z][A-Za-z0-9]*)\s*\}/g, (_, id) => `icon=\"${toName(id)}\"`)
  text = text.replace(/icon\s*:\s*([A-Z][A-Za-z0-9]*)\b/g, (_, id) => `icon: '${toName(id)}'`)

  if (text !== original) {
    text = ensureIconImport(text)
    // Remove lucide imports if any lingering
    text = text.replace(/import\s+\{[^}]*\}\s+from\s+['\"]lucide-react['\"];?\n?/g, '')
    fs.writeFileSync(file, text)
    filesChanged++
  }
}

console.log(`Updated ${filesChanged} files to use Icon wrapper`)
