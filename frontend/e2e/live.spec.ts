import { expect, test } from '@playwright/test'
import { liveFrame, mockLive, mockVehicles } from './fixtures'

interface Viewport {
  type: 'viewport'
  bbox: [number, number, number, number]
  zoom: number
}

test('shows live vehicles and the city-wide count from the websocket', async ({ page }) => {
  await mockLive(page, (ws) => ws.send(JSON.stringify(liveFrame(240))))
  await page.goto('/')

  await expect(page.getByText('240 pojazdów')).toBeVisible()
  await expect(page.getByText('Nie udało się pobrać pozycji pojazdów')).toBeHidden()
})

test('tells the server what part of the map is visible', async ({ page }) => {
  const viewports: Viewport[] = []
  await mockLive(page, (ws) => {
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw))
      if (message.type === 'viewport') viewports.push(message)
    })
    ws.send(JSON.stringify(liveFrame()))
  })
  await page.goto('/')

  await expect.poll(() => viewports.length).toBeGreaterThan(0)
  const [west, south, east, north] = viewports[0].bbox
  expect(west).toBeLessThan(18.6466)
  expect(east).toBeGreaterThan(18.6466)
  expect(south).toBeLessThan(54.352)
  expect(north).toBeGreaterThan(54.352)
  expect(viewports[0].zoom).toBeCloseTo(12, 0)

  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()

  await expect.poll(() => viewports.at(-1)!.zoom).toBeGreaterThanOrEqual(13)
})

test('applies every new frame pushed by the server', async ({ page }) => {
  await mockLive(page, (ws) => {
    ws.send(JSON.stringify(liveFrame(200)))
    setTimeout(() => ws.send(JSON.stringify(liveFrame(201))), 1500)
  })
  await page.goto('/')

  await expect(page.getByText('200 pojazdów')).toBeVisible()
  await expect(page.getByText('201 pojazdów')).toBeVisible()
})

test('falls back to rest polling when the websocket is unavailable', async ({ page }) => {
  await mockVehicles(page)
  await page.goto('/')

  await expect(page.getByText('3 pojazdów')).toBeVisible()
})

test('reports offline when both the websocket and rest are down', async ({ page }) => {
  await mockLive(page, (ws) => ws.close())
  await page.goto('/')

  await expect(page.getByText('Nie udało się pobrać pozycji pojazdów')).toBeVisible()
})
