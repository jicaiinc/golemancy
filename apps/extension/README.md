# Golemancy Browser Extension

MV3 extension that connects the active browser profile to the Golemancy desktop
sidecar through Native Messaging.

The Native Messaging host registration (`com.golemancy.bridge`) is installed by
the desktop app; the host itself reads `~/.golemancy/native-host-runtime.json`
written by the sidecar at startup to discover the local API URL and bearer
token.
