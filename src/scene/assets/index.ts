import type { ComponentType } from 'react'
import type { AssetType } from '@/types'
import type { AssetProps } from './types'
import { Desk } from './Desk'
import { Chair } from './Chair'
import { MeetingTable } from './MeetingTable'
import { Sofa } from './Sofa'
import { Plant } from './Plant'
import { Partition } from './Partition'
import { ServerRack } from './ServerRack'
import { Door } from './Door'

/**
 * Asset registry. Adding a new primitive means adding it here and to the
 * catalogue in `tools/assetCatalog.ts` — no renderer changes required.
 */
export const ASSET_COMPONENTS: Record<AssetType, ComponentType<AssetProps>> = {
  desk: Desk,
  chair: Chair,
  'meeting-table': MeetingTable,
  sofa: Sofa,
  plant: Plant,
  partition: Partition,
  'server-rack': ServerRack,
  door: Door,
}

export type { AssetProps }
export { Desk, Chair, MeetingTable, Sofa, Plant, Partition, ServerRack, Door }
