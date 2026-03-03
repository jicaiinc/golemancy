import { query } from '@anthropic-ai/claude-agent-sdk'

// Must unset to avoid "nested session" detection when running inside Claude Code
delete process.env.CLAUDECODE

async function main() {
  console.log('Starting debug test...')
  try {
    const stream = query({
      prompt: 'Say hello in one word.',
      options: {
        model: 'claude-sonnet-4-6',
        maxTurns: 1,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        stderr: (data: string) => console.error('[STDERR]', data.trim()),
      },
    })
    for await (const msg of stream) {
      console.log('MSG:', msg.type, 'subtype' in msg ? msg.subtype : '')
    }
    console.log('Done!')
  } catch (err) {
    console.error('ERROR:', err)
  }
}

main()
