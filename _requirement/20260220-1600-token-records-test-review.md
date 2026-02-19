# token_records 功能测试与代码审查

## 背景

`token_records` 表已实现完毕，需要进行测试和代码审查确保质量。

## 需求

### 1. E2E / 集成测试

编写测试用例覆盖 `token_records` 功能的关键路径：

- **Chat 正常完成**：发送消息后，`token_records` 表有对应记录（source='chat', aborted=0）
- **Chat Abort**：中断流式请求后，`token_records` 表有 abort 记录（aborted=1）
- **Cron 执行**：定时任务完成后写入 token_record（source='cron'）
- **Sub-agent**：子 Agent 调用完成后写入 token_record（source='sub-agent'，有 parentRecordId）
- **Messages 表**：provider/model 列正确写入
- **Dashboard 查询**：token 统计从 token_records 表查询，兼容旧 messages 数据

### 2. 代码审查（并行进行）

从三个维度审查所有 token_records 相关改动：

- **Quality (CR-Quality)**：代码质量、一致性、可维护性、错误处理
- **Security (CR-Security)**：SQL 注入、数据泄露、权限控制
- **Performance (CR-Performance)**：查询效率、索引使用、UNION ALL 性能

### 3. 修正错误

审查和测试中发现的问题需要修正。

## 改动文件清单

| 包 | 文件 | 改动 |
|---|------|------|
| shared | `types/conversation.ts` | Message 添加 provider/model |
| shared | `services/interfaces.ts` | saveMessage data 添加 provider/model |
| server | `db/schema.ts` | 新增 tokenRecords 表；messages 加列 |
| server | `db/migrate.ts` | Migration v5 |
| server | `utils/ids.ts` | 添加 'tkr' prefix |
| server | `storage/token-records.ts` | **NEW** TokenRecordStorage |
| server | `storage/conversations.ts` | saveMessage 接受 provider/model |
| server | `storage/dashboard.ts` | 查询迁移到 token_records |
| server | `routes/chat.ts` | onFinish/onAbort 写 token_record |
| server | `scheduler/executor.ts` | cron 写 token_record |
| server | `agent/sub-agent.ts` | sub-agent 写 token_record |
| server | `agent/tools.ts` | 传递 tokenRecordStorage |
| server | `app.ts` | ServerDependencies 添加 tokenRecordStorage |
| server | `index.ts` | 实例化 TokenRecordStorage |
| ui | `services/mock/data.ts` | mock data 添加 provider/model |
| ui | `services/mock/services.ts` | mock service 添加 provider/model |

## 验收标准

1. 所有新测试通过
2. 所有现有测试通过（`pnpm test` 全绿）
3. 三个维度 Code Review 无 CRITICAL 级问题
4. 发现的问题已修正
