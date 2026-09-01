import { useState } from 'react'
import { Viewport } from '@/scene'
import { useWebMcp } from '@/mcp'
import { useKeyboardShortcuts } from '@/tools'
import { AgentConsole } from '@/components/panels/AgentConsole'
import { AssetPanel } from '@/components/panels/AssetPanel'
import { HeaderBar } from '@/components/panels/HeaderBar'
import { InspectorPanel } from '@/components/panels/InspectorPanel'
import { ViewportOverlay } from '@/components/panels/ViewportOverlay'
import { WelcomeOverlay } from '@/components/panels/WelcomeOverlay'
import { DemoPanel } from '@/components/panels/DemoPanel'

/**
 * Application chrome: header, left dock, viewport, right dock, bottom console.
 * The shell owns layout only — no scene data passes through it.
 */
export function AppShell() {
  useKeyboardShortcuts()
  useWebMcp()
  const [demoOpen, setDemoOpen] = useState(false)

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-ink-950">
      <WelcomeOverlay />
      <HeaderBar demoOpen={demoOpen} onToggleDemo={() => setDemoOpen((open) => !open)} />

      <div className="flex min-h-0 flex-1">
        <AssetPanel />

        <main className="relative min-w-0 flex-1 bg-ink-950">
          <Viewport />
          <ViewportOverlay />
          {demoOpen && (
            <div className="pointer-events-none absolute top-3 left-3 z-20 flex h-[calc(100%-1.5rem)] items-start">
              <DemoPanel onClose={() => setDemoOpen(false)} />
            </div>
          )}
        </main>

        <InspectorPanel />
      </div>

      <AgentConsole />
    </div>
  )
}
