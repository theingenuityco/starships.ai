#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const srcDir = path.join(root, 'src')

// Derive known icon export names by reading the generated compat file
const compatPath = path.join(root, 'src', 'components', 'primitives', 'lucide-compat.tsx')
let knownIcons = new Set()
if (fs.existsSync(compatPath)) {
  const text = fs.readFileSync(compatPath, 'utf8')
  const exportRegex = /export\s+function\s+([A-Za-z0-9_]+)/g
  let m
  while ((m = exportRegex.exec(text))) knownIcons.add(m[1])
}

// Common alias corrections (identifier -> exported icon)
const aliasToExport = new Map([['UserIcon', 'User']])

function walk(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, results)
    else if (full.endsWith('.tsx')) results.push(full)
  }
  return results
}

function getTagNames(text) {
  const regex = /<([A-Z][A-Za-z0-9]*)(?:[\s>\/])/g
  const names = new Set()
  let m
  while ((m = regex.exec(text))) names.add(m[1])
  return names
}

function getIconPropIdentifiers(text) {
  const names = new Set()
  // icon={Identifier}
  const propRegex = /icon\s*=\s*\{\s*([A-Z][A-Za-z0-9]*)\s*\}/g
  let m
  while ((m = propRegex.exec(text))) names.add(m[1])
  // icon: Identifier (object literal)
  const objRegex = /icon\s*:\s*([A-Z][A-Za-z0-9]*)/g
  while ((m = objRegex.exec(text))) names.add(m[1])
  return names
}

function parseExistingLucideImport(text) {
  const m = text.match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/)
  if (!m) return []
  return m[1]
    .split(',')
    .map(s =>
      s
        .trim()
        .split(/\s+as\s+/i)[0]
        .trim()
    )
    .filter(Boolean)
}

function injectImport(text, toImport, aliasPairs) {
  const aliasParts = aliasPairs.map(([from, to]) => `${from} as ${to}`)
  const plainParts = Array.from(toImport)
  const parts = [...plainParts, ...aliasParts]
  const importLine = `import { ${parts.sort().join(', ')} } from 'lucide-react'\n`
  // place after "use client" and any leading comments
  const useClientIdx = text.startsWith("'use client'\n") || text.startsWith('"use client"\n') ? text.indexOf('\n') + 1 : 0
  return text.slice(0, useClientIdx) + importLine + text.slice(useClientIdx)
}

const files = walk(srcDir)
let changed = 0
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  const tags = getTagNames(text)
  const iconProps = getIconPropIdentifiers(text)
  const existing = new Set(parseExistingLucideImport(text))

  const missing = new Set()
  const missingAliases = []

  function consider(name) {
    const exportName = aliasToExport.get(name) || name
    if (aliasToExport.has(name)) {
      // Need alias import if identifier differs from export
      const aliasLocal = name
      const aliasFrom = exportName
      if (!existing.has(aliasFrom) && knownIcons.has(aliasFrom)) {
        missingAliases.push([aliasFrom, aliasLocal])
      }
      return
    }
    if (knownIcons.has(name) && !existing.has(name)) missing.add(name)
  }

  tags.forEach(consider)
  iconProps.forEach(consider)

  if (missing.size > 0 || missingAliases.length > 0) {
    if (existing.size > 0) {
      const newList = new Set([...existing, ...missing])
      // Reconstruct import with potential aliases appended
      const aliasParts = missingAliases.map(([from, to]) => `${from} as ${to}`)
      const importLine = `import { ${Array.from(newList).sort().join(', ')}${aliasParts.length ? ', ' + aliasParts.join(', ') : ''} } from 'lucide-react'`
      text = text.replace(/import\s+\{[^}]+\}\s+from\s+['"]lucide-react['"]/, importLine)
    } else {
      text = injectImport(text, missing, missingAliases)
    }
    fs.writeFileSync(file, text)
    changed++
  }
}
console.log(`Injected/extended lucide-react imports in ${changed} files`)
