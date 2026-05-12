import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en-US",
  locales: ["en-US", "zh-CN"],
  fallbackLocales: {
    default: "en-US",
  },
  catalogs: [
    {
      path: "<rootDir>/packages/i18n/src/locales/{locale}/messages",
      include: ["<rootDir>/apps/desktop/src", "<rootDir>/packages/i18n/src"],
      exclude: ["**/*.test.*", "**/dist/**", "**/target/**"],
    },
  ],
  format: formatter({ lineNumbers: false }),
  orderBy: "messageId",
  compileNamespace: "es",
});
