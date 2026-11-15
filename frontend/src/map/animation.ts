import type { VehicleCollection } from '../types/vehicle'

export type Position = [number, number]

export interface Glide {
  from: Position
  to: Position
  path: Position[] | null
  started: number
  duration: number
}

export const MAX_PATH_OFFSET = 0.0005

export function positions(collection: VehicleCollection) {
  return new Map(
    collection.features.map((f) => [f.properties.vehicle_id, f.geometry.coordinates as Position]),
  )
}

export function samePosition(a: Position, b: Position) {
  return a[0] === b[0] && a[1] === b[1]
}

function lonScale(lat: number) {
  return Math.cos((lat * Math.PI) / 180)
}

export function pointAlong(path: Position[], progress: number): Position {
  const scale = lonScale(path[0][1])
  const lengths = path
    .slice(1)
    .map(([x, y], i) => Math.hypot((x - path[i][0]) * scale, y - path[i][1]))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const t = remaining / lengths[i]
      const [ax, ay] = path[i]
      const [bx, by] = path[i + 1]
      return [ax + (bx - ax) * t, ay + (by - ay) * t]
    }
    remaining -= lengths[i]
  }
  return path[path.length - 1]
}

export function remainingPath(path: Position[], from: Position): Position[] | null {
  if (path.length < 2) return null
  const scale = lonScale(from[1])
  let best = Infinity
  let index = 0
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i]
    const [bx, by] = path[i + 1]
    const dx = (bx - ax) * scale
    const dy = by - ay
    const px = (from[0] - ax) * scale
    const py = from[1] - ay
    const length = dx * dx + dy * dy
    const t = length > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / length)) : 0
    const distance = Math.hypot(px - t * dx, py - t * dy)
    if (distance < best) {
      best = distance
      index = i
    }
  }
  return best <= MAX_PATH_OFFSET ? [from, ...path.slice(index + 1)] : null
}

export function glidePosition(glide: Glide, time: number): Position {
  const progress = Math.min(1, Math.max(0, (time - glide.started) / glide.duration))
  if (progress >= 1) return glide.to
  if (glide.path) return pointAlong(glide.path, progress)
  const [ax, ay] = glide.from
  const [bx, by] = glide.to
  return [ax + (bx - ax) * progress, ay + (by - ay) * progress]
}
