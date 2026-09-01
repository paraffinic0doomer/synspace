import { useEffect, useState } from 'react'
import { useSceneStore } from '@/state'
import { DEFAULT_PRESET_ID, WORLD_PRESETS, getWorldPreset } from '@/tools'
import { SYSTEM_ACTOR } from '@/types'
import { Icon } from '@/components/ui'

/**
 * First-run introduction.
 *
 * The product only makes sense once you know two things: this is a world, and
 * an agent can operate it alongside you. That has to land before anything else,
 * so it is said in one sentence, backed by the questions you could actually
 * ask, and then gets out of the way permanently.
 */

const STORAGE_KEY = 'synspace.welcome.dismissed'

export function WelcomeOverlay() {
  const [open, setOpen] = useState(false)
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID)
  const loadScene = useSceneStore((state) => state.loadScene)

  useEffect(() => {
    // Storage can throw in a private window; a missing preference just means
    // "show it", which is the safe default for a first visit.
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== '1') setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [])

  const dismiss = () => {
    setOpen(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }

  const start = () => {
    if (presetId !== DEFAULT_PRESET_ID) {
      const preset = getWorldPreset(presetId)
      if (preset) loadScene(preset.build(), SYSTEM_ACTOR)
    }
    dismiss()
  }

  if (!open) return null
  const active = getWorldPreset(presetId)

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-ink-950/75 p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-panel border border-ink-700 bg-ink-900 shadow-2xl shadow-black/60">
        {/* Identity */}
        <div className="flex items-start gap-3.5 border-b border-ink-750 p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-500/40 bg-linear-to-br from-brand-500/25 to-signal-500/10">
            <Icon name="cube" size={22} className="text-brand-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] leading-tight font-semibold tracking-tight text-ink-100">
              SynSpace
            </h1>
            <p className="pt-0.5 text-[13px] font-medium text-brand-400">One world. Two minds.</p>
            <p className="pt-2 text-[12.5px] leading-relaxed text-ink-300">
              An agent-native spatial workspace where humans and AI agents can inspect, simulate
              and shape the same world.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* The one sentence */}
        <div className="border-b border-ink-750 px-5 py-4">
          <p className="text-[14px] font-medium text-ink-100">
            Build a world. Ask your agent to understand it.
          </p>
          <div className="grid gap-2 pt-3 sm:grid-cols-3">
            <Step icon="user" title="You shape it" body="Place, move and fix objects directly." />
            <Step
              icon="bot"
              title="The agent reads it"
              body="Same world, same numbers — not a screenshot."
            />
            <Step
              icon="sparkles"
              title="It proposes"
              body="You approve before anything changes."
            />
          </div>
        </div>

        {/* Preset */}
        <div className="border-b border-ink-750 px-5 py-4">
          <p className="pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
            Start from
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {WORLD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                aria-pressed={preset.id === presetId}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  preset.id === presetId
                    ? 'border-brand-500/60 bg-brand-500/10'
                    : 'border-ink-750 bg-ink-850 hover:border-ink-650'
                }`}
              >
                <span className="block text-[12.5px] font-medium text-ink-100">{preset.name}</span>
                <span className="block pt-0.5 text-[11px] text-ink-400">{preset.tagline}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Example prompts */}
        <div className="px-5 py-4">
          <p className="pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
            Things to ask your agent
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {(active?.prompts ?? []).map((prompt) => (
              <li
                key={prompt}
                className="rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1 text-[11.5px] text-ink-300"
              >
                “{prompt}”
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 border-t border-ink-750 bg-ink-850 px-5 py-3">
          <p className="flex-1 text-[10.5px] text-ink-500">
            Agent tools connect over WebMCP when your browser provides a host. Everything else
            works either way.
          </p>
          <button
            type="button"
            onClick={start}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-500"
          >
            Enter the world
            <Icon name="chevronRight" size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({
  icon,
  title,
  body,
}: {
  icon: 'user' | 'bot' | 'sparkles'
  title: string
  body: string
}) {
  return (
    <div className="rounded-lg border border-ink-750 bg-ink-850 p-2.5">
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-200">
        <Icon
          name={icon}
          size={12}
          className={icon === 'bot' ? 'text-signal-400' : icon === 'user' ? 'text-ink-300' : 'text-brand-400'}
        />
        {title}
      </span>
      <p className="pt-1 text-[10.5px] leading-relaxed text-ink-500">{body}</p>
    </div>
  )
}
