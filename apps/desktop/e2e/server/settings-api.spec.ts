import { test, expect } from '../fixtures'

const TEST_PROVIDER_SLUG = 'e2e-test-provider'

test.describe('Settings API', () => {
  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
  })

  test('GET /api/settings returns object with providers', async ({ helper }) => {
    const settings = await helper.apiGet('/api/settings')
    expect(settings).toHaveProperty('providers')
    expect(typeof settings.providers).toBe('object')
  })

  test('PATCH /api/settings updates a field', async ({ helper }) => {
    const updated = await helper.apiPatch('/api/settings', {
      defaultModel: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    })
    expect(updated).toHaveProperty('defaultModel')
    expect(updated.defaultModel.provider).toBe('anthropic')
  })

  test('GET /api/settings verifies updated field persisted', async ({ helper }) => {
    const settings = await helper.apiGet('/api/settings')
    expect(settings.defaultModel.provider).toBe('anthropic')
  })

  test('PATCH /api/settings adds custom provider entry', async ({ helper }) => {
    const settings = await helper.apiGet('/api/settings')
    const updated = await helper.apiPatch('/api/settings', {
      providers: {
        ...settings.providers,
        [TEST_PROVIDER_SLUG]: {
          name: 'E2E Test Provider',
          sdkType: 'openai',
          apiKey: 'test-key-123',
          models: ['gpt-test'],
        },
      },
    })
    expect(updated.providers[TEST_PROVIDER_SLUG]).toBeDefined()
    expect(updated.providers[TEST_PROVIDER_SLUG].name).toBe('E2E Test Provider')
  })

  test('GET /api/settings verifies custom provider exists', async ({ helper }) => {
    const settings = await helper.apiGet('/api/settings')
    expect(settings.providers[TEST_PROVIDER_SLUG]).toBeDefined()
    expect(settings.providers[TEST_PROVIDER_SLUG].sdkType).toBe('openai')
    expect(settings.providers[TEST_PROVIDER_SLUG].models).toContain('gpt-test')
  })

  test('PATCH /api/settings removes custom provider', async ({ helper }) => {
    const settings = await helper.apiGet('/api/settings')
    const { [TEST_PROVIDER_SLUG]: _, ...remainingProviders } = settings.providers
    const updated = await helper.apiPatch('/api/settings', {
      providers: remainingProviders,
    })
    expect(updated.providers[TEST_PROVIDER_SLUG]).toBeUndefined()
  })
})
