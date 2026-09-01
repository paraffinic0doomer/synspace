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
import { StorageUnit } from './StorageUnit'
import { Whiteboard } from './Whiteboard'
import { CafeTable } from './CafeTable'
import { Counter } from './Counter'
import { WallSegment } from './WallSegment'
import { Barrier } from './Barrier'
import { Building } from './Building'
import { Hospital } from './Hospital'
import { Road } from './Road'
import { Vehicle } from './Vehicle'

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
  'storage-unit': StorageUnit,
  whiteboard: Whiteboard,
  'cafe-table': CafeTable,
  counter: Counter,
  'wall-segment': WallSegment,
  barrier: Barrier,
  building: Building,
  hospital: Hospital,
  road: Road,
  vehicle: Vehicle,
}

export type { AssetProps }
export {
  Desk,
  Chair,
  MeetingTable,
  Sofa,
  Plant,
  Partition,
  ServerRack,
  Door,
  StorageUnit,
  Whiteboard,
  CafeTable,
  Counter,
  WallSegment,
  Barrier,
  Building,
  Hospital,
  Road,
  Vehicle,
}
