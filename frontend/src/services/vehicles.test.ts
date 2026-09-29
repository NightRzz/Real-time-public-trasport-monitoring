import { describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { fetchVehicles } from './vehicles'

describe('fetchVehicles', () => {
  it('gets geojson from backend', async () => {
    const body = { type: 'FeatureCollection', features: [], last_update: null }
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: body })

    const result = await fetchVehicles()

    expect(get).toHaveBeenCalledWith('/api/vehicles')
    expect(result).toEqual(body)
  })
})
