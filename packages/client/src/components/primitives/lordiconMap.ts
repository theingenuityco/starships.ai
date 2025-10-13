export const LORDICON_URLS: Record<string, string> = {
  // Local asset defaults. Place your Pro JSON files into packages/client/public/lordicon with these filenames.
  rocket: '/lordicon/rocket.json',
  overview: '/lordicon/overview.json',
  'message-square': '/lordicon/message-square.json',
  settings: '/lordicon/settings.json',
  hub: '/lordicon/hub.json',
  plus: '/lordicon/plus.json',
  x: '/lordicon/x.json',
  history: '/lordicon/history.json',
  key: '/lordicon/key.json',
  user: '/lordicon/user.json',
  logout: '/lordicon/logout.json',
}

export function getLordiconUrl(name: string): string | undefined {
  return LORDICON_URLS[name]
}

export function registerLordicons(entries: Record<string, string>) {
  Object.assign(LORDICON_URLS, entries)
}
