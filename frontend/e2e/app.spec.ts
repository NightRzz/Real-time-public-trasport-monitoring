import { expect, test } from '@playwright/test'
import { collection, mockVehicles } from './fixtures'

test('fills the screen with the map and a small status box', async ({ page }) => {
  await mockVehicles(page)
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Gdańsk · Komunikacja', exact: true }),
  ).toBeAttached()
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  const status = page.getByText('3 pojazdów')
  await expect(status).toBeVisible()
  const map = (await page.getByTestId('map').boundingBox())!
  const box = (await status.boundingBox())!
  const zoom = (await page.getByRole('button', { name: 'Zoom in' }).boundingBox())!
  expect(map).toMatchObject({ x: 0, y: 0, height: page.viewportSize()!.height })
  expect(box.y).toBeLessThan(40)
  expect(box.x + box.width).toBeLessThan(zoom.x)
})

test('shows number of vehicles from backend', async ({ page }) => {
  await mockVehicles(page)
  await page.goto('/')

  await expect(page.getByText('3 pojazdów')).toBeVisible()
})

test('polls backend for new positions', async ({ page }) => {
  let calls = 0
  await mockVehicles(page, (route) => {
    calls += 1
    return route.fulfill({ json: collection() })
  })
  await page.goto('/')

  await expect.poll(() => calls).toBeGreaterThanOrEqual(3)
})

test('shows error when backend is down', async ({ page }) => {
  await mockVehicles(page, (route) => route.abort())
  await page.goto('/')

  await expect(page.getByText('Nie udało się pobrać pozycji pojazdów')).toBeVisible()
})

test('recovers when backend comes back', async ({ page }) => {
  let backendUp = false
  await mockVehicles(page, (route) =>
    backendUp ? route.fulfill({ json: collection() }) : route.abort(),
  )
  await page.goto('/')
  await expect(page.getByText('Nie udało się pobrać pozycji pojazdów')).toBeVisible()

  backendUp = true

  await expect(page.getByText('3 pojazdów')).toBeVisible()
  await expect(page.getByText('Nie udało się pobrać pozycji pojazdów')).toBeHidden()
})

test('marks data as stale when city api stopped updating', async ({ page }) => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
  await mockVehicles(page, (route) => route.fulfill({ json: collection(tenMinutesAgo) }))
  await page.goto('/')

  await expect(page.getByText(/Dane nieaktualne/)).toBeVisible()
})

test('warns when map style cannot be loaded', async ({ page }) => {
  await mockVehicles(page)
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
  await page.goto('/')

  await expect(page.getByText('Nie udało się załadować mapy')).toBeVisible()
  await expect(page.getByText('3 pojazdów')).toBeVisible()
})

test('page does not scroll horizontally', async ({ page }) => {
  await mockVehicles(page)
  await page.goto('/')
  await expect(page.getByText('3 pojazdów')).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
