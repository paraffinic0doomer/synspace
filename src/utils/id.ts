/** Short, collision-resistant id suffix (6 hex chars). */
function randomSuffix(): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Creates a readable unique id, e.g. `desk-9f3ac1`. */
export function createId(prefix: string): string {
  return `${prefix}-${randomSuffix()}`
}
