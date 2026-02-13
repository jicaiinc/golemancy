import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PlaywrightDriver } from './playwright'

describe('PlaywrightDriver', () => {
  let driver: PlaywrightDriver

  beforeAll(async () => {
    driver = new PlaywrightDriver({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await driver.close()
  })

  it('should launch browser and navigate to a page', async () => {
    expect(driver.isConnected()).toBe(false)

    await driver.connect()
    const snapshot = await driver.navigate('https://example.com')

    expect(driver.isConnected()).toBe(true)
    expect(snapshot.url).toBe('https://example.com/')
    expect(snapshot.title).toContain('Example')
    expect(snapshot.elements.length).toBeGreaterThan(0)
    expect(snapshot.text).toContain('Example Domain')
  }, 30_000)

  it('should find interactive elements with refs', async () => {
    const snapshot = await driver.snapshot()

    // Helper to find all elements with refs (recursive)
    const findElementsWithRefs = (elements: typeof snapshot.elements): typeof snapshot.elements => {
      const result: typeof snapshot.elements = []
      for (const el of elements) {
        if (el.ref) result.push(el)
        if (el.children) result.push(...findElementsWithRefs(el.children))
      }
      return result
    }

    const elementsWithRefs = findElementsWithRefs(snapshot.elements)
    expect(elementsWithRefs.length).toBeGreaterThan(0)

    // Verify ref format
    for (const el of elementsWithRefs) {
      expect(el.ref).toMatch(/^e\d+$/)
    }
  }, 10_000)

  it('should take a screenshot', async () => {
    const shot = await driver.screenshot(false)
    expect(shot.base64).toBeTruthy()
    expect(shot.width).toBeGreaterThan(0)
    expect(shot.height).toBeGreaterThan(0)
  }, 10_000)

  it('should reject invalid refs', async () => {
    await expect(driver.click('invalid-ref')).rejects.toThrow('Invalid element ref')
    await expect(driver.click('e0"; alert(1); //')).rejects.toThrow('Invalid element ref')
  }, 10_000)

  it('should reconnect after browser crash', async () => {
    // Simulate crash by killing browser
    await driver['browser']?.close()

    // isConnected should detect the crash
    expect(driver.isConnected()).toBe(false)

    // Next operation should reconnect
    const snapshot = await driver.navigate('https://example.com')
    expect(driver.isConnected()).toBe(true)
    expect(snapshot.url).toBe('https://example.com/')
  }, 30_000)
})
