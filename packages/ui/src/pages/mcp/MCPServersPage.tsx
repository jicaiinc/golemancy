import { useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { MCPServerConfig, MCPServerCreateData, MCPServerUpdateData, MCPProjectFile } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject, usePermissionConfig } from '../../hooks'
import {
  PixelCard, PixelButton, PixelBadge, PixelTabs, PixelToggle, PixelSpinner, PixelDropZone,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { MCPFormModal } from './MCPFormModal'

const transportColors: Record<string, string> = {
  stdio: 'text-accent-green',
  sse: 'text-accent-amber',
  http: 'text-accent-blue',
}

export function MCPServersPage() {
  const { t } = useTranslation('mcp')
  const project = useCurrentProject()
  const mcpServers = useAppStore(s => s.mcpServers)
  const mcpServersLoading = useAppStore(s => s.mcpServersLoading)
  const agents = useAppStore(s => s.agents)
  const createMCPServer = useAppStore(s => s.createMCPServer)
  const updateMCPServer = useAppStore(s => s.updateMCPServer)
  const deleteMCPServer = useAppStore(s => s.deleteMCPServer)
  const testMCPServer = useAppStore(s => s.testMCPServer)
  const { mode, applyToMCP, sandboxSupported } = usePermissionConfig()

  const tabs = [
    { id: 'installed', label: t('tabs.installed') },
    { id: 'marketplace', label: t('tabs.marketplace') },
  ]

  const [activeTab, setActiveTab] = useState('installed')
  const [showCreate, setShowCreate] = useState(false)
  const [editServer, setEditServer] = useState<MCPServerConfig | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { status: 'testing' | 'ok' | 'error'; message?: string }>>({})

  // Determine MCP security warning type
  let mcpWarning: 'restricted' | 'risk' | null = null
  if (mode === 'restricted') {
    mcpWarning = 'restricted'
  } else if (mode === 'unrestricted') {
    mcpWarning = 'risk'
  } else if (mode === 'sandbox') {
    if (!applyToMCP || !sandboxSupported) {
      mcpWarning = 'risk'
    }
  }

  if (!project) return null

  function getReferencingAgentCount(serverName: string): number {
    return agents.filter(a => a.mcpServers.includes(serverName)).length
  }

  async function handleTest(name: string) {
    setTestResults(prev => ({ ...prev, [name]: { status: 'testing' } }))
    try {
      const result = await testMCPServer(name)
      if (result.ok) {
        setTestResults(prev => ({ ...prev, [name]: { status: 'ok', message: t('server.testOk', { count: result.toolCount }) } }))
      } else {
        setTestResults(prev => ({ ...prev, [name]: { status: 'error', message: result.error ?? t('server.connectionFailed') } }))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('server.testFailed')
      setTestResults(prev => ({ ...prev, [name]: { status: 'error', message } }))
    }
  }

  async function handleCreate(data: MCPServerCreateData) {
    const server = await createMCPServer(data)
    setShowCreate(false)
    // Auto-test after creation
    if (server.enabled) {
      handleTest(server.name)
    }
  }

  async function handleEdit(data: { name: string } & MCPServerUpdateData) {
    const { name, ...updateData } = data
    await updateMCPServer(name, updateData)
    setEditServer(null)
  }

  async function handleToggleEnabled(server: MCPServerConfig) {
    await updateMCPServer(server.name, { enabled: !server.enabled })
    // Auto-test when enabling
    if (!server.enabled) {
      handleTest(server.name)
    }
  }

  async function handleDelete(server: MCPServerConfig) {
    const refCount = getReferencingAgentCount(server.name)
    if (refCount > 0) {
      setDeleteError(t('server.deleteErrorInUse', { name: server.name, count: refCount }))
      return
    }
    setDeleteError(null)
    setConfirmDeleteName(null)
    try {
      await deleteMCPServer(server.name)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('server.deleteError')
      setDeleteError(message)
    }
  }

  const handleConfigDrop = useCallback(async (files: File[]) => {
    setImportStatus(null)
    const file = files[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as MCPProjectFile
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        setImportStatus({ type: 'error', message: t('import.invalidFormat') })
        return
      }
      const entries = Object.entries(parsed.mcpServers)
      if (entries.length === 0) {
        setImportStatus({ type: 'error', message: t('import.noServers') })
        return
      }
      await Promise.all(entries.map(([name, config]) =>
        createMCPServer({ name, ...config, enabled: config.enabled ?? true })
      ))
      setImportStatus({ type: 'success', message: t('import.importedCount', { count: entries.length }) })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('import.parseError')
      setImportStatus({ type: 'error', message })
    }
  }, [createMCPServer, t])

  return (
    <motion.div className="p-6" data-testid="mcp-page" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">{t('page.title')}</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            {t('page.serverCount', { count: mcpServers.length })}
          </p>
        </div>
        <PixelButton variant="primary" data-testid="mcp-new-btn" onClick={() => setShowCreate(true)}>{t('page.newServerBtn')}</PixelButton>
      </div>

      {/* MCP security warning */}
      {mcpWarning === 'restricted' && (
        <PixelCard variant="outlined" className="mb-4 border-accent-blue bg-accent-blue/5">
          <div className="flex items-center gap-2">
            <span className="font-pixel text-[10px] text-accent-blue shrink-0">{'\u26D4'} {t('warning.restrictedBadge')}</span>
            <span className="text-[12px] text-text-secondary">
              {t('warning.restrictedMsg')}
            </span>
          </div>
        </PixelCard>
      )}
      {mcpWarning === 'risk' && (
        <PixelCard variant="outlined" className="mb-4 border-accent-amber bg-accent-amber/5">
          <div className="flex items-start gap-2">
            <span className="font-pixel text-[10px] text-accent-amber shrink-0 mt-0.5">{'\u26A0'} {t('warning.riskBadge')}</span>
            <div className="text-[12px] text-text-secondary">
              <p>{t('warning.riskMsg')}</p>
              {mode === 'sandbox' && sandboxSupported && !applyToMCP && (
                <p className="mt-1 text-text-dim">
                  {t('warning.applyToMcpHint')}
                </p>
              )}
              {mode === 'sandbox' && !sandboxSupported && (
                <p className="mt-1 text-text-dim">{t('warning.sandboxUnavailable')}</p>
              )}
            </div>
          </div>
        </PixelCard>
      )}

      {/* Drop zone for MCP config import */}
      <PixelDropZone accept={['.json']} onDrop={handleConfigDrop} className="mb-4" />

      {/* Import status */}
      {importStatus && (
        <div className="mb-4">
          <PixelCard className={importStatus.type === 'error' ? 'bg-accent-red/10 border-accent-red' : 'bg-accent-green/10 border-accent-green'}>
            <div className="flex items-center justify-between">
              <span className={`text-[12px] ${importStatus.type === 'error' ? 'text-accent-red' : 'text-accent-green'}`}>
                {importStatus.message}
              </span>
              <PixelButton size="sm" variant="ghost" onClick={() => setImportStatus(null)}>&times;</PixelButton>
            </div>
          </PixelCard>
        </div>
      )}

      {/* Tabs */}
      <PixelTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === 'installed' && (
          <>
            {/* Delete error */}
            {deleteError && (
              <motion.div {...staggerItem} className="mb-4">
                <PixelCard className="bg-accent-red/10 border-accent-red">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-accent-red">{deleteError}</span>
                    <PixelButton size="sm" variant="ghost" onClick={() => setDeleteError(null)}>&times;</PixelButton>
                  </div>
                </PixelCard>
              </motion.div>
            )}

            {mcpServersLoading ? (
              <div className="flex justify-center py-12">
                <PixelSpinner label={t('loading')} />
              </div>
            ) : mcpServers.length === 0 ? (
              <motion.div {...staggerItem}>
                <PixelCard variant="outlined" className="text-center py-12">
                  <div className="font-arcade text-[20px] text-text-dim mb-4">~&gt;</div>
                  <p className="font-pixel text-[10px] text-text-secondary mb-4">{t('empty.title')}</p>
                  <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
                    {t('empty.addFirstBtn')}
                  </PixelButton>
                </PixelCard>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-2">
                {mcpServers.map(server => {
                  const refCount = getReferencingAgentCount(server.name)
                  const testResult = testResults[server.name]
                  return (
                    <motion.div key={server.name} {...staggerItem}>
                      <PixelCard data-testid="mcp-card" className={!server.enabled ? 'opacity-60' : ''}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-pixel text-[10px] text-accent-purple">{server.name}</h3>
                              <PixelBadge variant="idle">
                                <span className={transportColors[server.transportType]}>{server.transportType.toUpperCase()}</span>
                              </PixelBadge>
                              {testResult && (
                                <span className={`text-[10px] font-mono whitespace-pre-line ${
                                  testResult.status === 'testing' ? 'text-text-dim' :
                                  testResult.status === 'ok' ? 'text-accent-green' : 'text-accent-red'
                                }`}>
                                  {testResult.status === 'testing' ? t('server.testing') : testResult.message}
                                </span>
                              )}
                            </div>
                            {server.description && (
                              <p className="text-[12px] text-text-secondary mt-1">{server.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-text-dim">
                              {server.transportType === 'stdio' && server.command && (
                                <span className="font-mono">{server.command} {(server.args ?? []).join(' ')}</span>
                              )}
                              {(server.transportType === 'sse' || server.transportType === 'http') && server.url && (
                                <span className="font-mono">{server.url}</span>
                              )}
                            </div>
                            {mode === 'restricted' && server.transportType === 'stdio' && (
                              <div className="mt-1 text-[10px] text-accent-blue">
                                {'\u26D4'} {t('server.blockedRestricted')}
                              </div>
                            )}
                            <div className="mt-1 text-[10px] text-text-dim">
                              {t('server.usedByAgents', { count: refCount })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <PixelButton
                              size="sm"
                              variant="ghost"
                              onClick={() => handleTest(server.name)}
                              disabled={testResult?.status === 'testing'}
                            >
                              {t('server.testBtn')}
                            </PixelButton>
                            <PixelToggle checked={server.enabled} onChange={() => handleToggleEnabled(server)} />
                            <PixelButton size="sm" variant="ghost" onClick={() => setEditServer(server)}>{t('common:button.edit')}</PixelButton>
                            {confirmDeleteName === server.name ? (
                              <>
                                <PixelButton size="sm" variant="danger" onClick={() => handleDelete(server)}>{t('common:button.confirm')}</PixelButton>
                                <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDeleteName(null)}>{t('common:button.cancel')}</PixelButton>
                              </>
                            ) : (
                              <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDeleteName(server.name)}>&times;</PixelButton>
                            )}
                          </div>
                        </div>
                      </PixelCard>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'marketplace' && (
          <motion.div {...staggerItem}>
            <PixelCard variant="outlined" className="text-center py-12">
              <p className="font-pixel text-[12px] text-text-dim animate-[pixel-blink_2s_steps(2)_infinite]">
                {t('comingSoon')}
              </p>
            </PixelCard>
          </motion.div>
        )}
      </div>

      {/* Create modal */}
      <MCPFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title={t('form.newTitle')}
      />

      {/* Edit modal */}
      {editServer && (
        <MCPFormModal
          open
          onClose={() => setEditServer(null)}
          onSubmit={handleEdit}
          title={t('form.editTitle')}
          initial={editServer}
        />
      )}
    </motion.div>
  )
}
