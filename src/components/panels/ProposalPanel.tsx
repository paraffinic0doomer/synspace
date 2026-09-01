import { useProposalStore, useProposalViews, useSceneStore } from '@/state'
import { requestFocus } from '@/tools'
import type { ProposalBenefit, ProposalStatus, ProposalView } from '@/types'
import { formatRelativeTime } from '@/utils'
import { Badge, Button, EmptyState, Icon } from '@/components/ui'

/**
 * The human's review surface for agent proposals.
 *
 * Nothing an agent proposes reaches the world from here without a person
 * pressing Approve, and a proposal computed against an older revision is shown
 * as stale rather than being quietly applied over newer work.
 */

const STATUS_TONE: Record<ProposalStatus, 'brand' | 'signal' | 'warn' | 'danger' | 'default'> = {
  pending: 'brand',
  approved: 'signal',
  applied: 'signal',
  rejected: 'danger',
  superseded: 'default',
}

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'awaiting review',
  approved: 'approved',
  applied: 'applied',
  rejected: 'rejected',
  superseded: 'superseded',
}

export function ProposalPanel() {
  const views = useProposalViews()
  const previewId = useProposalStore((state) => state.previewId)
  const setPreview = useProposalStore((state) => state.setPreview)
  const approve = useProposalStore((state) => state.approveProposal)
  const reject = useProposalStore((state) => state.rejectProposal)
  const apply = useProposalStore((state) => state.applyProposal)
  const recalculate = useProposalStore((state) => state.recalculateProposal)

  const open = views.filter(
    (view) => view.status === 'pending' || view.status === 'approved',
  )
  const closed = views.filter(
    (view) => view.status !== 'pending' && view.status !== 'approved',
  )

  if (views.length === 0) {
    return (
      <EmptyState
        title="No proposals yet"
        hint="An agent can call propose_layout_fix or create_proposal to suggest changes. Nothing reaches the world until you approve it."
        icon={<Icon name="sparkles" size={22} />}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2 p-2.5">
      {[...open, ...closed].map((view) => (
        <ProposalCard
          key={view.id}
          view={view}
          previewing={previewId === view.id}
          onPreview={() => setPreview(previewId === view.id ? null : view.id)}
          onApprove={() => approve(view.id)}
          onApply={() => apply(view.id)}
          onReject={() => reject(view.id)}
          onRecalculate={() => recalculate(view.id)}
        />
      ))}
    </div>
  )
}

interface ProposalCardProps {
  view: ProposalView
  previewing: boolean
  onPreview: () => void
  onApprove: () => void
  onApply: () => void
  onReject: () => void
  onRecalculate: () => void
}

function ProposalCard({
  view,
  previewing,
  onPreview,
  onApprove,
  onApply,
  onReject,
  onRecalculate,
}: ProposalCardProps) {
  const selectObject = useSceneStore((state) => state.selectObject)
  const active = view.status === 'pending' || view.status === 'approved'

  return (
    <article
      className={`rounded-lg border p-2.5 ${
        view.stale && active
          ? 'border-warn-500/45 bg-warn-500/5'
          : previewing
            ? 'border-brand-500/50 bg-brand-500/5'
            : 'border-ink-750 bg-ink-850'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-signal-500/30 bg-signal-500/10 text-signal-400">
          <Icon name="bot" size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-ink-100">{view.title}</p>
          <p className="pt-0.5 text-[11px] leading-relaxed text-ink-400">{view.summary}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={STATUS_TONE[view.status]}>{STATUS_LABEL[view.status]}</Badge>
          <span className="font-mono text-[9.5px] text-ink-600">
            {formatRelativeTime(view.updatedAt)}
          </span>
        </div>
      </div>

      {/* Stale banner — the conflict case, stated plainly */}
      {view.stale && active && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-warn-500/40 bg-ink-900 px-2 py-1.5">
          <Icon name="info" size={12} className="mt-px shrink-0 text-warn-500" />
          <p className="flex-1 text-[10.5px] leading-relaxed text-warn-500">
            You changed the world since this was calculated (revision {view.baseWorldRevision} →{' '}
            {view.currentWorldRevision}). It will not be applied over your newer changes.
          </p>
          <Button tone="warn" onClick={onRecalculate} className="shrink-0">
            <Icon name="refresh" size={11} />
            Recalculate
          </Button>
        </div>
      )}

      {/* Explanation */}
      <ul className="mt-2 flex flex-col gap-0.5">
        {view.explanation.map((line, index) => (
          <li key={index} className="flex items-start gap-1.5 text-[10.5px] text-ink-300">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-ink-600" />
            {line}
          </li>
        ))}
      </ul>

      {/* Expected benefits */}
      {view.expectedBenefits.length > 0 && (
        <dl className="mt-2 grid gap-px overflow-hidden rounded-md border border-ink-750 bg-ink-750 sm:grid-cols-2">
          {view.expectedBenefits.map((benefit) => (
            <BenefitCell key={benefit.key} benefit={benefit} />
          ))}
        </dl>
      )}

      {/* Affected + preserved */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="font-mono text-[9.5px] tracking-wide text-ink-500 uppercase">
          affects
        </span>
        {view.affectedObjectIds.slice(0, 6).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              selectObject(id)
              requestFocus(id)
            }}
            className="rounded border border-ink-700 px-1 font-mono text-[9.5px] text-ink-400 hover:border-brand-500/50 hover:text-brand-400"
          >
            {id}
          </button>
        ))}
        {view.affectedObjectIds.length > 6 && (
          <span className="font-mono text-[9.5px] text-ink-600">
            +{view.affectedObjectIds.length - 6}
          </span>
        )}
      </div>

      {view.preservedObjectIds.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-warn-500">
          <Icon name="lock" size={11} className="shrink-0" />
          {view.preservedObjectIds.length} object
          {view.preservedObjectIds.length === 1 ? '' : 's'} you fixed were preserved
        </p>
      )}

      {/* Actions */}
      {active && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-ink-750 pt-2.5">
          <Button tone={previewing ? 'brand' : 'default'} onClick={onPreview}>
            <Icon name={previewing ? 'eyeOff' : 'eye'} size={12} />
            {previewing ? 'Hide preview' : 'Preview'}
          </Button>

          {view.status === 'pending' ? (
            <Button tone="signal" onClick={onApprove} disabled={view.stale}>
              <Icon name="target" size={12} />
              Approve
            </Button>
          ) : (
            <Button tone="signal" variant="solid" onClick={onApply} disabled={!view.canApply}>
              <Icon name="play" size={12} />
              Apply
            </Button>
          )}

          <Button tone="danger" onClick={onReject}>
            <Icon name="x" size={12} />
            Reject
          </Button>

          <span className="ml-auto font-mono text-[9.5px] text-ink-600">
            base rev {view.baseWorldRevision}
          </span>
        </div>
      )}

      {view.status === 'approved' && !view.stale && (
        <p className="mt-1.5 text-[10px] text-signal-400">
          Approved — the agent may now apply this, or press Apply yourself.
        </p>
      )}
    </article>
  )
}

function BenefitCell({ benefit }: { benefit: ProposalBenefit }) {
  const unit = benefit.unit === 'count' ? '' : benefit.unit === 'm2' ? ' m²' : ' m'
  const show = (value: number | null) => (value === null ? '—' : `${value}${unit}`)

  return (
    <div className="bg-ink-850 px-2 py-1.5">
      <dt className="text-[9.5px] tracking-wide text-ink-500 uppercase">{benefit.label}</dt>
      <dd className="flex items-center gap-1.5 pt-0.5 font-mono text-[11px]">
        <span className="text-ink-400">{show(benefit.before)}</span>
        <Icon
          name="chevronRight"
          size={10}
          className={benefit.improved ? 'text-signal-400' : 'text-ink-600'}
        />
        <span className={benefit.improved ? 'text-signal-400' : 'text-ink-200'}>
          {show(benefit.after)}
        </span>
      </dd>
    </div>
  )
}

/** Compact count for the console tab badge. */
export function useOpenProposalCount(): number {
  return useProposalViews().filter(
    (view) => view.status === 'pending' || view.status === 'approved',
  ).length
}
