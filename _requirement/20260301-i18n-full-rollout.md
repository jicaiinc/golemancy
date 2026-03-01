# 需求清单：i18n 全量实施
> 创建时间：2026-03-01
> 状态：已确认

## 功能需求
1. 将所有 UI 页面/组件中的硬编码英文文本替换为 `t()` 调用
2. 填充所有 namespace JSON 文件（当前均为空 `{}`）
3. 在 Global Settings → General tab 添加 Language 选择器（手动切换语言）
4. Server routes 的 error message 改为 error code，UI 侧映射翻译
5. Electron 主进程菜单/对话框文本支持 i18n
6. 只维护英文翻译，中文暂不实现

## 技术约束
1. 遵循 `_design/i18n-guidelines.md` 的边界准则
2. 共用词（Cancel, Save, Delete 等）必须使用 `common:button.*`，不在各 namespace 重复
3. AI-facing 文本（server/agent/）永远不做 i18n
4. 外部/动态错误原样透传，只 i18n fallback
5. 不适合 i18n 的内容记录到 `_design/i18n-exceptions.md`，不强行替换

## 注意事项
1. 绝对不动 git
2. 替换后所有测试必须通过
3. 以安全为主，有疑问的地方宁可不改也不引入错误
