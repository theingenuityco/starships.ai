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

const files = walk(srcDir)
let changed = 0

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  if (!/from\s+['\"]lucide-react['\"]/.test(text)) continue

  // Capture imported icon names
  const importMatch = text.match(/import\s+\{([^}]+)\}\s+from\s+['\"]lucide-react['\"]/)
  if (!importMatch) continue
  const names = importMatch[1]
    .split(',')
    .map(s => s.trim().split(/\s+as\s+/i)[0].trim())
    .filter(Boolean)

  // Ensure Icon import exists at top
  if (!/from\s+['\"]@\/components\/primitives\/Icon['\"]/.test(text)) {
    const useClientIdx = text.startsWith("'use client'\n") || text.startsWith('"use client"\n') ? text.indexOf('\n') + 1 : 0
    text = text.slice(0, useClientIdx) + "import Icon from '@/components/primitives/Icon'\n" + text.slice(useClientIdx)
  }

  // Replace JSX usages <Name ...> with <Icon name="kebab-name" ...>
  for (const n of names) {
    const kebab = n
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
    const openTag = new RegExp(`<${n}(\s|>)`, 'g')
    text = text.replace(openTag, `<Icon name=\"${kebab}\"$1`)
    const selfClose = new RegExp(`<${n}(/>)`, 'g')
    text = text.replace(selfClose, `<Icon name=\"${kebab}\"$1`)
  }

  // Remove lucide-react import
  text = text.replace(/import\s+\{[^}]+\}\s+from\s+['\"]lucide-react['\"];?\n?/, '')

  fs.writeFileSync(file, text)
  changed++
}

console.log(`Rewrote ${changed} files to use Icon wrapper`)


