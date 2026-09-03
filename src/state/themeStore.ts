import { create } from 'zustand'

/**
 * The viewer's colour theme.
 *
 * Deliberately *not* part of the world document. A world is a shared artefact —
 * it gets exported, handed to a scenario, proposed against — and whether the
 * person looking at it prefers a light interface is none of its business.
 * Keeping the two apart also means switching theme cannot dirty the world,
 * bump its revision, or land in the undo stack.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'synspace.theme'

export function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export const resolveTheme = (preference: ThemePreference): ResolvedTheme =>
  preference === 'system' ? systemTheme() : preference

/**
 * Stamps the resolved theme onto the document.
 *
 * "system" is resolved to a concrete value here rather than left to a media
 * query in CSS, so the stylesheet needs one selector instead of the same
 * palette written twice.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  try {
    const root = document.documentElement
    root.dataset.theme = resolved
    // Tailwind's `dark:` variants and the native form/scrollbar styling both
    // key off these, so they have to move together with the token ramp.
    root.classList.toggle('dark', resolved === 'dark')
    document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute('content', resolved)
  } catch {
    /* pre-DOM or a locked-down environment — the stylesheet default stands */
  }
}

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  /** Cycles system → light → dark → system, for the header control. */
  cycle: () => void
}

const initialPreference = readStoredPreference()

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: resolveTheme(initialPreference),

  setPreference: (preference) => {
    const resolved = resolveTheme(preference)
    applyTheme(resolved)
    try {
      window.localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* the choice still applies for this session */
    }
    set({ preference, resolved })
  },

  cycle: () => {
    const order: ThemePreference[] = ['system', 'light', 'dark']
    const next = order[(order.indexOf(get().preference) + 1) % order.length]
    get().setPreference(next)
  },
}))

/** Keeps a "system" preference honest when the OS setting changes mid-session. */
export function watchSystemTheme(): () => void {
  try {
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (useThemeStore.getState().preference !== 'system') return
      const resolved = systemTheme()
      applyTheme(resolved)
      useThemeStore.setState({ resolved })
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  } catch {
    return () => {}
  }
}

applyTheme(resolveTheme(initialPreference))
