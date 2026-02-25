/**
 * Run all Agent SDK sub-agent capability tests
 */

// Must unset to avoid "nested session" detection when running inside Claude Code
delete process.env.CLAUDECODE

import { runTest1 } from './test-1-basic-subagent.js'
import { runTest2 } from './test-2-custom-tools.js'
import { runTest3 } from './test-3-skills.js'
import { runTest4 } from './test-4-mcp-servers.js'
import { runTest5 } from './test-5-tool-restrictions.js'
import { runTest6 } from './test-6-nesting.js'
import { runTest7 } from './test-7-combined.js'
import { runTest8 } from './test-8-mcp-bridge-nesting.js'
import { runTest9 } from './test-9-deep-nesting.js'

interface TestCase {
  name: string
  run: () => Promise<boolean>
}

const tests: TestCase[] = [
  { name: 'Test 1: Basic Sub-agent', run: runTest1 },
  { name: 'Test 2: Custom Tools (MCP)', run: runTest2 },
  { name: 'Test 3: Skills', run: runTest3 },
  { name: 'Test 4: Independent MCP Servers', run: runTest4 },
  { name: 'Test 5: Tool Restrictions', run: runTest5 },
  { name: 'Test 6: Nesting (Expected Blocked)', run: runTest6 },
  { name: 'Test 7: Combined', run: runTest7 },
  { name: 'Test 8: MCP Bridge Nesting', run: runTest8 },
  { name: 'Test 9: 3-Level Deep Nesting', run: runTest9 },
]

async function main() {
  // Parse which tests to run from CLI args
  const args = process.argv.slice(2)
  let selectedTests = tests

  if (args.length > 0) {
    const indices = args.map((a: string) => parseInt(a, 10) - 1).filter((i: number) => i >= 0 && i < tests.length)
    if (indices.length > 0) {
      selectedTests = indices.map((i: number) => tests[i])
    }
  }

  console.log('\n' + '█'.repeat(60))
  console.log('  Claude Agent SDK — Sub-agent Capability Tests')
  console.log('  ' + new Date().toISOString())
  console.log('█'.repeat(60))
  console.log(`\n  Running ${selectedTests.length} of ${tests.length} tests...\n`)

  const results: { name: string; passed: boolean; error?: string }[] = []

  for (const test of selectedTests) {
    try {
      const passed = await test.run()
      results.push({ name: test.name, passed })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`\n  ❌ ${test.name} threw an error: ${errorMsg}`)
      results.push({ name: test.name, passed: false, error: errorMsg })
    }
  }

  // Print summary
  console.log('\n' + '█'.repeat(60))
  console.log('  SUMMARY')
  console.log('█'.repeat(60))

  const passCount = results.filter((r) => r.passed).length
  const failCount = results.filter((r) => !r.passed).length

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`  ${icon} ${r.name}${r.error ? ` (Error: ${r.error.slice(0, 80)})` : ''}`)
  }

  console.log(`\n  Total: ${passCount} passed, ${failCount} failed out of ${results.length}`)
  console.log('█'.repeat(60) + '\n')

  process.exit(failCount > 0 ? 1 : 0)
}

main()
