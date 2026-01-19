// Minimal nanoid mock for Jest.
// nanoid@5 is ESM-only, which breaks when required from CommonJS during tests.

export function nanoid(size = 21): string {
  return `test_${'x'.repeat(Math.max(0, size - 5))}`.slice(0, size);
}

export function customAlphabet(_alphabet: string, defaultSize = 21) {
  return (size = defaultSize) => nanoid(size);
}

