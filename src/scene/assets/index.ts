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
import { CompositeAsset } from './CompositeAsset'

/**
 * Components for the built-in kit.
 *
 * Sparse by design: the asset type is an open union, and a type with no entry
 * here is drawn by `CompositeAsset` from the parts its definition carries. A
 * new kind of object no longer needs a file in this folder.
 */
export const ASSET_COMPONENTS: Partial<Record<AssetType, ComponentType<AssetProps>>> = {
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

export { CompositeAsset }
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
