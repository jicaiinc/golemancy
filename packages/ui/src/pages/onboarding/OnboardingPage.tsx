import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import type { AgentModelConfig, ProjectId, SpeechToTextSettings } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { getServices } from '../../services/container'
import { PixelButton, PixelProgress } from '../../components'
import { PROVIDER_PRESETS } from '../../lib/provider-presets'
import { WelcomeStep } from './steps/WelcomeStep'
import { ProviderStep } from './steps/ProviderStep'
import { SpeechStep } from './steps/SpeechStep'
import { ProjectStep } from './steps/ProjectStep'
import { CompleteStep } from './steps/CompleteStep'

const STEPS = ['Welcome', 'Provider', 'Speech', 'Project', 'Complete']
const TOTAL_STEPS = STEPS.length

function buildProviderEntry(data: OnboardingData) {
  let providerKey: string
  let providerEntry: { name: string; sdkType: string; models: string[]; apiKey?: string; baseUrl?: string; testStatus?: 'ok' }

  if (data.selectedProvider!.startsWith('custom:')) {
    const parts = data.selectedProvider!.split(':')
    providerKey = parts[1]
    providerEntry = {
      name: parts.slice(3).join(':'),
      sdkType: parts[2],
      models: data.defaultModel ? [data.defaultModel.model] : [],
      apiKey: data.apiKey || undefined,
      baseUrl: data.baseUrl || undefined,
    }
  } else {
    providerKey = data.selectedProvider!
    const preset = PROVIDER_PRESETS[providerKey]
    providerEntry = {
      name: preset.name,
      sdkType: preset.sdkType,
      models: [...preset.defaultModels],
      apiKey: data.apiKey || undefined,
      baseUrl: data.baseUrl || preset.defaultBaseUrl || undefined,
    }
  }

  return { providerKey, providerEntry }
}

interface OnboardingData {
  selectedProvider: string | null
  apiKey: string
  baseUrl: string
  providerTestStatus: 'untested' | 'testing' | 'ok' | 'error'
  defaultModel: AgentModelConfig | null
  sttEnabled: boolean
  sttApiKey: string
  sttModel: string
  sttLanguage: string
  projectName: string
  projectDescription: string
  projectIcon: string
  createdProjectId: ProjectId | null
}

const INITIAL_DATA: OnboardingData = {
  selectedProvider: null,
  apiKey: '',
  baseUrl: '',
  providerTestStatus: 'untested',
  defaultModel: null,
  sttEnabled: false,
  sttApiKey: '',
  sttModel: 'gpt-4o-mini-transcribe',
  sttLanguage: '',
  projectName: '',
  projectDescription: '',
  projectIcon: 'pickaxe',
  createdProjectId: null,
}

/** Compute initial step from persisted onboardingStep, with state validation */
function computeInitialStep(onboardingStep: number | undefined, hasProviders: boolean): number {
  if (onboardingStep == null) return 0
  // If provider step was recorded as done but providers are actually empty, reset to step 1
  if (onboardingStep >= 1 && !hasProviders) return 1
  return Math.min(onboardingStep + 1, TOTAL_STEPS - 1)
}

export function OnboardingPage() {
  const { t } = useTranslation(['onboarding', 'common'])
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const createProject = useAppStore(s => s.createProject)
  const navigate = useNavigate()

  const hasProviders = Object.keys(settings?.providers ?? {}).length > 0
  const [step, setStep] = useState(() => computeInitialStep(settings?.onboardingStep, hasProviders))
  const [direction, setDirection] = useState(1) // 1 = forward, -1 = backward
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [saving, setSaving] = useState(false)
  const [stepError, setStepError] = useState('')

  const updateData = useCallback((patch: Partial<OnboardingData>) => {
    setData(d => ({ ...d, ...patch }))
  }, [])

  // --- Step validation ---
  function canProceed(): boolean {
    switch (step) {
      case 0: return true // Welcome — always OK
      case 1: return data.providerTestStatus === 'ok' && data.defaultModel != null
      case 2: return !data.sttEnabled || data.sttApiKey.trim().length > 0
      case 3: return data.projectName.trim().length > 0
      default: return false
    }
  }

  // --- Navigation ---
  async function goNext() {
    if (!canProceed() || saving) return
    setSaving(true)
    setStepError('')
    try {
      if (step === 1) await persistProviderStep()
      else if (step === 2) await persistSpeechStep()
      else if (step === 3) await persistProjectStep()
      setDirection(1)
      setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
    } catch (err) {
      setStepError(err instanceof Error ? err.message : t('error.somethingWentWrong'))
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    if (step <= 0) return
    setStepError('')
    setDirection(-1)
    setStep(s => s - 1)
  }

  async function skipSetup() {
    try {
      await updateSettings({ onboardingCompleted: true })
    } catch (err) {
      setStepError(err instanceof Error ? err.message : t('error.failedToSkip'))
    }
  }

  // --- Persist helpers ---
  async function persistProviderStep() {
    if (!data.selectedProvider || !data.defaultModel) return
    const { providerKey, providerEntry } = buildProviderEntry(data)
    providerEntry.testStatus = 'ok'
    if (data.defaultModel && !providerEntry.models.includes(data.defaultModel.model)) {
      providerEntry.models.push(data.defaultModel.model)
    }
    const providers = { ...settings?.providers, [providerKey]: providerEntry }
    await updateSettings({
      providers: providers as any,
      defaultModel: data.defaultModel,
      onboardingStep: 1,
    })
  }

  async function persistSpeechStep() {
    if (data.sttEnabled) {
      const stt: SpeechToTextSettings = {
        enabled: true,
        providerType: 'openai',
        apiKey: data.sttApiKey || undefined,
        model: data.sttModel,
        language: data.sttLanguage || undefined,
      }
      await updateSettings({ speechToText: stt, onboardingStep: 2 })
    } else {
      await updateSettings({ onboardingStep: 2 })
    }
  }

  async function persistProjectStep() {
    const project = await createProject({
      name: data.projectName.trim(),
      description: data.projectDescription.trim(),
      icon: data.projectIcon,
    })
    setData(d => ({ ...d, createdProjectId: project.id }))
    await updateSettings({ onboardingCompleted: true, onboardingStep: 4 })
  }

  // --- Provider test ---
  const handleTestProvider = useCallback(async () => {
    if (!data.selectedProvider || !data.apiKey) return
    updateData({ providerTestStatus: 'testing' })

    const { providerKey, providerEntry } = buildProviderEntry(data)

    // Save provider first so testProvider can find it
    const providers = { ...settings?.providers, [providerKey]: providerEntry }
    await updateSettings({ providers: providers as any, onboardingStep: 0 })

    try {
      const result = await getServices().settings.testProvider(providerKey)
      if (result.ok) {
        updateData({ providerTestStatus: 'ok' })
        providerEntry.testStatus = 'ok'
        await updateSettings({ providers: { ...providers, [providerKey]: providerEntry } as any })
      } else {
        updateData({ providerTestStatus: 'error' })
        throw new Error(result.error ?? t('error.connectionTestFailed'))
      }
    } catch (err) {
      updateData({ providerTestStatus: 'error' })
      throw err
    }
  }, [data.selectedProvider, data.apiKey, data.baseUrl, data.defaultModel, settings?.providers, updateData, updateSettings, t])

  // --- Speech test ---
  const handleTestSpeech = useCallback(async (config: SpeechToTextSettings) => {
    return getServices().speech.testProvider(config)
  }, [])

  // --- Language change ---
  const handleLanguageChange = useCallback(async (lang: string) => {
    i18next.changeLanguage(lang)
    await updateSettings({ language: lang })
  }, [updateSettings])

  // --- Resolve display name ---
  function getProviderName(): string {
    if (!data.selectedProvider) return t('provider.none')
    if (data.selectedProvider.startsWith('custom:')) return data.selectedProvider.split(':').slice(3).join(':')
    return PROVIDER_PRESETS[data.selectedProvider]?.name ?? data.selectedProvider
  }

  // --- Render ---
  const progress = (step / (TOTAL_STEPS - 1)) * 100

  return (
    <div className="fixed inset-0 bg-base z-50 flex flex-col" data-testid="onboarding-page">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border-dim">
        <div className="flex items-center gap-3">
          <span className="font-pixel text-[12px] text-accent-green">Golemancy</span>
          <span className="font-pixel text-[9px] text-text-dim">{t('header.setup')}</span>
        </div>
        {step < TOTAL_STEPS - 1 && (
          <PixelButton size="sm" variant="ghost" onClick={skipSetup}>
            {t('header.skipSetup')}
          </PixelButton>
        )}
      </div>

      {/* Progress */}
      <div className="px-6 pt-4">
        <div className="max-w-[720px] mx-auto">
          <PixelProgress value={progress} />
          <div className="flex justify-between mt-2">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={`font-pixel text-[7px] ${
                  i <= step ? 'text-accent-green' : 'text-text-dim'
                }`}
              >
                {t(`steps.${label.toLowerCase()}`)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-[720px] mx-auto">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.2 }}
            >
              {step === 0 && <WelcomeStep onGetStarted={goNext} onLanguageChange={handleLanguageChange} />}
              {step === 1 && (
                <ProviderStep
                  selectedProvider={data.selectedProvider}
                  apiKey={data.apiKey}
                  baseUrl={data.baseUrl}
                  providerTestStatus={data.providerTestStatus}
                  defaultModel={data.defaultModel}
                  onUpdate={updateData}
                  onTestProvider={handleTestProvider}
                />
              )}
              {step === 2 && (
                <SpeechStep
                  sttEnabled={data.sttEnabled}
                  sttApiKey={data.sttApiKey}
                  sttModel={data.sttModel}
                  sttLanguage={data.sttLanguage}
                  onUpdate={updateData}
                  onTestSpeech={handleTestSpeech}
                />
              )}
              {step === 3 && (
                <ProjectStep
                  projectName={data.projectName}
                  projectDescription={data.projectDescription}
                  projectIcon={data.projectIcon}
                  onUpdate={updateData}
                />
              )}
              {step === 4 && (
                <CompleteStep
                  providerName={getProviderName()}
                  defaultModel={data.defaultModel}
                  sttEnabled={data.sttEnabled}
                  projectName={data.projectName}
                  projectIcon={data.projectIcon}
                  createdProjectId={data.createdProjectId}
                  onStartChatting={() => {
                    if (data.createdProjectId) {
                      navigate(`/projects/${data.createdProjectId}/chat`)
                    }
                  }}
                  onGoToDashboard={() => {
                    if (data.createdProjectId) {
                      navigate(`/projects/${data.createdProjectId}`)
                    }
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Step error */}
      {stepError && (
        <div className="px-6">
          <div className="max-w-[720px] mx-auto p-2 bg-accent-red/10 border-2 border-accent-red/30">
            <span className="text-[10px] text-accent-red font-mono break-all">{stepError}</span>
          </div>
        </div>
      )}

      {/* Footer nav — hidden on Welcome step (has its own Get Started button) */}
      {step > 0 && step < TOTAL_STEPS - 1 && (
        <div className="px-6 py-4 border-t-2 border-border-dim">
          <div className="max-w-[720px] mx-auto flex justify-between">
            <PixelButton
              variant="ghost"
              onClick={goBack}
              disabled={step === 0}
            >
              {t('common:button.back')}
            </PixelButton>
            <PixelButton
              variant="primary"
              onClick={goNext}
              disabled={!canProceed() || saving}
            >
              {saving ? t('common:button.saving') : step === 3 ? t('button.createProject') : t('common:button.next')}
            </PixelButton>
          </div>
        </div>
      )}
    </div>
  )
}
