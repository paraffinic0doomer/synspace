import { useState } from 'react'
import { DEMO_STEPS, type DemoStep, type StepResult } from '@/demo'
import { useSceneStore } from '@/state'
import { Badge, Icon } from '@/components/ui'

/**
 * The guided walkthrough and the answers a judge will ask for.
 *
 * The honesty line at the top is the important part: every agent step runs the
 * real tool handlers and the timeline is written by that execution, but the
 * arguments are scripted rather than chosen by a model. Saying so plainly is
 * what makes the evidence worth anything.
 */

type Tab = 'walkthrough' | 'why'

const ACTOR_STYLE = {
  human: { icon: 'user', tone: 'text-ink-200', label: 'Human' },
  agent: { icon: 'bot', tone: 'text-signal-400', label: 'Agent tools' },
  system: { icon: 'sparkles', tone: 'text-brand-400', label: 'Setup' },
} as const

export function DemoPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('walkthrough')
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Record<string, StepResult>>({})
  const mcp = useSceneStore((state) => state.mcp)

  const step = DEMO_STEPS[index]
  const result = results[step.id]

  const runStep = () => {
    const outcome = step.run()
    setResults((current) => ({ ...current, [step.id]: outcome }))
  }

  const reset = () => {
    setResults({})
    setIndex(0)
  }

  return (
    <div className="pointer-events-auto flex max-h-[calc(100%-1.5rem)] w-[352px] flex-col overflow-hidden rounded-panel border border-ink-700 bg-ink-900/95 shadow-2xl shadow-black/50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ink-750 px-3 py-2.5">
        <Icon name="play" size={14} className="shrink-0 text-brand-400" />
        <p className="flex-1 text-[12.5px] font-semibold text-ink-100">Demo</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close demo"
          className="rounded-md p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-ink-750 p-1.5">
        <TabButton active={tab === 'walkthrough'} onClick={() => setTab('walkthrough')}>
          Walkthrough
        </TabButton>
        <TabButton active={tab === 'why'} onClick={() => setTab('why')}>
          Why this matters
        </TabButton>
      </div>

      {tab === 'walkthrough' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* The honesty line */}
          <p className="shrink-0 border-b border-ink-800 bg-ink-850 px-3 py-1.5 text-[10px] leading-relaxed text-ink-400">
            Agent steps run the <span className="text-ink-200">real tool handlers</span> and write
            the timeline. Arguments are scripted — no model is in the loop.{' '}
            {mcp.status === 'connected' ? (
              <span className="text-signal-400">
                A WebMCP host is connected, so an agent can call the same {mcp.toolNames.length}{' '}
                tools itself.
              </span>
            ) : (
              <span className="text-warn-500">
                No WebMCP host in this browser — the same tools still run here.
              </span>
            )}
          </p>

          {/* Steps */}
          <ol className="flex shrink-0 gap-px overflow-x-auto border-b border-ink-800 px-2 py-1.5">
            {DEMO_STEPS.map((candidate, position) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-current={position === index}
                  title={candidate.title}
                  className={`grid h-6 w-6 place-items-center rounded-md font-mono text-[10px] transition-colors ${
                    position === index
                      ? 'bg-brand-500/20 text-brand-400 shadow-[inset_0_0_0_1px_rgba(79,140,255,0.4)]'
                      : results[candidate.id]
                        ? 'text-signal-400 hover:bg-ink-800'
                        : 'text-ink-600 hover:bg-ink-800'
                  }`}
                >
                  {results[candidate.id] ? (results[candidate.id].ok ? '✓' : '!') : position + 1}
                </button>
              </li>
            ))}
          </ol>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <StepBody step={step} result={result} />
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-1.5 border-t border-ink-750 px-3 py-2.5">
            <button
              type="button"
              onClick={runStep}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-[11.5px] font-medium text-white hover:bg-brand-500"
            >
              <Icon name="play" size={11} />
              {result ? 'Run again' : 'Run this step'}
            </button>
            <button
              type="button"
              onClick={() => setIndex((current) => Math.min(current + 1, DEMO_STEPS.length - 1))}
              disabled={index === DEMO_STEPS.length - 1}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-650 px-2.5 text-[11.5px] text-ink-200 hover:bg-ink-800 disabled:opacity-40"
            >
              Next
              <Icon name="chevronRight" size={11} />
            </button>
            <button
              type="button"
              onClick={reset}
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-ink-500 hover:bg-ink-800 hover:text-ink-200"
            >
              <Icon name="refresh" size={11} />
              Restart
            </button>
          </div>
        </div>
      ) : (
        <WhyPanel />
      )}
    </div>
  )
}

function StepBody({ step, result }: { step: DemoStep; result?: StepResult }) {
  const actor = ACTOR_STYLE[step.actor]

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Badge tone="brand">{step.scene}</Badge>
        <span className={`inline-flex items-center gap-1 text-[10.5px] ${actor.tone}`}>
          <Icon name={actor.icon} size={11} />
          {actor.label}
        </span>
      </div>

      <h3 className="pt-1.5 text-[13px] font-semibold text-ink-100">{step.title}</h3>
      <p className="pt-1 text-[11.5px] leading-relaxed text-ink-300">{step.say}</p>

      {step.tools.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-2">
          {step.tools.map((tool) => (
            <Badge key={tool} tone="signal">
              {tool}
            </Badge>
          ))}
        </div>
      )}

      {result && (
        <div
          className={`mt-3 rounded-md border p-2.5 ${
            result.ok ? 'border-signal-500/40 bg-signal-500/[0.07]' : 'border-danger-500/40 bg-danger-500/[0.07]'
          }`}
        >
          <p className={`text-[11px] leading-relaxed ${result.ok ? 'text-ink-200' : 'text-danger-500'}`}>
            {result.outcome}
          </p>

          {result.executed.length > 0 && (
            <>
              <p className="pt-2 pb-1 font-mono text-[9px] tracking-[0.14em] text-ink-500 uppercase">
                tools that actually ran
              </p>
              <ul className="flex flex-col gap-0.5">
                {result.executed.map((executed, position) => (
                  <li
                    key={`${executed.tool}-${position}`}
                    className="flex items-center gap-1.5 font-mono text-[10px]"
                  >
                    <Icon
                      name={executed.outcome.ok ? 'target' : 'x'}
                      size={10}
                      className={`shrink-0 ${executed.outcome.ok ? 'text-signal-400' : 'text-danger-500'}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink-300">{executed.tool}</span>
                    <span className="shrink-0 text-ink-600">{executed.durationMs} ms</span>
                  </li>
                ))}
              </ul>
              <p className="pt-1.5 text-[9.5px] text-ink-600">
                Open the Activity console to see the full input and output of each call.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: 'Why WebMCP?',
    answer:
      'SynSpace exposes the structured capabilities of its live spatial world directly to agents, instead of requiring an agent to infer what a UI does and drive it by clicking.',
  },
  {
    question: 'Why 3D?',
    answer:
      'Spatial relationships are hard to convey in text. Clearance, circulation and egress are properties of a layout, and a person judges them far faster by looking.',
  },
  {
    question: 'Why human + agent?',
    answer:
      'The human brings visual judgement and intent. The agent brings systematic spatial analysis and repetitive operations — measuring every route, every gap, every time.',
  },
  {
    question: 'What is new?',
    answer:
      'The website is treated as an interactive world an agent can inspect and operate, rather than a UI it clicks. Both parties read and write the same model.',
  },
  {
    question: 'What happens without WebMCP?',
    answer:
      'The agent would have to work the interface indirectly and would lose structured access to the live world model. SynSpace still runs — it just runs without its second operator.',
  },
]

function WhyPanel() {
  const mcp = useSceneStore((state) => state.mcp)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <p className="text-[11.5px] leading-relaxed text-ink-300">
        Traditional websites expose a <span className="text-ink-100">user interface</span>.
        SynSpace exposes a <span className="text-brand-400">structured spatial world</span>, so a
        human and an agent can operate the same environment.
      </p>

      <dl className="flex flex-col gap-2 pt-3">
        {QUESTIONS.map((entry) => (
          <div key={entry.question} className="rounded-lg border border-ink-750 bg-ink-850 p-2.5">
            <dt className="text-[11.5px] font-medium text-ink-100">{entry.question}</dt>
            <dd className="pt-1 text-[11px] leading-relaxed text-ink-400">{entry.answer}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 rounded-lg border border-ink-750 bg-ink-850 p-2.5">
        <p className="pb-1.5 font-mono text-[9px] tracking-[0.14em] text-ink-500 uppercase">
          tool surface
        </p>
        {mcp.status === 'connected' ? (
          <div className="flex flex-wrap gap-1">
            {mcp.toolNames.map((name) => (
              <Badge key={name} tone="signal">
                {name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-warn-500">
            No WebMCP host detected in this browser, so nothing is registered. The tools still
            exist and the walkthrough runs them directly.
          </p>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 flex-1 items-center justify-center rounded-md text-[11.5px] font-medium transition-colors ${
        active ? 'bg-ink-750 text-ink-100' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}
