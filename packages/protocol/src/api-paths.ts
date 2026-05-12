export const API_PATHS = {
  health: '/health',
  config: '/config',
  runs: '/runs',
  runEvents: (runId: string) => `/runs/${encodeURIComponent(runId)}/events`,
  runCancel: (runId: string) => `/runs/${encodeURIComponent(runId)}/cancel`,
  toolApprove: (toolCallId: string) => `/tools/${encodeURIComponent(toolCallId)}/approve`,
  threads: '/threads',
  threadMessages: (threadId: string) => `/threads/${encodeURIComponent(threadId)}/messages`,
  providers: '/providers',
  providersTest: '/providers/test',
  browserStatus: '/browser/status',
  browserProfiles: '/browser/profiles',
  browserActions: '/browser/actions',
  browserNativeMessages: '/browser/native/messages',
  browserNativePoll: '/browser/native/poll',
  mcpServers: '/mcp/servers',
  mcpServerReload: (id: string) => `/mcp/servers/${encodeURIComponent(id)}/reload`,
  settings: '/settings',
} as const;

export const AUTH_HEADER = 'Authorization';
export const AUTH_SCHEME = 'Bearer';

export const NATIVE_HOST_RUNTIME_FILENAME = 'native-host-runtime.json';
export const NATIVE_HOST_DIR_NAME = '.golemancy';
