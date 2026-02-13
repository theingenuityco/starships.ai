export function pickToolLeftIcon(name: string): { name: string; title: string } {
  const hay = String(name || '').toLowerCase()

  if (/\b(create|edit|modify|update|write)\b/.test(hay)) {
    return { name: 'edit', title: 'Write' }
  }
  if (/\b(suggest|suggestion|recommend|recommendation|advisor|advice|idea|ideas|inspiration|next step|next steps)\b/.test(hay)) {
    return { name: 'lightbulb', title: 'Suggestions' }
  }
  if (/\b(read|get|list|fetch|retrieve|load|pull)\b/.test(hay)) {
    return { name: 'eyeglasses', title: 'Read' }
  }
  if (/(workflow|flow|pipeline|automation)\b/.test(hay)) return { name: 'workflow', title: 'Workflow' }
  if (/\b(search|find|lookup|query)\b/.test(hay)) return { name: 'search', title: 'Search' }
  if (/\b(web|browser|http|https|url|crawl|crawler|scrape|scraper)\b/.test(hay)) return { name: 'globe', title: 'Web' }
  if (/\b(sql|db|database|postgres|postgresql|mysql|sqlite)\b/.test(hay)) return { name: 'database', title: 'Database' }
  if (/\b(file|files|drive|disk|storage)\b/.test(hay)) return { name: 'hard-drive', title: 'Files' }
  if (/\b(audio|voice|speech|transcrib|dictat)\b/.test(hay)) return { name: 'mic', title: 'Audio' }
  if (/\b(test|tests|eval|evaluation|verify|benchmark)\b/.test(hay)) return { name: 'test-tube', title: 'Testing' }

  return { name: 'magic-wand', title: 'Tools' }
}

