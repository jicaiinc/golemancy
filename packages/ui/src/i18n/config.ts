import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import agentEn from '../locales/en/agent.json'
import chatEn from '../locales/en/chat.json'
import commonEn from '../locales/en/common.json'
import cronEn from '../locales/en/cron.json'
import dashboardEn from '../locales/en/dashboard.json'
import errorEn from '../locales/en/error.json'
import mcpEn from '../locales/en/mcp.json'
import memoryEn from '../locales/en/memory.json'
import navEn from '../locales/en/nav.json'
import onboardingEn from '../locales/en/onboarding.json'
import permissionsEn from '../locales/en/permissions.json'
import projectEn from '../locales/en/project.json'
import settingsEn from '../locales/en/settings.json'
import skillEn from '../locales/en/skill.json'
import speechEn from '../locales/en/speech.json'
import taskEn from '../locales/en/task.json'
import workspaceEn from '../locales/en/workspace.json'

import agentZh from '../locales/zh/agent.json'
import chatZh from '../locales/zh/chat.json'
import commonZh from '../locales/zh/common.json'
import cronZh from '../locales/zh/cron.json'
import dashboardZh from '../locales/zh/dashboard.json'
import errorZh from '../locales/zh/error.json'
import mcpZh from '../locales/zh/mcp.json'
import memoryZh from '../locales/zh/memory.json'
import navZh from '../locales/zh/nav.json'
import onboardingZh from '../locales/zh/onboarding.json'
import permissionsZh from '../locales/zh/permissions.json'
import projectZh from '../locales/zh/project.json'
import settingsZh from '../locales/zh/settings.json'
import skillZh from '../locales/zh/skill.json'
import speechZh from '../locales/zh/speech.json'
import taskZh from '../locales/zh/task.json'
import workspaceZh from '../locales/zh/workspace.json'

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    defaultNS: 'common',
    fallbackNS: 'common',
    resources: {
      en: {
        agent: agentEn,
        chat: chatEn,
        common: commonEn,
        cron: cronEn,
        dashboard: dashboardEn,
        error: errorEn,
        mcp: mcpEn,
        memory: memoryEn,
        nav: navEn,
        onboarding: onboardingEn,
        permissions: permissionsEn,
        project: projectEn,
        settings: settingsEn,
        skill: skillEn,
        speech: speechEn,
        task: taskEn,
        workspace: workspaceEn,
      },
      zh: {
        agent: agentZh,
        chat: chatZh,
        common: commonZh,
        cron: cronZh,
        dashboard: dashboardZh,
        error: errorZh,
        mcp: mcpZh,
        memory: memoryZh,
        nav: navZh,
        onboarding: onboardingZh,
        permissions: permissionsZh,
        project: projectZh,
        settings: settingsZh,
        skill: skillZh,
        speech: speechZh,
        task: taskZh,
        workspace: workspaceZh,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    saveMissing: true,
    parseMissingKeyHandler: (key: string) => {
      console.warn(`[i18n] missing key: ${key}`)
      return key.split('.').pop() ?? key
    },
  })

// Sync <html lang="..."> with current language so CSS :lang() selectors work
i18next.on('languageChanged', (lng: string) => {
  document.documentElement.lang = lng
})
if (i18next.language) {
  document.documentElement.lang = i18next.language
}

export default i18next
