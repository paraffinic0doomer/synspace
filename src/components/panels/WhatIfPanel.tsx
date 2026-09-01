import { useMemo, useState } from 'react'
import { availableWhatIfQuestions, type WhatIfQuestion } from '@/scenarios'
import { useScenarioStore, useSceneStore, useWorld } from '@/state'
import type { ScenarioComparison } from '@/types'
import { roundTo } from '@/utils'
import { Badge, Button, Icon } from '@/components/ui'

/**
 * "What if?" — the headline interaction.
 *
 * A question here never touches the live world. It clones the world into an
 * isolated scenario, applies the operations there, analyses it and reports the
 * difference. The answer is a comparison, not a change.
 */
export function WhatIfPanel() {
  const world = useWorld()
  const createScenario = useScenarioStore((state) => state.createScenario)
  const modifyScenario = useScenarioStore((state) => state.modifyScenario)
  const analyzeScenario = useScenarioStore((state) => state.analyzeScenario)
  const compareScenario = useScenarioStore((state) => state.compareScenario)
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario)
  const log = useSceneStore((state) => state.log)

  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<{
    question: string
    scenarioId: string
    comparison: ScenarioComparison
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const questions = useMemo(() => availableWhatIfQuestions(world), [world])

  const ask = (question: WhatIfQuestion) => {
    setRunning(question.id)
    setError(null)

    try {
      const plan = question.build(world)
      if (!plan.ok) {
        setError(plan.reason)
        return
      }

      const scenario = createScenario(question.question)
      if (!scenario.ok) {
        setError(scenario.error)
        return
      }

      for (const operation of plan.operations) {
        const modified = modifyScenario(scenario.data.id, operation)
        if (!modified.ok) {
          setError(modified.error)
          return
        }
      }

      const analysis = analyzeScenario(scenario.data.id)
      if (!analysis.ok) {
        setError(analysis.error)
        return
      }

      const comparison = compareScenario(scenario.data.id)
      if (!comparison.ok) {
        setError(comparison.error)
        return
      }

      setResult({
        question: question.question,
        scenarioId: scenario.data.id,
        comparison: comparison.data,
      })
      setActiveScenario(scenario.data.id)
      log({
        message: `Simulated "${question.question}" in an isolated scenario — the live world was not changed`,
        level: 'info',
      })
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="mx-2.5 rounded-lg border border-brand-500/30 bg-brand-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-brand-500/40 bg-brand-500/12 text-brand-400">
          <Icon name="sparkles" size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-ink-100">What if?</p>
          <p className="text-[10.5px] text-ink-400">
            Simulated in an isolated copy — the real world never changes.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-1 pt-2.5">
        {questions.map((question) => (
          <li key={question.id}>
            <button
              type="button"
              onClick={() => ask(question)}
              disabled={running !== null}
              title={question.intent}
              className="w-full rounded-md border border-ink-750 bg-ink-850 px-2.5 py-1.5 text-left text-[11.5px] text-ink-200 transition-colors hover:border-brand-500/50 hover:bg-ink-800 disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <Icon name="chevronRight" size={11} className="shrink-0 text-brand-400" />
                <span className="min-w-0 flex-1 truncate">{question.question}</span>
                {running === question.id && (
                  <span className="font-mono text-[9.5px] text-brand-400">running…</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p className="mt-2 rounded-md border border-warn-500/40 bg-ink-900 px-2 py-1.5 text-[10.5px] text-warn-500">
          {error}
        </p>
      )}

      {result && <WhatIfResult result={result} />}
    </div>
  )
}

function WhatIfResult({
  result,
}: {
  result: { question: string; comparison: ScenarioComparison }
}) {
  const { comparison } = result
  const changed = comparison.metrics.filter(
    (metric) => metric.difference !== null && metric.difference !== 0,
  )

  return (
    <div className="mt-2.5 rounded-md border border-ink-750 bg-ink-900 p-2.5">
      <p className="text-[11px] font-medium text-ink-200">“{result.question}”</p>

      <div className="flex flex-wrap items-center gap-1 pt-1.5">
        <Badge tone={comparison.recommendation.decision === 'apply' ? 'signal' : comparison.recommendation.decision === 'reject' ? 'danger' : 'warn'}>
          {comparison.recommendation.decision}
        </Badge>
        <span className="text-[10.5px] text-ink-400">{comparison.recommendation.explanation}</span>
      </div>

      {changed.length > 0 ? (
        <dl className="mt-2 grid gap-px overflow-hidden rounded-md border border-ink-750 bg-ink-750">
          {changed.slice(0, 5).map((metric) => (
            <div key={String(metric.key)} className="flex items-center gap-2 bg-ink-850 px-2 py-1.5">
              <dt className="min-w-0 flex-1 truncate text-[10.5px] text-ink-400">
                {metric.label}
              </dt>
              <dd className="flex shrink-0 items-center gap-1.5 font-mono text-[10.5px]">
                <span className="text-ink-500">{format(metric.current, metric.unit)}</span>
                <Icon name="chevronRight" size={9} className="text-ink-600" />
                <span className="text-ink-100">{format(metric.scenario, metric.unit)}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="pt-2 text-[10.5px] text-ink-500">No measurable difference in this world.</p>
      )}

      <div className="flex items-center gap-1.5 pt-2">
        <span className="font-mono text-[9.5px] text-ink-600">
          {comparison.constraintsImproved.length} resolved ·{' '}
          {comparison.constraintsWorsened.length} new
        </span>
        <Button className="ml-auto" disabled>
          <Icon name="info" size={11} />
          Scenario only
        </Button>
      </div>
    </div>
  )
}

function format(value: number | null, unit: 'count' | 'm' | 'm2'): string {
  if (value === null) return '—'
  const rounded = roundTo(value, 2)
  return unit === 'count' ? String(rounded) : unit === 'm2' ? `${rounded} m²` : `${rounded} m`
}
