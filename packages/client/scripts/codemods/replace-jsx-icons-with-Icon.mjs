#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const srcDir = path.join(root, 'src')

function walk(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, results)
    else if (full.endsWith('.tsx')) results.push(full)
  }
  return results
}

function kebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

const files = walk(srcDir)
let changed = 0

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  const importMatch = text.match(/import\s+\{([^}]+)\}\s+from\s+['\"]lucide-react['\"]/)
  if (!importMatch) continue

  const raw = importMatch[1]
  const names = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.split(/\s+as\s+/i)[0].trim())
    .filter(Boolean)

  // Ensure Icon import present at top just after 'use client'
  if (!/from\s+['\"]@\/components\/primitives\/Icon['\"]/.test(text)) {
    const useClientIdx = text.startsWith("'use client'\n") || text.startsWith('"use client"\n') ? text.indexOf('\n') + 1 : 0
    text = text.slice(0, useClientIdx) + "import Icon from '@/components/primitives/Icon'\n" + text.slice(useClientIdx)
  }

  for (const n of names) {
    const kebab = kebabCase(n)
    // Replace self-closing
    const selfClosing = new RegExp(`<${n}(\s[^>]*?)?\s*/>`, 'g')
    text = text.replace(selfClosing, (m, attrs = '') => `<Icon name=\"${kebab}\"${attrs || ''} />`)

    // Replace opening tag
    const opening = new RegExp(`<${n}(\s[^>]*?)?>`, 'g')
    const closing = new RegExp(`</${n}>`, 'g')
    if (opening.test(text)) {
      text = text.replace(opening, (m, attrs = '') => `<Icon name=\"${kebab}\"${attrs || ''}>`)
      text = text.replace(closing, '</Icon>')
    }

    // Replace object property icon: Name -> 'kebab'
    const propIcon = new RegExp(`icon\s*:\s*${n}\b`, 'g')
    text = text.replace(propIcon, `icon: '${kebab}'`)

    // Replace JSX prop icon={Name} -> icon="kebab"
    const jsxPropIcon = new RegExp(`icon=\{\s*${n}\s*\}`, 'g')
    text = text.replace(jsxPropIcon, `icon=\"${kebab}\"`)
  }

  // Remove lucide import
  text = text.replace(/import\s+\{[^}]+\}\s+from\s+['\"]lucide-react['\"];?\n?/, '')

  fs.writeFileSync(file, text)
  changed++
}

console.log(`Replaced lucide JSX with Icon in ${changed} files`)
