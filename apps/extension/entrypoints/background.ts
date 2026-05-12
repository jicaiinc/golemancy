import { connectNativeHost, type NativeHostConnection } from '../src/native-host';

export default defineBackground(() => {
  let connection: NativeHostConnection | null = null;

  const connect = () => {
    connection?.disconnect();
    connection = connectNativeHost({
      hostName: 'com.golemancy.bridge',
      onMessage: (message) => {
        console.debug('[golemancy] native message', message);
      },
      onDisconnect: (err) => {
        console.warn('[golemancy] native host disconnected', err);
        setTimeout(connect, 2000);
      },
    });
  };

  connect();

  chrome.action?.onClicked?.addListener(() => {
    connection?.send({ kind: 'ping', ts: Date.now() });
  });
});
