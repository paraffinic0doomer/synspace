import { useEffect } from 'react'
import { useSceneStore } from '@/state'
import { requestFocus, requestResetView } from './viewportEvents'

/** Keys pressed inside a form field should never drive the editor. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

export interface Shortcut {
  keys: string
  label: string
}

/** Documented for the shortcut strip in the header overflow menu. */
export const SHORTCUTS: Shortcut[] = [
  { keys: 'W / E / R', label: 'Move · Rotate · Scale' },
  { keys: 'F', label: 'Frame selection' },
  { keys: 'X', label: 'Toggle snapping' },
  { keys: 'L', label: 'Toggle labels' },
  { keys: 'Ctrl + D', label: 'Duplicate' },
  { keys: 'Ctrl + Z', label: 'Undo' },
  { keys: 'Ctrl + Shift + Z', label: 'Redo' },
  { keys: 'Delete', label: 'Delete selection' },
  { keys: 'Esc', label: 'Clear selection' },
  { keys: 'Home', label: 'Reset view' },
]

/**
 * Global editor shortcuts. Mounted once from the app shell so every panel
 * shares the same key handling.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      const store = useSceneStore.getState()
      const { selectedId } = store
      const modifier = event.ctrlKey || event.metaKey

      if (modifier) {
        const key = event.key.toLowerCase()

        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) store.redo()
          else store.undo()
          return
        }

        if (key === 'y') {
          event.preventDefault()
          store.redo()
          return
        }

        if (key === 'd' && selectedId) {
          event.preventDefault()
          store.duplicateObject(selectedId)
        }
        return
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedId) {
            event.preventDefault()
            store.deleteObject(selectedId)
          }
          break
        case 'Escape':
          store.discardPreview()
          store.selectObject(null)
          break
        case 'Home':
          event.preventDefault()
          requestResetView()
          break
        default:
          break
      }

      switch (event.key.toLowerCase()) {
        case 'w':
          store.setTransformMode('translate')
          break
        case 'e':
          store.setTransformMode('rotate')
          break
        case 'r':
          store.setTransformMode('scale')
          break
        case 'x':
          store.updateEnvironment({ snapEnabled: !store.scene.environment.snapEnabled })
          break
        case 'l':
          store.updateEnvironment({ showLabels: !store.scene.environment.showLabels })
          break
        case 'f':
          if (selectedId) requestFocus(selectedId)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
