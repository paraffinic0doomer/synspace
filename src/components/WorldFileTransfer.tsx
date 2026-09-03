import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useSceneStore } from '@/state'
import { dragHasFile, parseWorldFile, WORLD_FILE_EXTENSION } from '@/tools'
import { HUMAN_ACTOR } from '@/types'
import { Icon } from '@/components/ui'

/**
 * Moving a world in and out of the browser as a file.
 *
 * Export is a human affordance, not a tool: an agent already has the entire
 * world through `read_scene_graph` and has no use for a download. Keeping this
 * out of the tool surface is what preserves the line — agents read structure,
 * people handle files.
 */

interface ImportState {
  error: string | null
  loading: boolean
}

export function useWorldImport() {
  const loadScene = useSceneStore((state) => state.loadScene)
  const log = useSceneStore((state) => state.log)
  const [state, setState] = useState<ImportState>({ error: null, loading: false })

  const importFile = useCallback(
    async (file: File) => {
      setState({ error: null, loading: true })

      const fail = (error: string) => {
        setState({ error, loading: false })
        log({ message: `Could not open "${file.name}" — ${error}`, level: 'error' })
      }

      let text: string
      try {
        text = await file.text()
      } catch {
        fail('the file could not be read.')
        return
      }

      const result = parseWorldFile(text)
      if (!result.ok) {
        fail(result.error)
        return
      }

      // The store's own funnel takes it from here: the revision is derived from
      // the world that was already live, so an imported document cannot import
      // its own history along with it.
      loadScene(result.world, HUMAN_ACTOR)
      setState({ error: null, loading: false })
      log({
        message: `Opened "${result.world.name}" from ${file.name} · ${result.world.objects.length} objects`,
        level: 'success',
      })
    },
    [loadScene, log],
  )

  return {
    importFile,
    error: state.error,
    loading: state.loading,
    clearError: () => setState((previous) => ({ ...previous, error: null })),
  }
}

/**
 * Makes its children a drop target for a world file.
 *
 * Wrapped around the viewport because that is where a person's attention is,
 * and because the world is what they are replacing. The counter on
 * `dragenter`/`dragleave` is not decoration: those events fire for every child
 * element the pointer crosses, so a naive boolean flickers the overlay off the
 * moment the cursor moves over anything inside the drop area.
 */
export function WorldDropZone({ children }: { children: ReactNode }) {
  const { importFile, error, clearError } = useWorldImport()
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  const onDragEnter = (event: React.DragEvent) => {
    if (!dragHasFile(event.nativeEvent)) return
    event.preventDefault()
    depth.current += 1
    setDragging(true)
    clearError()
  }

  const onDragLeave = (event: React.DragEvent) => {
    if (!dragHasFile(event.nativeEvent)) return
    event.preventDefault()
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragging(false)
  }

  const onDragOver = (event: React.DragEvent) => {
    if (!dragHasFile(event.nativeEvent)) return
    // Without this the browser navigates to the file and the app is gone.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: React.DragEvent) => {
    if (!dragHasFile(event.nativeEvent)) return
    event.preventDefault()
    depth.current = 0
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void importFile(file)
  }

  return (
    <div
      className="relative h-full w-full"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-brand-500/60 bg-ink-900/90 px-8 py-6">
            <Icon name="download" size={24} className="text-brand-400" />
            <p className="text-[13px] font-medium text-ink-100">Drop to open this world</p>
            <p className="font-mono text-[10.5px] text-ink-500">{WORLD_FILE_EXTENSION}</p>
          </div>
        </div>
      )}

      {error && !dragging && (
        <div className="absolute bottom-14 left-1/2 z-40 w-[min(30rem,90%)] -translate-x-1/2">
          <div className="flex items-start gap-2 rounded-panel border border-danger-500/50 bg-ink-900/95 px-3 py-2.5 backdrop-blur-md">
            <Icon name="info" size={13} className="mt-px shrink-0 text-danger-500" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-medium text-ink-100">That world did not open</p>
              <p className="pt-0.5 text-[10.5px] leading-relaxed text-ink-400">{error}</p>
            </div>
            <button
              type="button"
              onClick={clearError}
              aria-label="Dismiss"
              className="shrink-0 text-ink-500 transition-colors hover:text-ink-200"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
