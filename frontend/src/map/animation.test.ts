import { describe, expect, it } from 'vitest'
import { glidePosition, pointAlong, poseAlong, remainingPath, type Glide } from './animation'

const path: [number, number][] = [
  [18.6, 54.35],
  [18.6, 54.36],
  [18.62, 54.36],
]

describe('pointAlong', () => {
  it('walks the polyline by distance', () => {
    expect(pointAlong(path, 0)).toEqual([18.6, 54.35])
    expect(pointAlong(path, 1)).toEqual([18.62, 54.36])
    const [lon, lat] = pointAlong(path, 0.2)
    expect(lon).toBeCloseTo(18.6)
    expect(lat).toBeGreaterThan(54.35)
    expect(lat).toBeLessThan(54.36)
  })
})

describe('poseAlong', () => {
  it('computes segment bearing around corners', () => {
    expect(poseAlong(path, 0.2).bearing).toBe(0)
    expect(poseAlong(path, 0.8).bearing).toBe(90)
  })
})

describe('remainingPath', () => {
  it('continues from the nearest segment without going back', () => {
    expect(remainingPath(path, [18.61, 54.36])).toEqual([
      [18.61, 54.36],
      [18.62, 54.36],
    ])
  })

  it('preserves the first corner when starting slightly behind path[0]', () => {
    expect(remainingPath(path, [18.6, 54.3499])).toEqual([[18.6, 54.3499], ...path])
  })

  it('gives up when the marker is far from the path', () => {
    expect(remainingPath(path, [18.7, 54.4])).toBeNull()
  })
})

describe('glidePosition', () => {
  it('moves in a straight line without a path and stops at the target', () => {
    const glide: Glide = { from: [0, 0], to: [2, 2], path: null, started: 100, duration: 1000 }

    expect(glidePosition(glide, 600)).toEqual([1, 1])
    expect(glidePosition(glide, 5000)).toEqual([2, 2])
  })
})
