# Golemancy 打包流程 (Packaging Pipeline)

## 需求清单

1. **安装依赖**: `electron-builder@^26` + `esbuild@^0.25` 到 `apps/desktop/` devDependencies
2. **服务端打包脚本** (`scripts/bundle-server.mjs`): esbuild 打包 server 为单文件 ESM，external `better-sqlite3` + `@vscode/ripgrep`，复制 native modules 到 `resources/server/node_modules/`
3. **electron-builder 配置** (`apps/desktop/electron-builder.yml`): 全平台配置，extraResources 包含 `runtime/` + `server/`，ASAR 打包
4. **macOS Entitlements** (`apps/desktop/resources/build/entitlements.mac.plist`): JIT、网络、文件、library-validation 等权限
5. **修改 main process** (`apps/desktop/src/main/index.ts`): packaged 模式下用捆绑 Node.js 作为 execPath，APP_VERSION 从 package.json 读取
6. **打包命令**: `pack`/`dist`/平台特定命令，根 package.json 加入 turbo 入口
7. **.gitignore 更新**: 忽略 `release/` 和 `resources/server/`

## 核心架构决策

- **捆绑 Node.js 运行服务端**: `resources/runtime/node/bin/node` fork 服务端，不用 Electron binary
- **esbuild 打包服务端**: 单文件 ESM，external `better-sqlite3` + `@vscode/ripgrep`
- **electron-builder**: 标准打包，全平台配置

## 暂不包含

- 代码签名、公证、自动更新、CI/CD、Windows/Linux 实际构建测试

## 验证方式

1. `bundle-server` 命令成功
2. `pack` 生成 `.app`
3. 应用能启动、server 能连通
4. 现有测试不 break
