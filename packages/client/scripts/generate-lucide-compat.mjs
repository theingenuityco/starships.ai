#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const srcDir = path.join(root, 'src')
const usagePath = path.join(root, 'scripts', 'icon-usage.json')
const mapPath = path.join(root, 'scripts', 'lucide-name-map.json')
const outPath = path.join(root, 'src', 'components', 'primitives', 'lucide-compat.tsx')

const baseMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'))

function walk(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, results)
    else if (full.endsWith('.tsx')) results.push(full)
  }
  return results
}

function collectNamesFromUsage() {
  const names = new Set()
  if (fs.existsSync(usagePath)) {
    const usage = JSON.parse(fs.readFileSync(usagePath, 'utf8'))
    Object.keys(usage).forEach(n => names.add(n))
  }
  return names
}

function toKebab(pascal) {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

const names = collectNamesFromUsage()
// Merge with base map keys to ensure all known are present
Object.keys(baseMap).forEach(n => names.add(n))

// Build final name->canonical map
const map = {}
for (const n of names) {
  map[n] = baseMap[n] || toKebab(n)
}

const header = `import React from 'react'
import Icon from '@/components/primitives/Icon'

type Props = React.HTMLAttributes<HTMLElement> & { size?: number | string }

function toSize(props: any) {
  const { className, size, ...rest } = props || {}
  // Allow Tailwind width/height classes to control size; otherwise use size or CSS variable
  const finalSize = size ?? undefined
  return { finalSize, restProps: { className, ...rest } }
}

`

let body = ''
for (const [orig, canonical] of Object.entries(map)) {
  body += `export function ${orig}(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="${canonical}" size={finalSize} {...restProps} /> }\n`
}

const content = header + body
fs.writeFileSync(outPath, content)
console.log(`Generated ${outPath} with ${Object.keys(map).length} exports`)
