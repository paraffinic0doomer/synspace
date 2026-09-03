import { useEffect, useState } from 'react'
import { Viewport } from '@/scene'
import { useWebMcp } from '@/mcp'
import { watchSystemTheme } from '@/state'
import { useKeyboardShortcuts } from '@/tools'
import { AgentConsole } from '@/components/panels/AgentConsole'
import { AssetPanel } from '@/components/panels/AssetPanel'
import { HeaderBar } from '@/components/panels/HeaderBar'
import { InspectorPanel } from '@/components/panels/InspectorPanel'
import { ViewportOverlay } from '@/components/panels/ViewportOverlay'
import { WelcomeOverlay } from '@/components/panels/WelcomeOverlay'
import { DemoPanel } from '@/components/panels/DemoPanel'
import { WorldDropZone } from '@/components/WorldFileTransfer'

/**
 * Application chrome: header, left dock, viewport, right dock, bottom console.
 * The shell owns layout only — no scene data passes through it.
 *
 * The two docks are fixed-width (286 px and 318 px), which on a narrow surface
 * — a phone, or an app's in-app browser — leaves nothing for the world itself.
 * Since the world *is* the product, the docks give way first: they become
 * overlay drawers below their breakpoints so the viewport always keeps the
 * space, and the header exposes toggles to reach them.
 */
export function AppShell() {
  useKeyboardShortcuts()
  useWebMcp()
  // Follows the OS switching light/dark while the tab is open, but only while
  // the viewer has not made a choice of their own.
  useEffect(() => watchSystemTheme(), [])
  const [demoOpen, setDemoOpen] = useState(false)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  const drawerOpen = leftOpen || rightOpen
  const closeDrawers = () => {
    setLeftOpen(false)
    setRightOpen(false)
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-ink-950">
      <WelcomeOverlay />
      <HeaderBar
        demoOpen={demoOpen}
        onToggleDemo={() => setDemoOpen((open) => !open)}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => {
          setRightOpen(false)
          setLeftOpen((open) => !open)
        }}
        onToggleRight={() => {
          setLeftOpen(false)
          setRightOpen((open) => !open)
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* Left dock — in flow from lg up, a drawer below it */}
        <div
          className={`${
            leftOpen ? 'absolute inset-y-0 left-0 z-30 flex shadow-2xl shadow-black/70' : 'hidden'
          } lg:static lg:z-auto lg:flex lg:shadow-none`}
        >
          <AssetPanel />
        </div>

        <main className="relative min-w-0 flex-1 bg-ink-950">
          <WorldDropZone>
            <Viewport />
            <ViewportOverlay />
          </WorldDropZone>
          {demoOpen && (
            <div className="pointer-events-none absolute top-3 left-3 z-20 flex h-[calc(100%-1.5rem)] items-start">
              <DemoPanel onClose={() => setDemoOpen(false)} />
            </div>
          )}
        </main>

        {/* Right dock — in flow from xl up, a drawer below it */}
        <div
          className={`${
            rightOpen ? 'absolute inset-y-0 right-0 z-30 flex shadow-2xl shadow-black/70' : 'hidden'
          } xl:static xl:z-auto xl:flex xl:shadow-none`}
        >
          <InspectorPanel />
        </div>

        {/* Dismiss a drawer by tapping the world behind it */}
        {drawerOpen && (
          <button
            type="button"
            aria-label="Close panel"
            onClick={closeDrawers}
            className="absolute inset-0 z-20 cursor-default bg-ink-950/50 xl:hidden"
          />
        )}
      </div>

      <AgentConsole />
    </div>
  )
}
