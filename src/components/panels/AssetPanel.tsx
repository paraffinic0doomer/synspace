import { useMemo, useState } from 'react'
import { useSceneObjects, useSceneStore } from '@/state'
import { getAssetDefinition, groupedAssets, requestFocus } from '@/tools'
import type { AssetDefinition, SceneObject } from '@/types'
import { formatDimensions } from '@/utils'
import {
  AssetGlyph,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  SectionLabel,
} from '@/components/ui'

type Tab = 'library' | 'outliner'

/** Left dock: the asset library and the scene outliner. */
export function AssetPanel() {
  const [tab, setTab] = useState<Tab>('library')
  const objectCount = useSceneStore((state) => state.scene.objects.length)

  return (
    <Panel className="w-[286px] shrink-0 border-r border-ink-750">
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-750 p-1.5">
        <TabButton active={tab === 'library'} onClick={() => setTab('library')} icon="layers">
          Assets
        </TabButton>
        <TabButton active={tab === 'outliner'} onClick={() => setTab('outliner')} icon="cube">
          Outliner
          <Badge className="ml-1">{objectCount}</Badge>
        </TabButton>
      </div>

      {tab === 'library' ? <AssetLibrary /> : <SceneOutliner />}
    </Panel>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: 'layers' | 'cube'
  children: React.ReactNode
}

function TabButton({ active, onClick, icon, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11.5px] font-medium transition-colors ${
        active
          ? 'bg-ink-750 text-ink-100'
          : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
      }`}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Asset library
// ---------------------------------------------------------------------------

function AssetLibrary() {
  const [query, setQuery] = useState('')
  const addObject = useSceneStore((state) => state.addObject)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return groupedAssets()
      .map((group) => ({
        ...group,
        assets: needle
          ? group.assets.filter(
              (asset) =>
                asset.name.toLowerCase().includes(needle) ||
                asset.type.includes(needle) ||
                asset.category.toLowerCase().includes(needle),
            )
          : group.assets,
      }))
      .filter((group) => group.assets.length > 0)
  }, [query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-2.5">
        <label className="flex h-7 items-center gap-1.5 rounded-md border border-ink-750 bg-ink-850 px-2 focus-within:border-brand-500/60">
          <Icon name="search" size={13} className="shrink-0 text-ink-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
            className="w-full min-w-0 bg-transparent text-[11.5px] text-ink-100 placeholder:text-ink-500 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-ink-500 hover:text-ink-200"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {groups.length === 0 && (
          <EmptyState
            title="No matching assets"
            hint="Try a different term, or clear the search to see the full kit."
            icon={<Icon name="search" size={22} />}
          />
        )}

        {groups.map((group) => (
          <section key={group.category}>
            <SectionLabel trailing={<span className="font-mono">{group.assets.length}</span>}>
              {group.category}
            </SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 px-2.5">
              {group.assets.map((asset) => (
                <AssetCard key={asset.type} asset={asset} onPlace={() => addObject(asset.type)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="shrink-0 border-t border-ink-750 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[10.5px] leading-relaxed text-ink-500">
          <Icon name="info" size={12} className="shrink-0" />
          Click an asset to drop it into a free spot in the room.
        </p>
      </footer>
    </div>
  )
}

interface AssetCardProps {
  asset: AssetDefinition
  onPlace: () => void
}

function AssetCard({ asset, onPlace }: AssetCardProps) {
  const { width, height, depth } = asset.dimensions
  return (
    <button
      type="button"
      onClick={onPlace}
      title={`${asset.name} — ${asset.description}`}
      className="group flex flex-col items-start gap-2 rounded-lg border border-ink-750 bg-ink-850 p-2.5 text-left transition-all hover:-translate-y-px hover:border-brand-500/50 hover:bg-ink-800 active:translate-y-0"
    >
      <span className="grid h-11 w-full place-items-center rounded-md border border-ink-750 bg-ink-900 text-ink-400 transition-colors group-hover:border-brand-500/30 group-hover:text-brand-400">
        <AssetGlyph type={asset.type} size={28} />
      </span>
      <span className="w-full">
        <span className="block truncate text-[11.5px] font-medium text-ink-200 group-hover:text-ink-100">
          {asset.name}
        </span>
        <span className="block truncate font-mono text-[9.5px] text-ink-500">
          {formatDimensions(width, height, depth)}
        </span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Scene outliner
// ---------------------------------------------------------------------------

function SceneOutliner() {
  const objects = useSceneObjects()
  const selectedId = useSceneStore((state) => state.selectedId)
  const selectObject = useSceneStore((state) => state.selectObject)
  const setHovered = useSceneStore((state) => state.setHovered)
  const updateObject = useSceneStore((state) => state.updateObject)
  const deleteObject = useSceneStore((state) => state.deleteObject)
  const resetScene = useSceneStore((state) => state.resetScene)
  const clearScene = useSceneStore((state) => state.clearScene)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionLabel trailing={<span className="font-mono">{objects.length} items</span>}>
        Scene contents
      </SectionLabel>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {objects.length === 0 ? (
          <EmptyState
            title="The room is empty"
            hint="Add assets from the library, or restore the studio template below."
            icon={<Icon name="cube" size={22} />}
          />
        ) : (
          <ul className="flex flex-col gap-px">
            {objects.map((object) => (
              <OutlinerRow
                key={object.id}
                object={object}
                selected={object.id === selectedId}
                onSelect={() => selectObject(object.id)}
                onHover={setHovered}
                onToggleVisible={() => updateObject(object.id, { visible: !object.visible })}
                onToggleLocked={() => updateObject(object.id, { locked: !object.locked })}
                onDelete={() => deleteObject(object.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-1.5 border-t border-ink-750 px-2.5 py-2">
        <Button onClick={() => resetScene()} className="flex-1">
          <Icon name="refresh" size={12} />
          Reset layout
        </Button>
        <Button tone="danger" onClick={() => clearScene()} disabled={objects.length === 0}>
          <Icon name="trash" size={12} />
          Clear
        </Button>
      </footer>
    </div>
  )
}

interface OutlinerRowProps {
  object: SceneObject
  selected: boolean
  onSelect: () => void
  onHover: (id: string | null) => void
  onToggleVisible: () => void
  onToggleLocked: () => void
  onDelete: () => void
}

function OutlinerRow({
  object,
  selected,
  onSelect,
  onHover,
  onToggleVisible,
  onToggleLocked,
  onDelete,
}: OutlinerRowProps) {
  const definition = getAssetDefinition(object.type)

  return (
    <li>
      <div
        onMouseEnter={() => onHover(object.id)}
        onMouseLeave={() => onHover(null)}
        className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
          selected
            ? 'bg-brand-500/12 shadow-[inset_0_0_0_1px_rgba(79,140,255,0.32)]'
            : 'hover:bg-ink-800'
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => requestFocus(object.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={`shrink-0 ${selected ? 'text-brand-400' : 'text-ink-500'} ${
              object.visible ? '' : 'opacity-40'
            }`}
          >
            <AssetGlyph type={object.type} size={16} />
          </span>
          <span className="min-w-0 leading-tight">
            <span
              className={`block truncate text-[11.5px] ${
                selected ? 'text-ink-100' : 'text-ink-200'
              } ${object.visible ? '' : 'line-through opacity-50'}`}
            >
              {object.label}
            </span>
            <span className="block truncate font-mono text-[9.5px] text-ink-500">
              {definition.name} · {object.id}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 data-[always]:opacity-100">
          <IconButton
            label={object.locked ? 'Unlock' : 'Lock'}
            tone="warn"
            active={object.locked}
            onClick={onToggleLocked}
            className="h-6 w-6"
          >
            <Icon name={object.locked ? 'lock' : 'unlock'} size={12} />
          </IconButton>
          <IconButton
            label={object.visible ? 'Hide' : 'Show'}
            onClick={onToggleVisible}
            className="h-6 w-6"
          >
            <Icon name={object.visible ? 'eye' : 'eyeOff'} size={12} />
          </IconButton>
          <IconButton label="Delete" tone="danger" onClick={onDelete} className="h-6 w-6">
            <Icon name="trash" size={12} />
          </IconButton>
        </div>
      </div>
    </li>
  )
}
