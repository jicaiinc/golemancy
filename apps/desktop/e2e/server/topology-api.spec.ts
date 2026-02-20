import { test, expect } from '../fixtures'

test.describe('Topology Layout API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Topology API Test')
    projectId = project.id
  })

  test('GET /topology-layout returns empty object initially', async ({ helper }) => {
    const layout = await helper.apiGet(`/api/projects/${projectId}/topology-layout`)
    expect(typeof layout).toBe('object')
    expect(Object.keys(layout).length).toBe(0)
  })

  test('PUT /topology-layout saves positions', async ({ helper }) => {
    const positions = { 'agent-1': { x: 100, y: 200 }, 'agent-2': { x: 300, y: 400 } }
    const result = await helper.apiPut(`/api/projects/${projectId}/topology-layout`, positions)
    expect(result['agent-1']).toEqual({ x: 100, y: 200 })
    expect(result['agent-2']).toEqual({ x: 300, y: 400 })
  })

  test('GET /topology-layout returns saved positions', async ({ helper }) => {
    const layout = await helper.apiGet(`/api/projects/${projectId}/topology-layout`)
    expect(layout['agent-1']).toEqual({ x: 100, y: 200 })
    expect(layout['agent-2']).toEqual({ x: 300, y: 400 })
  })

  test('PUT /topology-layout overwrites with new positions', async ({ helper }) => {
    const newPositions = { 'agent-3': { x: 500, y: 600 } }
    const result = await helper.apiPut(`/api/projects/${projectId}/topology-layout`, newPositions)
    expect(result['agent-3']).toEqual({ x: 500, y: 600 })
    // Old positions should be gone
    expect(result['agent-1']).toBeUndefined()
  })

  test('DELETE /topology-layout resets to empty', async ({ helper }) => {
    const delResult = await helper.apiDelete(`/api/projects/${projectId}/topology-layout`)
    expect(delResult.ok).toBe(true)

    const layout = await helper.apiGet(`/api/projects/${projectId}/topology-layout`)
    expect(Object.keys(layout).length).toBe(0)
  })
})
