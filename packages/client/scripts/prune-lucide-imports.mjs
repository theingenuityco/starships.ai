#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const srcDir = path.join(root, 'src')
const compatPath = path.join(root, 'src', 'components', 'primitives', 'lucide-compat.tsx')

if (!fs.existsSync(compatPath)) {
  console.error('Compat file not found:', compatPath)
  process.exit(1)
}

// Build allowed icon name set from compat exports
const compatText = fs.readFileSync(compatPath, 'utf8')
const exportRegex = /export\s+function\s+([A-Za-z0-9_]+)/g
const allowed = new Set()
let m
while ((m = exportRegex.exec(compatText))) {
  allowed.add(m[1])
}

function walk(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, results)
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) results.push(full)
  }
  return results
}

const files = walk(srcDir)
let changed = 0

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g
  let any = false
  text = text.replace(importPattern, (_full, inner) => {
    const names = inner
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const filtered = []
    for (const part of names) {
      const [orig, alias] = part.split(/\s+as\s+/i).map(s => s.trim())
      // keep only if the original symbol is an allowed icon name
      if (allowed.has(orig)) filtered.push(part)
    }

    any = any || names.length !== filtered.length

    if (filtered.length === 0) {
      // Remove the whole import by returning empty string
      return ''
    }
    return `import { ${filtered.join(', ')} } from 'lucide-react'`
  })

  if (any) {
    fs.writeFileSync(file, text)
    changed++
  }
}

console.log(`Pruned lucide-react imports in ${changed} files`)
