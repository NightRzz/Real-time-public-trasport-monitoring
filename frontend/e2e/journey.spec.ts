import { expect, test, type Route } from '@playwright/test'
import { collection, mockVehicles } from './fixtures'
import { GDANSK_CENTER, GDANSK_ZOOM } from '../src/constants/map'

test('vehicle selection draws the route, fits above the panel and handles missing predictions', async ({
  page,
}) => {
  const now = Date.now()
  await mockVehicles(page, (route) => {
    const data = collection()
    data.features = data.features.filter((vehicle) => vehicle.properties.type === 'tram')
    return route.fulfill({ json: data })
  })
  await page.route('https://tiles.openfreemap.org/styles/liberty', (route) =>
    route.fulfill({
      json: {
        version: 8,
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {},
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#edf0f3' } },
        ],
      },
    }),
  )
  const response = {
    vehicle_id: 3,
    route_id: 2,
    trip_id: 11,
    route: {
      type: 'Feature',
      properties: { route_id: 2, trip_id: 11 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [18.64, 54.35],
          [18.6466, 54.352],
          [18.65, 54.36],
        ],
      },
    },
    next_stop: {
      stop: { stop_id: 1, name: 'Predicted stop', code: '01' },
      estimated_time: new Date(now + 20_000).toISOString(),
      prediction_updated_at: new Date(now).toISOString(),
    },
    route_status: 'available',
    prediction_status: 'available',
  }
  let pending: Route | undefined
  await page.route('**/api/vehicles/*/journey', (route) => {
    if (route.request().url().includes('/1/journey')) {
      pending = route
      return
    }
    return route.fulfill({ json: response })
  })
  await page.goto('/')
  await expect(page.getByTestId('map')).toHaveAttribute('data-loaded', 'true')
  const canvas = page.locator('canvas.maplibregl-canvas')
  const initial = (await canvas.boundingBox())!
  const position = { x: initial.width / 2, y: initial.height / 2 }
  await expect
    .poll(async () => {
      await canvas.hover({ position })
      return canvas.evaluate((element) => getComputedStyle(element).cursor)
    })
    .toBe('pointer')
  await canvas.click({ position })
  await expect.poll(() => !!pending).toBe(true)
  // Click vehicle 3 while vehicle 1's response is still pending; the map has not moved yet.
  const [lon, lat] = collection().features.find((vehicle) => vehicle.id === 3)!.geometry.coordinates
  const world = 512 * 2 ** GDANSK_ZOOM
  const mercatorY = (latitude: number) =>
    Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360))
  await canvas.click({
    position: {
      x: initial.width / 2 + ((lon - GDANSK_CENTER[0]) / 360) * world,
      y:
        initial.height / 2 -
        ((mercatorY(lat) - mercatorY(GDANSK_CENTER[1])) / (2 * Math.PI)) * world,
    },
  })
  await pending!.fulfill({
    json: {
      ...response,
      vehicle_id: 1,
      route_id: 8,
      next_stop: {
        ...response.next_stop,
        stop: { stop_id: 2, name: 'Wrong vehicle stop', code: '01' },
      },
    },
  })
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Predicted stop 01')).toBeVisible()
  await expect(sheet.getByText('Wrong vehicle stop 01')).toHaveCount(0)
  await expect(sheet.getByText('Za chwilę')).toBeVisible()

  // A tram route must render red across the route, not just the small vehicle circles.
  for (const viewport of [page.viewportSize()!, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => {
        const screenshot = (
          await canvas.screenshot({
            scale: 'css',
            style: '[role="dialog"] { visibility: hidden !important; }',
          })
        ).toString('base64')
        const painted = await page.evaluate(async (base64) => {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${base64}`)).blob(),
          )
          const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
          context.drawImage(bitmap, 0, 0)
          const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
          let count = 0,
            bottom = 0
          const rows = new Set<number>()
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 120 && data[i] > data[i + 1] * 2 && data[i] > data[i + 2] * 2) {
              count++
              bottom = Math.floor(i / 4 / bitmap.width)
              rows.add(bottom)
            }
          }
          return { count, bottom, rows: rows.size }
        }, screenshot)
        const panel = (await sheet.boundingBox())!,
          map = (await canvas.boundingBox())!
        return painted.count > 20 && painted.rows > 40 && painted.bottom < panel.y - map.y
      })
      .toBe(true)
  }
  // Expire the ETA while GPS and prediction timestamps are still within the 90-second limit.
  await page.clock.setSystemTime(new Date(now + 30_000))
  await expect(sheet.getByText('Predicted stop 01')).toHaveCount(0)
  await expect(sheet.getByText('Brak aktualnej prognozy dla tego kursu.')).toBeVisible()
  response.prediction_status = 'error'
  await expect(sheet.getByText(/Nie udało się pobrać prognozy/)).toBeVisible({ timeout: 15_000 })
  await sheet.getByRole('button', { name: 'Zamknij szczegóły pojazdu' }).focus()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(canvas).toBeFocused()
})
