import type {
  ActorRef,
  AssetType,
  EnvironmentSettings,
  Scene,
  SceneObject,
  Vec3,
} from '@/types'
import { agentActor } from '@/types'
import type { CreateObjectOptions } from '@/tools/assetCatalog'
import { useSceneStore, type ObjectPatch } from './sceneStore'

/**
 * Framework-free access to the scene.
 *
 * This is the seam the WebMCP tool layer will sit on: it imports no React and
 * no Three.js, reads through Zustand's vanilla `getState`, and returns plain
 * results instead of throwing. Registering tools against these functions keeps
 * `document.modelContext` completely independent of the renderer — swapping the
 * 3D layer would not touch a single tool definition.
 *
 * Nothing calls this yet; it exists so Phase 3 has one obvious place to bind.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data })
const fail = <T = never>(error: string): ApiResult<T> => ({ ok: false, error })

const store = () => useSceneStore.getState()

const requireObject = (id: string): SceneObject | undefined =>
  store().scene.objects.find((object) => object.id === id)

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n))

export const sceneApi = {
  /** Full scene document — objects, environment and constraints. */
  readScene(): Scene {
    return store().scene
  },

  readObject(id: string): ApiResult<SceneObject> {
    const object = requireObject(id)
    return object ? ok(object) : fail(`No object with id "${id}".`)
  },

  listObjects(type?: AssetType): SceneObject[] {
    const objects = store().scene.objects
    return type ? objects.filter((object) => object.type === type) : objects
  },

  spawn(type: AssetType, options: CreateObjectOptions, actor: ActorRef): ApiResult<string> {
    if (options.position && !isVec3(options.position)) {
      return fail('position must be a [x, y, z] tuple of finite numbers.')
    }
    try {
      return ok(store().addObject(type, options, actor))
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Failed to place object.')
    }
  },

  move(id: string, position: Vec3, actor: ActorRef): ApiResult<SceneObject> {
    if (!isVec3(position)) return fail('position must be a [x, y, z] tuple of finite numbers.')
    const object = requireObject(id)
    if (!object) return fail(`No object with id "${id}".`)
    if (object.locked) return fail(`"${object.label}" is locked.`)
    return store().moveObject(id, position, actor)
      ? ok(requireObject(id)!)
      : fail(`Could not move "${id}".`)
  },

  rotate(id: string, rotation: Vec3, actor: ActorRef): ApiResult<SceneObject> {
    if (!isVec3(rotation)) return fail('rotation must be a [x, y, z] tuple in radians.')
    const object = requireObject(id)
    if (!object) return fail(`No object with id "${id}".`)
    if (object.locked) return fail(`"${object.label}" is locked.`)
    return store().rotateObject(id, rotation, actor)
      ? ok(requireObject(id)!)
      : fail(`Could not rotate "${id}".`)
  },

  update(id: string, patch: ObjectPatch, actor: ActorRef): ApiResult<SceneObject> {
    if (!requireObject(id)) return fail(`No object with id "${id}".`)
    return store().updateObject(id, patch, actor)
      ? ok(requireObject(id)!)
      : fail(`Could not update "${id}".`)
  },

  remove(id: string, actor: ActorRef): ApiResult<{ id: string }> {
    const object = requireObject(id)
    if (!object) return fail(`No object with id "${id}".`)
    return store().deleteObject(id, actor) ? ok({ id }) : fail(`Could not delete "${id}".`)
  },

  clear(actor: ActorRef): ApiResult<{ removed: number }> {
    const removed = store().scene.objects.length
    store().clearScene(actor)
    return ok({ removed })
  },

  setEnvironment(patch: Partial<EnvironmentSettings>, actor: ActorRef): ApiResult<EnvironmentSettings> {
    store().updateEnvironment(patch, actor)
    return ok(store().scene.environment)
  },

  undo(): ApiResult<{ undone: boolean }> {
    return ok({ undone: store().undo() })
  },

  /** Convenience for tool handlers that only carry an agent name. */
  actorFor: agentActor,
}

export type SceneApi = typeof sceneApi
