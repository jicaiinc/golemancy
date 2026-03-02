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
import knowledgeBaseEn from '../locales/en/knowledgeBase.json'
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
import knowledgeBaseZh from '../locales/zh/knowledgeBase.json'
import navZh from '../locales/zh/nav.json'
import onboardingZh from '../locales/zh/onboarding.json'
import permissionsZh from '../locales/zh/permissions.json'
import projectZh from '../locales/zh/project.json'
import settingsZh from '../locales/zh/settings.json'
import skillZh from '../locales/zh/skill.json'
import speechZh from '../locales/zh/speech.json'
import taskZh from '../locales/zh/task.json'
import workspaceZh from '../locales/zh/workspace.json'

import agentZhTW from '../locales/zh-TW/agent.json'
import chatZhTW from '../locales/zh-TW/chat.json'
import commonZhTW from '../locales/zh-TW/common.json'
import cronZhTW from '../locales/zh-TW/cron.json'
import dashboardZhTW from '../locales/zh-TW/dashboard.json'
import errorZhTW from '../locales/zh-TW/error.json'
import mcpZhTW from '../locales/zh-TW/mcp.json'
import knowledgeBaseZhTW from '../locales/zh-TW/knowledgeBase.json'
import navZhTW from '../locales/zh-TW/nav.json'
import onboardingZhTW from '../locales/zh-TW/onboarding.json'
import permissionsZhTW from '../locales/zh-TW/permissions.json'
import projectZhTW from '../locales/zh-TW/project.json'
import settingsZhTW from '../locales/zh-TW/settings.json'
import skillZhTW from '../locales/zh-TW/skill.json'
import speechZhTW from '../locales/zh-TW/speech.json'
import taskZhTW from '../locales/zh-TW/task.json'
import workspaceZhTW from '../locales/zh-TW/workspace.json'

import agentEs from '../locales/es/agent.json'
import chatEs from '../locales/es/chat.json'
import commonEs from '../locales/es/common.json'
import cronEs from '../locales/es/cron.json'
import dashboardEs from '../locales/es/dashboard.json'
import errorEs from '../locales/es/error.json'
import mcpEs from '../locales/es/mcp.json'
import knowledgeBaseEs from '../locales/es/knowledgeBase.json'
import navEs from '../locales/es/nav.json'
import onboardingEs from '../locales/es/onboarding.json'
import permissionsEs from '../locales/es/permissions.json'
import projectEs from '../locales/es/project.json'
import settingsEs from '../locales/es/settings.json'
import skillEs from '../locales/es/skill.json'
import speechEs from '../locales/es/speech.json'
import taskEs from '../locales/es/task.json'
import workspaceEs from '../locales/es/workspace.json'

import agentFr from '../locales/fr/agent.json'
import chatFr from '../locales/fr/chat.json'
import commonFr from '../locales/fr/common.json'
import cronFr from '../locales/fr/cron.json'
import dashboardFr from '../locales/fr/dashboard.json'
import errorFr from '../locales/fr/error.json'
import mcpFr from '../locales/fr/mcp.json'
import knowledgeBaseFr from '../locales/fr/knowledgeBase.json'
import navFr from '../locales/fr/nav.json'
import onboardingFr from '../locales/fr/onboarding.json'
import permissionsFr from '../locales/fr/permissions.json'
import projectFr from '../locales/fr/project.json'
import settingsFr from '../locales/fr/settings.json'
import skillFr from '../locales/fr/skill.json'
import speechFr from '../locales/fr/speech.json'
import taskFr from '../locales/fr/task.json'
import workspaceFr from '../locales/fr/workspace.json'

import agentPtBR from '../locales/pt-BR/agent.json'
import chatPtBR from '../locales/pt-BR/chat.json'
import commonPtBR from '../locales/pt-BR/common.json'
import cronPtBR from '../locales/pt-BR/cron.json'
import dashboardPtBR from '../locales/pt-BR/dashboard.json'
import errorPtBR from '../locales/pt-BR/error.json'
import mcpPtBR from '../locales/pt-BR/mcp.json'
import knowledgeBasePtBR from '../locales/pt-BR/knowledgeBase.json'
import navPtBR from '../locales/pt-BR/nav.json'
import onboardingPtBR from '../locales/pt-BR/onboarding.json'
import permissionsPtBR from '../locales/pt-BR/permissions.json'
import projectPtBR from '../locales/pt-BR/project.json'
import settingsPtBR from '../locales/pt-BR/settings.json'
import skillPtBR from '../locales/pt-BR/skill.json'
import speechPtBR from '../locales/pt-BR/speech.json'
import taskPtBR from '../locales/pt-BR/task.json'
import workspacePtBR from '../locales/pt-BR/workspace.json'

import agentJa from '../locales/ja/agent.json'
import chatJa from '../locales/ja/chat.json'
import commonJa from '../locales/ja/common.json'
import cronJa from '../locales/ja/cron.json'
import dashboardJa from '../locales/ja/dashboard.json'
import errorJa from '../locales/ja/error.json'
import mcpJa from '../locales/ja/mcp.json'
import knowledgeBaseJa from '../locales/ja/knowledgeBase.json'
import navJa from '../locales/ja/nav.json'
import onboardingJa from '../locales/ja/onboarding.json'
import permissionsJa from '../locales/ja/permissions.json'
import projectJa from '../locales/ja/project.json'
import settingsJa from '../locales/ja/settings.json'
import skillJa from '../locales/ja/skill.json'
import speechJa from '../locales/ja/speech.json'
import taskJa from '../locales/ja/task.json'
import workspaceJa from '../locales/ja/workspace.json'

import agentKo from '../locales/ko/agent.json'
import chatKo from '../locales/ko/chat.json'
import commonKo from '../locales/ko/common.json'
import cronKo from '../locales/ko/cron.json'
import dashboardKo from '../locales/ko/dashboard.json'
import errorKo from '../locales/ko/error.json'
import mcpKo from '../locales/ko/mcp.json'
import knowledgeBaseKo from '../locales/ko/knowledgeBase.json'
import navKo from '../locales/ko/nav.json'
import onboardingKo from '../locales/ko/onboarding.json'
import permissionsKo from '../locales/ko/permissions.json'
import projectKo from '../locales/ko/project.json'
import settingsKo from '../locales/ko/settings.json'
import skillKo from '../locales/ko/skill.json'
import speechKo from '../locales/ko/speech.json'
import taskKo from '../locales/ko/task.json'
import workspaceKo from '../locales/ko/workspace.json'

import agentDe from '../locales/de/agent.json'
import chatDe from '../locales/de/chat.json'
import commonDe from '../locales/de/common.json'
import cronDe from '../locales/de/cron.json'
import dashboardDe from '../locales/de/dashboard.json'
import errorDe from '../locales/de/error.json'
import mcpDe from '../locales/de/mcp.json'
import knowledgeBaseDe from '../locales/de/knowledgeBase.json'
import navDe from '../locales/de/nav.json'
import onboardingDe from '../locales/de/onboarding.json'
import permissionsDe from '../locales/de/permissions.json'
import projectDe from '../locales/de/project.json'
import settingsDe from '../locales/de/settings.json'
import skillDe from '../locales/de/skill.json'
import speechDe from '../locales/de/speech.json'
import taskDe from '../locales/de/task.json'
import workspaceDe from '../locales/de/workspace.json'

import agentIt from '../locales/it/agent.json'
import chatIt from '../locales/it/chat.json'
import commonIt from '../locales/it/common.json'
import cronIt from '../locales/it/cron.json'
import dashboardIt from '../locales/it/dashboard.json'
import errorIt from '../locales/it/error.json'
import mcpIt from '../locales/it/mcp.json'
import knowledgeBaseIt from '../locales/it/knowledgeBase.json'
import navIt from '../locales/it/nav.json'
import onboardingIt from '../locales/it/onboarding.json'
import permissionsIt from '../locales/it/permissions.json'
import projectIt from '../locales/it/project.json'
import settingsIt from '../locales/it/settings.json'
import skillIt from '../locales/it/skill.json'
import speechIt from '../locales/it/speech.json'
import taskIt from '../locales/it/task.json'
import workspaceIt from '../locales/it/workspace.json'

import agentNl from '../locales/nl/agent.json'
import chatNl from '../locales/nl/chat.json'
import commonNl from '../locales/nl/common.json'
import cronNl from '../locales/nl/cron.json'
import dashboardNl from '../locales/nl/dashboard.json'
import errorNl from '../locales/nl/error.json'
import mcpNl from '../locales/nl/mcp.json'
import knowledgeBaseNl from '../locales/nl/knowledgeBase.json'
import navNl from '../locales/nl/nav.json'
import onboardingNl from '../locales/nl/onboarding.json'
import permissionsNl from '../locales/nl/permissions.json'
import projectNl from '../locales/nl/project.json'
import settingsNl from '../locales/nl/settings.json'
import skillNl from '../locales/nl/skill.json'
import speechNl from '../locales/nl/speech.json'
import taskNl from '../locales/nl/task.json'
import workspaceNl from '../locales/nl/workspace.json'

import agentRu from '../locales/ru/agent.json'
import chatRu from '../locales/ru/chat.json'
import commonRu from '../locales/ru/common.json'
import cronRu from '../locales/ru/cron.json'
import dashboardRu from '../locales/ru/dashboard.json'
import errorRu from '../locales/ru/error.json'
import mcpRu from '../locales/ru/mcp.json'
import knowledgeBaseRu from '../locales/ru/knowledgeBase.json'
import navRu from '../locales/ru/nav.json'
import onboardingRu from '../locales/ru/onboarding.json'
import permissionsRu from '../locales/ru/permissions.json'
import projectRu from '../locales/ru/project.json'
import settingsRu from '../locales/ru/settings.json'
import skillRu from '../locales/ru/skill.json'
import speechRu from '../locales/ru/speech.json'
import taskRu from '../locales/ru/task.json'
import workspaceRu from '../locales/ru/workspace.json'

import agentUk from '../locales/uk/agent.json'
import chatUk from '../locales/uk/chat.json'
import commonUk from '../locales/uk/common.json'
import cronUk from '../locales/uk/cron.json'
import dashboardUk from '../locales/uk/dashboard.json'
import errorUk from '../locales/uk/error.json'
import mcpUk from '../locales/uk/mcp.json'
import knowledgeBaseUk from '../locales/uk/knowledgeBase.json'
import navUk from '../locales/uk/nav.json'
import onboardingUk from '../locales/uk/onboarding.json'
import permissionsUk from '../locales/uk/permissions.json'
import projectUk from '../locales/uk/project.json'
import settingsUk from '../locales/uk/settings.json'
import skillUk from '../locales/uk/skill.json'
import speechUk from '../locales/uk/speech.json'
import taskUk from '../locales/uk/task.json'
import workspaceUk from '../locales/uk/workspace.json'

import agentPl from '../locales/pl/agent.json'
import chatPl from '../locales/pl/chat.json'
import commonPl from '../locales/pl/common.json'
import cronPl from '../locales/pl/cron.json'
import dashboardPl from '../locales/pl/dashboard.json'
import errorPl from '../locales/pl/error.json'
import mcpPl from '../locales/pl/mcp.json'
import knowledgeBasePl from '../locales/pl/knowledgeBase.json'
import navPl from '../locales/pl/nav.json'
import onboardingPl from '../locales/pl/onboarding.json'
import permissionsPl from '../locales/pl/permissions.json'
import projectPl from '../locales/pl/project.json'
import settingsPl from '../locales/pl/settings.json'
import skillPl from '../locales/pl/skill.json'
import speechPl from '../locales/pl/speech.json'
import taskPl from '../locales/pl/task.json'
import workspacePl from '../locales/pl/workspace.json'

import agentCs from '../locales/cs/agent.json'
import chatCs from '../locales/cs/chat.json'
import commonCs from '../locales/cs/common.json'
import cronCs from '../locales/cs/cron.json'
import dashboardCs from '../locales/cs/dashboard.json'
import errorCs from '../locales/cs/error.json'
import mcpCs from '../locales/cs/mcp.json'
import knowledgeBaseCs from '../locales/cs/knowledgeBase.json'
import navCs from '../locales/cs/nav.json'
import onboardingCs from '../locales/cs/onboarding.json'
import permissionsCs from '../locales/cs/permissions.json'
import projectCs from '../locales/cs/project.json'
import settingsCs from '../locales/cs/settings.json'
import skillCs from '../locales/cs/skill.json'
import speechCs from '../locales/cs/speech.json'
import taskCs from '../locales/cs/task.json'
import workspaceCs from '../locales/cs/workspace.json'

import agentRo from '../locales/ro/agent.json'
import chatRo from '../locales/ro/chat.json'
import commonRo from '../locales/ro/common.json'
import cronRo from '../locales/ro/cron.json'
import dashboardRo from '../locales/ro/dashboard.json'
import errorRo from '../locales/ro/error.json'
import mcpRo from '../locales/ro/mcp.json'
import knowledgeBaseRo from '../locales/ro/knowledgeBase.json'
import navRo from '../locales/ro/nav.json'
import onboardingRo from '../locales/ro/onboarding.json'
import permissionsRo from '../locales/ro/permissions.json'
import projectRo from '../locales/ro/project.json'
import settingsRo from '../locales/ro/settings.json'
import skillRo from '../locales/ro/skill.json'
import speechRo from '../locales/ro/speech.json'
import taskRo from '../locales/ro/task.json'
import workspaceRo from '../locales/ro/workspace.json'

import agentSv from '../locales/sv/agent.json'
import chatSv from '../locales/sv/chat.json'
import commonSv from '../locales/sv/common.json'
import cronSv from '../locales/sv/cron.json'
import dashboardSv from '../locales/sv/dashboard.json'
import errorSv from '../locales/sv/error.json'
import mcpSv from '../locales/sv/mcp.json'
import knowledgeBaseSv from '../locales/sv/knowledgeBase.json'
import navSv from '../locales/sv/nav.json'
import onboardingSv from '../locales/sv/onboarding.json'
import permissionsSv from '../locales/sv/permissions.json'
import projectSv from '../locales/sv/project.json'
import settingsSv from '../locales/sv/settings.json'
import skillSv from '../locales/sv/skill.json'
import speechSv from '../locales/sv/speech.json'
import taskSv from '../locales/sv/task.json'
import workspaceSv from '../locales/sv/workspace.json'

import agentId from '../locales/id/agent.json'
import chatId from '../locales/id/chat.json'
import commonId from '../locales/id/common.json'
import cronId from '../locales/id/cron.json'
import dashboardId from '../locales/id/dashboard.json'
import errorId from '../locales/id/error.json'
import mcpId from '../locales/id/mcp.json'
import knowledgeBaseId from '../locales/id/knowledgeBase.json'
import navId from '../locales/id/nav.json'
import onboardingId from '../locales/id/onboarding.json'
import permissionsId from '../locales/id/permissions.json'
import projectId from '../locales/id/project.json'
import settingsId from '../locales/id/settings.json'
import skillId from '../locales/id/skill.json'
import speechId from '../locales/id/speech.json'
import taskId from '../locales/id/task.json'
import workspaceId from '../locales/id/workspace.json'

import agentMs from '../locales/ms/agent.json'
import chatMs from '../locales/ms/chat.json'
import commonMs from '../locales/ms/common.json'
import cronMs from '../locales/ms/cron.json'
import dashboardMs from '../locales/ms/dashboard.json'
import errorMs from '../locales/ms/error.json'
import mcpMs from '../locales/ms/mcp.json'
import knowledgeBaseMs from '../locales/ms/knowledgeBase.json'
import navMs from '../locales/ms/nav.json'
import onboardingMs from '../locales/ms/onboarding.json'
import permissionsMs from '../locales/ms/permissions.json'
import projectMs from '../locales/ms/project.json'
import settingsMs from '../locales/ms/settings.json'
import skillMs from '../locales/ms/skill.json'
import speechMs from '../locales/ms/speech.json'
import taskMs from '../locales/ms/task.json'
import workspaceMs from '../locales/ms/workspace.json'

import agentVi from '../locales/vi/agent.json'
import chatVi from '../locales/vi/chat.json'
import commonVi from '../locales/vi/common.json'
import cronVi from '../locales/vi/cron.json'
import dashboardVi from '../locales/vi/dashboard.json'
import errorVi from '../locales/vi/error.json'
import mcpVi from '../locales/vi/mcp.json'
import knowledgeBaseVi from '../locales/vi/knowledgeBase.json'
import navVi from '../locales/vi/nav.json'
import onboardingVi from '../locales/vi/onboarding.json'
import permissionsVi from '../locales/vi/permissions.json'
import projectVi from '../locales/vi/project.json'
import settingsVi from '../locales/vi/settings.json'
import skillVi from '../locales/vi/skill.json'
import speechVi from '../locales/vi/speech.json'
import taskVi from '../locales/vi/task.json'
import workspaceVi from '../locales/vi/workspace.json'

import agentTr from '../locales/tr/agent.json'
import chatTr from '../locales/tr/chat.json'
import commonTr from '../locales/tr/common.json'
import cronTr from '../locales/tr/cron.json'
import dashboardTr from '../locales/tr/dashboard.json'
import errorTr from '../locales/tr/error.json'
import mcpTr from '../locales/tr/mcp.json'
import knowledgeBaseTr from '../locales/tr/knowledgeBase.json'
import navTr from '../locales/tr/nav.json'
import onboardingTr from '../locales/tr/onboarding.json'
import permissionsTr from '../locales/tr/permissions.json'
import projectTr from '../locales/tr/project.json'
import settingsTr from '../locales/tr/settings.json'
import skillTr from '../locales/tr/skill.json'
import speechTr from '../locales/tr/speech.json'
import taskTr from '../locales/tr/task.json'
import workspaceTr from '../locales/tr/workspace.json'

import agentFil from '../locales/fil/agent.json'
import chatFil from '../locales/fil/chat.json'
import commonFil from '../locales/fil/common.json'
import cronFil from '../locales/fil/cron.json'
import dashboardFil from '../locales/fil/dashboard.json'
import errorFil from '../locales/fil/error.json'
import mcpFil from '../locales/fil/mcp.json'
import knowledgeBaseFil from '../locales/fil/knowledgeBase.json'
import navFil from '../locales/fil/nav.json'
import onboardingFil from '../locales/fil/onboarding.json'
import permissionsFil from '../locales/fil/permissions.json'
import projectFil from '../locales/fil/project.json'
import settingsFil from '../locales/fil/settings.json'
import skillFil from '../locales/fil/skill.json'
import speechFil from '../locales/fil/speech.json'
import taskFil from '../locales/fil/task.json'
import workspaceFil from '../locales/fil/workspace.json'

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh', 'zh-TW', 'es', 'fr', 'pt-BR', 'ja', 'ko', 'de', 'it', 'nl', 'ru', 'uk', 'pl', 'cs', 'ro', 'sv', 'id', 'ms', 'vi', 'tr', 'fil'],
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
        knowledgeBase: knowledgeBaseEn,
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
        knowledgeBase: knowledgeBaseZh,
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
      'zh-TW': {
        agent: agentZhTW,
        chat: chatZhTW,
        common: commonZhTW,
        cron: cronZhTW,
        dashboard: dashboardZhTW,
        error: errorZhTW,
        mcp: mcpZhTW,
        knowledgeBase: knowledgeBaseZhTW,
        nav: navZhTW,
        onboarding: onboardingZhTW,
        permissions: permissionsZhTW,
        project: projectZhTW,
        settings: settingsZhTW,
        skill: skillZhTW,
        speech: speechZhTW,
        task: taskZhTW,
        workspace: workspaceZhTW,
      },
      es: {
        agent: agentEs,
        chat: chatEs,
        common: commonEs,
        cron: cronEs,
        dashboard: dashboardEs,
        error: errorEs,
        mcp: mcpEs,
        knowledgeBase: knowledgeBaseEs,
        nav: navEs,
        onboarding: onboardingEs,
        permissions: permissionsEs,
        project: projectEs,
        settings: settingsEs,
        skill: skillEs,
        speech: speechEs,
        task: taskEs,
        workspace: workspaceEs,
      },
      fr: {
        agent: agentFr,
        chat: chatFr,
        common: commonFr,
        cron: cronFr,
        dashboard: dashboardFr,
        error: errorFr,
        mcp: mcpFr,
        knowledgeBase: knowledgeBaseFr,
        nav: navFr,
        onboarding: onboardingFr,
        permissions: permissionsFr,
        project: projectFr,
        settings: settingsFr,
        skill: skillFr,
        speech: speechFr,
        task: taskFr,
        workspace: workspaceFr,
      },
      'pt-BR': {
        agent: agentPtBR,
        chat: chatPtBR,
        common: commonPtBR,
        cron: cronPtBR,
        dashboard: dashboardPtBR,
        error: errorPtBR,
        mcp: mcpPtBR,
        knowledgeBase: knowledgeBasePtBR,
        nav: navPtBR,
        onboarding: onboardingPtBR,
        permissions: permissionsPtBR,
        project: projectPtBR,
        settings: settingsPtBR,
        skill: skillPtBR,
        speech: speechPtBR,
        task: taskPtBR,
        workspace: workspacePtBR,
      },
      ja: {
        agent: agentJa,
        chat: chatJa,
        common: commonJa,
        cron: cronJa,
        dashboard: dashboardJa,
        error: errorJa,
        mcp: mcpJa,
        knowledgeBase: knowledgeBaseJa,
        nav: navJa,
        onboarding: onboardingJa,
        permissions: permissionsJa,
        project: projectJa,
        settings: settingsJa,
        skill: skillJa,
        speech: speechJa,
        task: taskJa,
        workspace: workspaceJa,
      },
      ko: {
        agent: agentKo,
        chat: chatKo,
        common: commonKo,
        cron: cronKo,
        dashboard: dashboardKo,
        error: errorKo,
        mcp: mcpKo,
        knowledgeBase: knowledgeBaseKo,
        nav: navKo,
        onboarding: onboardingKo,
        permissions: permissionsKo,
        project: projectKo,
        settings: settingsKo,
        skill: skillKo,
        speech: speechKo,
        task: taskKo,
        workspace: workspaceKo,
      },
      de: {
        agent: agentDe,
        chat: chatDe,
        common: commonDe,
        cron: cronDe,
        dashboard: dashboardDe,
        error: errorDe,
        mcp: mcpDe,
        knowledgeBase: knowledgeBaseDe,
        nav: navDe,
        onboarding: onboardingDe,
        permissions: permissionsDe,
        project: projectDe,
        settings: settingsDe,
        skill: skillDe,
        speech: speechDe,
        task: taskDe,
        workspace: workspaceDe,
      },
      it: {
        agent: agentIt,
        chat: chatIt,
        common: commonIt,
        cron: cronIt,
        dashboard: dashboardIt,
        error: errorIt,
        mcp: mcpIt,
        knowledgeBase: knowledgeBaseIt,
        nav: navIt,
        onboarding: onboardingIt,
        permissions: permissionsIt,
        project: projectIt,
        settings: settingsIt,
        skill: skillIt,
        speech: speechIt,
        task: taskIt,
        workspace: workspaceIt,
      },
      nl: {
        agent: agentNl,
        chat: chatNl,
        common: commonNl,
        cron: cronNl,
        dashboard: dashboardNl,
        error: errorNl,
        mcp: mcpNl,
        knowledgeBase: knowledgeBaseNl,
        nav: navNl,
        onboarding: onboardingNl,
        permissions: permissionsNl,
        project: projectNl,
        settings: settingsNl,
        skill: skillNl,
        speech: speechNl,
        task: taskNl,
        workspace: workspaceNl,
      },
      ru: {
        agent: agentRu,
        chat: chatRu,
        common: commonRu,
        cron: cronRu,
        dashboard: dashboardRu,
        error: errorRu,
        mcp: mcpRu,
        knowledgeBase: knowledgeBaseRu,
        nav: navRu,
        onboarding: onboardingRu,
        permissions: permissionsRu,
        project: projectRu,
        settings: settingsRu,
        skill: skillRu,
        speech: speechRu,
        task: taskRu,
        workspace: workspaceRu,
      },
      uk: {
        agent: agentUk,
        chat: chatUk,
        common: commonUk,
        cron: cronUk,
        dashboard: dashboardUk,
        error: errorUk,
        mcp: mcpUk,
        knowledgeBase: knowledgeBaseUk,
        nav: navUk,
        onboarding: onboardingUk,
        permissions: permissionsUk,
        project: projectUk,
        settings: settingsUk,
        skill: skillUk,
        speech: speechUk,
        task: taskUk,
        workspace: workspaceUk,
      },
      pl: {
        agent: agentPl,
        chat: chatPl,
        common: commonPl,
        cron: cronPl,
        dashboard: dashboardPl,
        error: errorPl,
        mcp: mcpPl,
        knowledgeBase: knowledgeBasePl,
        nav: navPl,
        onboarding: onboardingPl,
        permissions: permissionsPl,
        project: projectPl,
        settings: settingsPl,
        skill: skillPl,
        speech: speechPl,
        task: taskPl,
        workspace: workspacePl,
      },
      cs: {
        agent: agentCs,
        chat: chatCs,
        common: commonCs,
        cron: cronCs,
        dashboard: dashboardCs,
        error: errorCs,
        mcp: mcpCs,
        knowledgeBase: knowledgeBaseCs,
        nav: navCs,
        onboarding: onboardingCs,
        permissions: permissionsCs,
        project: projectCs,
        settings: settingsCs,
        skill: skillCs,
        speech: speechCs,
        task: taskCs,
        workspace: workspaceCs,
      },
      ro: {
        agent: agentRo,
        chat: chatRo,
        common: commonRo,
        cron: cronRo,
        dashboard: dashboardRo,
        error: errorRo,
        mcp: mcpRo,
        knowledgeBase: knowledgeBaseRo,
        nav: navRo,
        onboarding: onboardingRo,
        permissions: permissionsRo,
        project: projectRo,
        settings: settingsRo,
        skill: skillRo,
        speech: speechRo,
        task: taskRo,
        workspace: workspaceRo,
      },
      sv: {
        agent: agentSv,
        chat: chatSv,
        common: commonSv,
        cron: cronSv,
        dashboard: dashboardSv,
        error: errorSv,
        mcp: mcpSv,
        knowledgeBase: knowledgeBaseSv,
        nav: navSv,
        onboarding: onboardingSv,
        permissions: permissionsSv,
        project: projectSv,
        settings: settingsSv,
        skill: skillSv,
        speech: speechSv,
        task: taskSv,
        workspace: workspaceSv,
      },
      id: {
        agent: agentId,
        chat: chatId,
        common: commonId,
        cron: cronId,
        dashboard: dashboardId,
        error: errorId,
        mcp: mcpId,
        knowledgeBase: knowledgeBaseId,
        nav: navId,
        onboarding: onboardingId,
        permissions: permissionsId,
        project: projectId,
        settings: settingsId,
        skill: skillId,
        speech: speechId,
        task: taskId,
        workspace: workspaceId,
      },
      ms: {
        agent: agentMs,
        chat: chatMs,
        common: commonMs,
        cron: cronMs,
        dashboard: dashboardMs,
        error: errorMs,
        mcp: mcpMs,
        knowledgeBase: knowledgeBaseMs,
        nav: navMs,
        onboarding: onboardingMs,
        permissions: permissionsMs,
        project: projectMs,
        settings: settingsMs,
        skill: skillMs,
        speech: speechMs,
        task: taskMs,
        workspace: workspaceMs,
      },
      vi: {
        agent: agentVi,
        chat: chatVi,
        common: commonVi,
        cron: cronVi,
        dashboard: dashboardVi,
        error: errorVi,
        mcp: mcpVi,
        knowledgeBase: knowledgeBaseVi,
        nav: navVi,
        onboarding: onboardingVi,
        permissions: permissionsVi,
        project: projectVi,
        settings: settingsVi,
        skill: skillVi,
        speech: speechVi,
        task: taskVi,
        workspace: workspaceVi,
      },
      tr: {
        agent: agentTr,
        chat: chatTr,
        common: commonTr,
        cron: cronTr,
        dashboard: dashboardTr,
        error: errorTr,
        mcp: mcpTr,
        knowledgeBase: knowledgeBaseTr,
        nav: navTr,
        onboarding: onboardingTr,
        permissions: permissionsTr,
        project: projectTr,
        settings: settingsTr,
        skill: skillTr,
        speech: speechTr,
        task: taskTr,
        workspace: workspaceTr,
      },
      fil: {
        agent: agentFil,
        chat: chatFil,
        common: commonFil,
        cron: cronFil,
        dashboard: dashboardFil,
        error: errorFil,
        mcp: mcpFil,
        knowledgeBase: knowledgeBaseFil,
        nav: navFil,
        onboarding: onboardingFil,
        permissions: permissionsFil,
        project: projectFil,
        settings: settingsFil,
        skill: skillFil,
        speech: speechFil,
        task: taskFil,
        workspace: workspaceFil,
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
