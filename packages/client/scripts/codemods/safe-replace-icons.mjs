#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../')
const srcRoot = path.join(repoRoot, 'src')
const nameMapPath = path.join(repoRoot, 'scripts', 'lucide-name-map.json')

const nameMap = JSON.parse(fs.readFileSync(nameMapPath, 'utf8'))
const iconNames = Object.keys(nameMap)

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

function ensureIconImport(text) {
  if (/from\s+['\"]@\/components\/primitives\/Icon['\"]/.test(text)) return text
  // Place after 'use client' if present, else at top
  const useClientHeader = text.startsWith("'use client'\n") || text.startsWith('"use client"\n')
  const idx = useClientHeader ? text.indexOf('\n') + 1 : 0
  return text.slice(0, idx) + "import Icon from '@/components/primitives/Icon'\n" + text.slice(idx)
}

function replaceInFile(text) {
  let changed = false

  // Remove lucide-react imports entirely
  const beforeImport = text
  text = text.replace(/import\s+\{[^}]*\}\s+from\s+['\"]lucide-react['\"];?\n?/g, '')
  if (text !== beforeImport) changed = true

  for (const Name of iconNames) {
    const mapped = nameMap[Name]

    // Replace self-closing tags: <Name ... />
    const reSelf = new RegExp(`<${Name}(\\s[^>]*?)?\\s*/>`, 'g')
    const prevSelf = text
    text = text.replace(reSelf, (m, attrs = '') => `<Icon name=\"${mapped}\"${attrs || ''} />`)
    if (text !== prevSelf) changed = true

    // Replace paired tags <Name ...>...</Name>
    const reOpen = new RegExp(`<${Name}(\\s[^>]*?)?>`, 'g')
    const reClose = new RegExp(`</${Name}>`, 'g')
    let opened = false
    const prevOpen = text
    text = text.replace(reOpen, (m, attrs = '') => {
      opened = true
      return `<Icon name=\"${mapped}\"${attrs || ''}>`
    })
    if (opened) {
      const prevClose = text
      text = text.replace(reClose, '</Icon>')
      if (text !== prevOpen || text !== prevClose) changed = true
    }

    // Replace icon prop values: icon={Name}
    const reJsxProp = new RegExp(`icon=\\{\\s*${Name}\\s*\\}`, 'g')
    const prevJsxProp = text
    text = text.replace(reJsxProp, `icon=\"${mapped}\"`)
    if (text !== prevJsxProp) changed = true

    // Replace object property values: icon: Name
    const reObjProp = new RegExp(`icon\\s*:\\s*${Name}\\b`, 'g')
    const prevObjProp = text
    text = text.replace(reObjProp, `icon: '${mapped}'`)
    if (text !== prevObjProp) changed = true
  }

  if (changed) text = ensureIconImport(text)
  return { text, changed }
}

const files = walk(srcRoot)
let totalChanged = 0
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  const { text: newText, changed } = replaceInFile(text)
  if (changed) {
    fs.writeFileSync(file, newText)
    totalChanged++
  }
}

console.log(`Updated ${totalChanged} files with Icon wrapper replacements`)
