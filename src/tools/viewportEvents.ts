/**
 * Transient camera commands.
 *
 * These are one-shot intents ("frame this object", "reset the view"), not
 * document state, so they travel on a lightweight event bus instead of being
 * parked in the scene store.
 */

const FOCUS_EVENT = 'synspace:focus'
const RESET_EVENT = 'synspace:reset-view'

export interface FocusDetail {
  id: string
}

export function requestFocus(id: string): void {
  window.dispatchEvent(new CustomEvent<FocusDetail>(FOCUS_EVENT, { detail: { id } }))
}

export function requestResetView(): void {
  window.dispatchEvent(new Event(RESET_EVENT))
}

export function onFocusRequest(handler: (detail: FocusDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<FocusDetail>).detail)
  window.addEventListener(FOCUS_EVENT, listener)
  return () => window.removeEventListener(FOCUS_EVENT, listener)
}

export function onResetViewRequest(handler: () => void): () => void {
  window.addEventListener(RESET_EVENT, handler)
  return () => window.removeEventListener(RESET_EVENT, handler)
}
