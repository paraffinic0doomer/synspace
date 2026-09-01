import { useState } from 'react'
import { useScenarioStore } from '@/state'
import type { Scenario, ScenarioStatus } from '@/types'
import { Badge, Button, Icon, SectionLabel } from '@/components/ui'

const STATUS_TONE: Record<ScenarioStatus, 'default' | 'brand' | 'signal' | 'warn'> = {
  draft: 'default',
  analyzed: 'brand',
  applied: 'signal',
  discarded: 'warn',
}

/** Scenario lifecycle and the latest deterministic recommendation. */
export function ScenarioPanel() {
  const [name, setName] = useState('')
  const scenarios = useScenarioStore((state) => state.scenarios)
  const activeId = useScenarioStore((state) => state.activeScenarioId)
  const createScenario = useScenarioStore((state) => state.createScenario)
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario)

  const active = scenarios.find((scenario) => scenario.id === activeId) ?? null
  const handleCreate = () => {
    const clean = name.trim() || `What-if ${scenarios.length + 1}`
    const result = createScenario(clean)
    if (result.ok) setName('')
  }

  return (
    <section>
      <SectionLabel trailing={<span className="font-mono">{scenarios.length}</span>}>
        What-if scenarios
      </SectionLabel>
      <div className="px-2.5">
        <div className="flex gap-1.5">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreate()
            }}
            maxLength={100}
            placeholder="Scenario name"
            aria-label="Scenario name"
            className="h-7 min-w-0 flex-1 rounded-md border border-ink-750 bg-ink-850 px-2 text-[11px] text-ink-100 outline-none placeholder:text-ink-500 focus:border-brand-500/60"
          />
          <Button tone="brand" onClick={handleCreate}>
            <Icon name="sparkles" size={12} />
            Create
          </Button>
        </div>

        {scenarios.length > 0 && (
          <div className="flex gap-1 overflow-x-auto py-2">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setActiveScenario(scenario.id)}
                className={`shrink-0 rounded-md border px-2 py-1 text-[10.5px] ${
                  scenario.id === activeId
                    ? 'border-brand-500/50 bg-brand-500/12 text-brand-400'
                    : 'border-ink-750 bg-ink-850 text-ink-400 hover:text-ink-200'
                }`}
              >
                {scenario.name}
              </button>
            ))}
          </div>
        )}

        {active ? (
          <ScenarioDetails scenario={active} />
        ) : (
          <p className="py-2 text-[10.5px] leading-relaxed text-ink-500">
            Create an isolated clone, modify it through the scenario tools, then analyze and compare before applying.
          </p>
        )}
      </div>
    </section>
  )
}

function ScenarioDetails({ scenario }: { scenario: Scenario }) {
  const analyze = useScenarioStore((state) => state.analyzeScenario)
  const compare = useScenarioStore((state) => state.compareScenario)
  const apply = useScenarioStore((state) => state.applyScenario)
  const discard = useScenarioStore((state) => state.discardScenario)
  const terminal = scenario.status === 'applied' || scenario.status === 'discarded'
  const changedMetrics = scenario.comparison?.metrics.filter(
    (metric) => metric.difference !== null && Math.abs(metric.difference) > 1e-6,
  )

  return (
    <div className="rounded-lg border border-ink-750 bg-ink-850 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink-200">
          {scenario.name}
        </span>
        <Badge tone={STATUS_TONE[scenario.status]}>{scenario.status}</Badge>
      </div>
      <p className="pt-1 font-mono text-[9.5px] text-ink-500">
        base rev {scenario.baseWorldRevision} · {scenario.proposedChanges.length} proposed changes · {scenario.world.objects.length} objects
      </p>

      {scenario.proposedChanges.length > 0 && (
        <ul className="mt-2 flex max-h-20 flex-col gap-1 overflow-y-auto border-l border-ink-700 pl-2">
          {scenario.proposedChanges.map((change) => (
            <li key={change.id} className="text-[10px] leading-snug text-ink-400">
              {change.summary}
            </li>
          ))}
        </ul>
      )}

      {scenario.analysis && (
        <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink-750 bg-ink-750">
          <ScenarioMetric label="Objects" value={String(scenario.analysis.metrics.objectCount)} />
          <ScenarioMetric label="Free area" value={`${scenario.analysis.metrics.freeAreaSqm} m²`} />
          <ScenarioMetric
            label="Min walkway"
            value={
              scenario.analysis.metrics.minimumWalkwayWidthM === null
                ? 'n/a'
                : `${scenario.analysis.metrics.minimumWalkwayWidthM} m`
            }
          />
          <ScenarioMetric label="Findings" value={String(scenario.analysis.violations.length)} />
        </dl>
      )}

      {scenario.comparison && (
        <div className="mt-2 rounded-md border border-ink-750 bg-ink-900 p-2">
          <div className="flex items-center gap-1.5">
            <Badge
              tone={
                scenario.comparison.recommendation.decision === 'apply'
                  ? 'signal'
                  : scenario.comparison.recommendation.decision === 'reject'
                    ? 'danger'
                    : 'warn'
              }
            >
              {scenario.comparison.recommendation.decision}
            </Badge>
            <span className="font-mono text-[9.5px] text-ink-500">
              {scenario.comparison.constraintsImproved.length} improved ·{' '}
              {scenario.comparison.constraintsWorsened.length} worsened
            </span>
          </div>
          <p className="pt-1.5 text-[10px] leading-snug text-ink-400">
            {scenario.comparison.recommendation.explanation}
          </p>
          {changedMetrics && changedMetrics.length > 0 && (
            <ul className="pt-1.5">
              {changedMetrics.slice(0, 4).map((metric) => (
                <li key={metric.key} className="flex justify-between gap-2 text-[9.5px]">
                  <span className="text-ink-500">{metric.label}</span>
                  <span className="font-mono text-ink-300">
                    {metric.current ?? 'n/a'} → {metric.scenario ?? 'n/a'}{' '}
                    {metric.difference !== null && `(${metric.difference >= 0 ? '+' : ''}${metric.difference})`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!terminal && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button onClick={() => analyze(scenario.id)}>Analyze</Button>
          <Button onClick={() => compare(scenario.id)}>Compare</Button>
          <Button
            tone="signal"
            disabled={scenario.proposedChanges.length === 0}
            onClick={() => apply(scenario.id)}
          >
            Apply world
          </Button>
          <Button tone="danger" variant="ghost" onClick={() => discard(scenario.id)}>
            Discard
          </Button>
        </div>
      )}
    </div>
  )
}

function ScenarioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900 px-2 py-1.5">
      <dt className="text-[9px] tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className="font-mono text-[10px] text-ink-200">{value}</dd>
    </div>
  )
}
