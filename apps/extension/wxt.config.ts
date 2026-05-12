import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'Golemancy Bridge',
    description: 'Connects Golemancy desktop to the active browser profile.',
    permissions: ['nativeMessaging', 'storage', 'tabs', 'scripting', 'activeTab'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Golemancy',
    },
  },
  outDir: '.output',
});
