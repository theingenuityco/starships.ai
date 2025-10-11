#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const srcDir = path.join(root, 'src')
const mapPath = path.join(root, 'scripts', 'lucide-name-map.json')
const iconImportPath = '@/components/primitives/Icon'

const nameMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'))

function walk(dir, exts, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, exts, results)
    else if (exts.includes(path.extname(entry.name))) results.push(full)
  }
  return results
}

function replaceInFile(file) {
  let text = fs.readFileSync(file, 'utf8')
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']lucide-react["']/
  if (!importRegex.test(text)) return false

  const match = text.match(importRegex)
  if (!match) return false

  const imported = match[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const localNameToCanonical = {}
  for (const imp of imported) {
    const [orig, alias] = imp.split(/\s+as\s+/i).map(s => s.trim())
    const local = alias || orig
    const canonical = nameMap[orig] || orig.replace(/[A-Z]/g, (m, i) => (i ? '-' + m.toLowerCase() : m.toLowerCase()))
    localNameToCanonical[local] = canonical
  }

  // Remove lucide import
  text = text.replace(importRegex, '')

  // Ensure Icon import exists
  const hasIconImport = /from\s+["']@\/components\/primitives\/Icon["']/.test(text)
  if (!hasIconImport) {
    text = `import Icon from '${iconImportPath}'\n` + text
  }

  // Replace JSX usages <Name .../> with <Icon name="canonical" .../>
  for (const [local, canonical] of Object.entries(localNameToCanonical)) {
    const jsxRegex = new RegExp(`<${local}(\n|\r|\s|\/|>)`, 'g')
    text = text.replace(jsxRegex, `<Icon name=\"${canonical}\"$1`)
  }

  fs.writeFileSync(file, text)
  return true
}

const files = walk(srcDir, ['.ts', '.tsx'])
let changed = 0
for (const f of files) {
  if (replaceInFile(f)) changed++
}
console.log(`Updated ${changed} files`)


