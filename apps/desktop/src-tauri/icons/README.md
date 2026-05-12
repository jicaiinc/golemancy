# Tauri icons

Tauri requires `icon.png` (1024×1024), `icon.ico`, `icon.icns`, and the resized
PNG variants listed in `tauri.conf.json > bundle.icon`. They are not committed
because they are platform-specific binaries derived from a source SVG.

Generate them from a source asset (e.g. a 1024×1024 PNG you place in this
folder as `source.png`) with:

```sh
pnpm --filter @golemancy/desktop tauri icon icons/source.png
```

`pnpm --filter @golemancy/desktop tauri:dev` will run without icons but
`pnpm --filter @golemancy/desktop tauri:build` requires them.
