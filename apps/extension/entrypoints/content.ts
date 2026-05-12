export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Baseline: no DOM interaction yet. Future browser-tool execution lives here.
    console.debug('[golemancy] content script loaded');
  },
});
