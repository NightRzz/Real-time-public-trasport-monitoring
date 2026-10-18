import { expect, test, type Route } from '@playwright/test'
import { collection, mockVehicles } from './fixtures'
import { GDANSK_CENTER } from '../src/constants/map'

test('selection isolates a vehicle, preserves the view and draws repeated route arrows', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const now = Date.now()
  const data = collection()
  data.features[0].geometry.coordinates = [GDANSK_CENTER[0], GDANSK_CENTER[1] + 0.003]
  data.features[1].geometry.coordinates = [GDANSK_CENTER[0] + 0.006, GDANSK_CENTER[1] + 0.003]
  data.features[2].geometry.coordinates = [GDANSK_CENTER[0] - 0.006, GDANSK_CENTER[1] + 0.006]
  await mockVehicles(page, (route) => route.fulfill({ json: data }))
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
  const latitude = data.features[2].geometry.coordinates[1]
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
          [18.6, latitude],
          [18.7, latitude],
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
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = (await canvas.boundingBox())!
  const project = ([lon, lat]: number[], zoom: number) => {
    const world = 512 * 2 ** zoom
    const mercatorY = (latitude: number) =>
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360))
    return {
      x: box.width / 2 + ((lon - GDANSK_CENTER[0]) / 360) * world,
      y: box.height / 2 - ((mercatorY(lat) - mercatorY(GDANSK_CENTER[1])) / (2 * Math.PI)) * world,
    }
  }
  const first = project(data.features[0].geometry.coordinates, 14)
  await expect
    .poll(async () => {
      await canvas.hover({ position: first })
      return canvas.evaluate((element) => getComputedStyle(element).cursor)
    })
    .toBe('pointer')
  await canvas.click({ position: first })
  await expect.poll(() => !!pending).toBe(true)
  const sheet = page.getByRole('dialog')
  // Close the first selection to restore the other vehicles, then select a different one.
  await sheet.getByRole('button', { name: 'Zamknij szczegóły pojazdu' }).click()
  await expect(sheet).toBeHidden()
  const third = project(data.features[2].geometry.coordinates, 14)
  await expect
    .poll(async () => {
      await canvas.hover({ position: third })
      return canvas.evaluate((element) => getComputedStyle(element).cursor)
    })
    .toBe('pointer')
  await canvas.click({ position: third })
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
  await expect(sheet.getByText('Predicted stop 01')).toBeVisible()
  await expect(sheet.getByText('Wrong vehicle stop 01')).toHaveCount(0)
  await expect(sheet.getByText('Za chwilę')).toBeVisible()

  const painted = async (zoom: number) => {
    const screenshot = (
      await canvas.screenshot({
        scale: 'css',
        style: '[role="dialog"] { visibility: hidden !important; }',
      })
    ).toString('base64')
    return page.evaluate(
      async ({ base64, vehicle }) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${base64}`)).blob(),
        )
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
        let blue = 0,
          line = 0,
          marker = 0
        const arrowColumns = new Set<number>()
        for (let i = 0; i < data.length; i += 4) {
          const x = (i / 4) % bitmap.width,
            y = Math.floor(i / 4 / bitmap.width)
          if (data[i + 2] > 120 && data[i + 2] > data[i] * 2 && data[i + 2] > data[i + 1] * 1.3)
            blue++
          if (data[i] < 120 || data[i] < data[i + 1] * 2 || data[i] < data[i + 2] * 2) continue
          if (Math.abs(y - vehicle.y) <= 2) line++
          if (Math.hypot(x - vehicle.x, y - vehicle.y) < 8) marker++
          if (
            Math.abs(x - vehicle.x) > 24 &&
            Math.abs(y - vehicle.y) > 4 &&
            Math.abs(y - vehicle.y) < 9
          )
            arrowColumns.add(x)
        }
        const columns = [...arrowColumns].sort((a, b) => a - b)
        const arrows = columns.filter((x, i) => i === 0 || x - columns[i - 1] > 4).length
        return { blue, viewUnchanged: line > bitmap.width * 2 && marker > 40, arrows }
      },
      { base64: screenshot, vehicle: project(data.features[2].geometry.coordinates, zoom) },
    )
  }
  for (const zoom of [14, 13]) {
    if (zoom === 13) await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
    await expect.poll(() => painted(zoom)).toMatchObject({ blue: 0, viewUnchanged: true })
    await expect.poll(async () => (await painted(zoom)).arrows).toBeGreaterThanOrEqual(2)
  }
  // Expire the ETA, then wait for a prediction refresh: neither may change the chosen view.
  await page.clock.setSystemTime(new Date(now + 30_000))
  await expect(sheet.getByText('Predicted stop 01')).toHaveCount(0)
  await expect(sheet.getByText('Brak aktualnej prognozy dla tego kursu.')).toBeVisible()
  response.prediction_status = 'error'
  await expect(sheet.getByText(/Nie udało się pobrać prognozy/)).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => painted(13)).toMatchObject({ blue: 0, viewUnchanged: true })
  await sheet.getByRole('button', { name: 'Zamknij szczegóły pojazdu' }).focus()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(canvas).toBeFocused()
  await expect.poll(async () => (await painted(13)).blue).toBeGreaterThan(10)
})
