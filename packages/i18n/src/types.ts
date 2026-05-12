import 'i18next';
import zhCNUi from './locales/zh-CN/ui.json' with { type: 'json' };

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'ui';
    resources: { ui: typeof zhCNUi };
  }
}
