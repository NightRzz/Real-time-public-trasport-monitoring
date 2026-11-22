import type { VehicleCollection } from '../types/vehicle'

export type Position = [number, number]

export interface Glide {
  from: Position
  to: Position
  path: Position[] | null
  started: number
  duration: number
}

export interface Pose {
  position: Position
  bearing: number | null
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

function segmentBearing(a: Position, b: Position, scale: number): number {
  const dx = (b[0] - a[0]) * scale
  const dy = b[1] - a[1]
  return Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360) % 360
}

export function poseAlong(path: Position[], progress: number): Pose {
  const scale = lonScale(path[0][1])
  const lengths = path
    .slice(1)
    .map(([x, y], i) => Math.hypot((x - path[i][0]) * scale, y - path[i][1]))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress
  let lastBearing: number | null = null
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0) {
      lastBearing = segmentBearing(path[i], path[i + 1], scale)
      if (remaining <= lengths[i]) {
        const t = remaining / lengths[i]
        const [ax, ay] = path[i]
        const [bx, by] = path[i + 1]
        return {
          position: [ax + (bx - ax) * t, ay + (by - ay) * t],
          bearing: lastBearing,
        }
      }
    }
    remaining -= lengths[i]
  }
  return { position: path[path.length - 1], bearing: lastBearing }
}

export function pointAlong(path: Position[], progress: number): Position {
  return poseAlong(path, progress).position
}

export function remainingPath(path: Position[], from: Position): Position[] | null {
  if (path.length < 2) return null
  const scale = lonScale(from[1])
  let best = Infinity
  let bestT = 0
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
      bestT = t
      index = i
    }
  }
  if (best > MAX_PATH_OFFSET) return null
  if (index === 0 && bestT === 0 && !samePosition(from, path[0])) {
    return [from, ...path]
  }
  return [from, ...path.slice(index + 1)]
}

export function glidePose(glide: Glide, time: number): Pose {
  const progress = Math.min(1, Math.max(0, (time - glide.started) / glide.duration))
  if (progress >= 1) return { position: glide.to, bearing: null }
  if (glide.path) return poseAlong(glide.path, progress)
  const [ax, ay] = glide.from
  const [bx, by] = glide.to
  return {
    position: [ax + (bx - ax) * progress, ay + (by - ay) * progress],
    bearing: null,
  }
}

export function glidePosition(glide: Glide, time: number): Position {
  return glidePose(glide, time).position
}
