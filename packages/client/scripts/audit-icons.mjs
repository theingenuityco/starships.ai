#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const srcDir = path.join(root, 'src')
const outFile = path.join(root, 'scripts', 'icon-usage.json')

/**
 * Recursively walk a directory and return file paths with given extensions
 */
function walk(dir, exts, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, exts, results)
    } else if (exts.includes(path.extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

const files = walk(srcDir, ['.ts', '.tsx'])
const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']lucide-react["']/g
const usage = {}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  let match
  while ((match = importRegex.exec(text))) {
    const names = match[1]
      .split(',')
      .map(s =>
        s
          .trim()
          .split(/\s+as\s+/i)[0]
          .trim()
      )
      .filter(Boolean)
    for (const n of names) {
      usage[n] = (usage[n] || 0) + 1
    }
  }
}

const sorted = Object.entries(usage)
  .sort((a, b) => b[1] - a[1])
  .reduce((acc, [k, v]) => ((acc[k] = v), acc), {})

fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2))
console.log(`Wrote ${Object.keys(sorted).length} icons -> ${outFile}`)
