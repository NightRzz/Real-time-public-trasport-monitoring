import { expect, test } from '@playwright/test'
import { collection, mockVehicles } from './fixtures'
import { GDANSK_CENTER } from '../src/constants/map'

test('bus, tram and shared stops open the correct departures and expire stale countdowns', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const now = Date.now()
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  let showVehicle = false
  const selectedVehicle = collection().features[0]
  selectedVehicle.geometry.coordinates = [GDANSK_CENTER[0], GDANSK_CENTER[1] + 0.003]
  await mockVehicles(page, (route) =>
    route.fulfill({
      json: {
        ...collection(),
        features: showVehicle ? [selectedVehicle] : [],
      },
    }),
  )
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
  const stops = ['tram', 'bus', 'bus_tram'].map((type, index) => ({
    type: 'Feature',
    id: index + 1,
    geometry: {
      type: 'Point',
      coordinates: [GDANSK_CENTER[0] + [0, 0.003, -0.003][index], GDANSK_CENTER[1]],
    },
    properties: {
      stop_id: index + 1,
      name: ['Tram stop', 'Bus stop', 'Shared stop'][index],
      code: `0${index + 1}`,
      type,
    },
  }))
  stops.push({
    ...stops[0],
    id: 4,
    geometry: { type: 'Point', coordinates: [GDANSK_CENTER[0] + 0.001, GDANSK_CENTER[1]] },
    properties: { ...stops[0].properties, stop_id: 4, code: '02' },
  })
  await page.route('**/api/vehicles/*/journey', (route) =>
    route.fulfill({
      json: {
        vehicle_id: 1,
        route_id: 8,
        trip_id: 11,
        stop_ids: [1, 3],
        route: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              stops[2].geometry.coordinates,
              stops[0].geometry.coordinates,
              selectedVehicle.geometry.coordinates,
            ],
          },
        },
        route_status: 'available',
        next_stop: null,
        prediction_status: 'unavailable',
      },
    }),
  )
  await page.route('**/api/stops', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: stops } }),
  )
  let requests = 0
  await page.route('**/api/stops/*/arrivals', (route) => {
    requests++
    return route.fulfill({
      json: {
        status: 'available',
        arrivals: [
          {
            line: '8',
            type: 'tram',
            headsign: 'Jelitkowo',
            time: new Date(now + 120_000).toISOString(),
            realtime: true,
            updated_at: new Date(now).toISOString(),
          },
          {
            line: '111',
            type: 'bus',
            headsign: 'Dworzec Główny',
            time: new Date(now + 360_000).toISOString(),
            realtime: false,
            updated_at: new Date(now).toISOString(),
          },
        ],
      },
    })
  })
  await page.goto('/')
  await expect(page.getByTestId('map')).toHaveAttribute('data-loaded', 'true')
  expect(requests).toBe(0)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = (await canvas.boundingBox())!
  const sheet = page.getByRole('dialog')
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(sheet).toBeHidden()
  expect(requests).toBe(0) // Stops remain hidden at the previous zoom threshold (14).
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const iconPixels = async (position: { x: number; y: number }, size = 40, mode = 'color') => {
    const png = await page.screenshot({
      clip: {
        x: box.x + position.x - size / 2,
        y: box.y + position.y - size / 2,
        width: size,
        height: size,
      },
      scale: 'css',
    })
    return page.evaluate(
      async ({ base64, size, mode }) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${base64}`)).blob(),
        )
        const context = new OffscreenCanvas(size, size).getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        const { data } = context.getImageData(0, 0, size, size)
        let count = 0
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = data.slice(i, i + 3)
          const matches =
            mode === 'gray'
              ? r >= 100 && r <= 190 && Math.max(r, g, b) - Math.min(r, g, b) < 3
              : (r > 100 && r > g * 1.5 && r > b * 1.5) || (b > 100 && b > r * 1.5 && b > g * 1.1)
          if (matches) count++
        }
        return count
      },
      { base64: png.toString('base64'), size, mode },
    )
  }
  for (const index of [1, 2, 0]) {
    const position = {
      x: box.width / 2 + ([0, 0.003, -0.003][index] / 360) * 512 * 2 ** 15,
      y: box.height / 2,
    }
    await expect
      .poll(async () => {
        await canvas.hover({ position })
        return canvas.evaluate((element) => getComputedStyle(element).cursor)
      })
      .toBe('pointer')
    const sample = () => iconPixels(position)
    await expect.poll(sample).toBeGreaterThan(10)
    const unselectedPixels = await sample()
    await canvas.click({ position })
    await expect(
      sheet.getByRole('heading', {
        name: `${stops[index].properties.name} 0${index + 1}`,
        exact: true,
      }),
    ).toBeVisible()
    await expect(sheet.getByText('Jelitkowo')).toBeVisible()
    await expect(sheet.getByText('2 min', { exact: true })).toBeVisible()
    await expect(sheet.getByText(/Na żywo/)).toBeVisible()
    await expect(sheet.getByText(/Rozkład/)).toBeVisible()
    await expect.poll(sample).toBeGreaterThan(unselectedPixels + 50)
    await sheet.getByRole('button', { name: 'Zamknij szczegóły przystanku' }).click()
    await expect(sheet).toBeHidden()
    await expect.poll(sample).toBe(unselectedPixels)
  }
  showVehicle = true
  const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const vehiclePosition = {
    x: box.width / 2,
    y:
      box.height / 2 -
      ((mercatorY(selectedVehicle.geometry.coordinates[1]) - mercatorY(GDANSK_CENTER[1])) /
        (2 * Math.PI)) *
        512 *
        2 ** 15,
  }
  await expect
    .poll(async () => {
      await canvas.hover({ position: vehiclePosition })
      return canvas.evaluate((element) => getComputedStyle(element).cursor)
    })
    .toBe('pointer')
  await canvas.click({ position: vehiclePosition })
  await expect(sheet.getByRole('heading', { name: 'Dworzec Główny' })).toBeVisible()
  for (const [index, stop] of stops.entries()) {
    const position = {
      x: box.width / 2 + ((stop.geometry.coordinates[0] - GDANSK_CENTER[0]) / 360) * 512 * 2 ** 15,
      y: box.height / 2,
    }
    // Inspect the icon interior: the route itself can run underneath the marker.
    const sample = () => iconPixels(position, 16)
    if (index === 1 || index === 3) {
      await expect.poll(sample).toBe(0)
      await expect.poll(() => iconPixels(position, 16, 'gray')).toBeGreaterThan(10)
    } else await expect.poll(sample).toBeGreaterThan(10)
  }
  for (const zoom of [14, 13]) {
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
    for (const [index, stop] of stops.entries()) {
      // At zoom 13 the opposite platform overlaps the relevant stop's icon footprint.
      if (zoom === 13 && index === 3) continue
      const position = {
        x:
          box.width / 2 +
          ((stop.geometry.coordinates[0] - GDANSK_CENTER[0]) / 360) * 512 * 2 ** zoom,
        y: box.height / 2,
      }
      if (index === 0 || index === 2) {
        await expect.poll(() => iconPixels(position, 16)).toBeGreaterThan(10)
      } else {
        await expect.poll(() => iconPixels(position, 16)).toBe(0)
        await expect.poll(() => iconPixels(position, 16, 'gray')).toBe(0)
      }
    }
  }
  await sheet.getByRole('button', { name: 'Zamknij szczegóły pojazdu' }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => iconPixels({ x: box.width / 2, y: box.height / 2 }, 16)).toBe(0)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await canvas.click({ position: vehiclePosition })
  await expect(sheet.getByRole('heading', { name: 'Dworzec Główny' })).toBeVisible()
  await canvas.click({
    position: {
      x: box.width / 2 + (0.001 / 360) * 512 * 2 ** 15,
      y: box.height / 2,
    },
  })
  await expect(sheet.getByRole('heading', { name: 'Tram stop 02', exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Zamknij szczegóły przystanku' }).click()
  await expect(sheet).toBeHidden()
  await expect
    .poll(() =>
      iconPixels({ x: box.width / 2 + (0.001 / 360) * 512 * 2 ** 15, y: box.height / 2 }, 16),
    )
    .toBeGreaterThan(10)
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await page.clock.setSystemTime(new Date(now + 100_000))
  await expect(sheet.getByText(/Dane nieaktualne/)).toBeVisible()
  await expect(sheet.getByText('2 min', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(canvas).toBeFocused()
  expect(errors).toEqual([])
})
