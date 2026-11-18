# dsh-word-swap

DeepSeek Harness 的**词汇映射**插件：发给模型之前，把你在输入里写的词换成你指定的「模型面词」；模型写回这个词时，再按你这一轮实际写过的原词还原。

典型用途：测试模型对同义/上位词的推理表现、控制某个词不进入模型上下文、或者让对话在模型侧统一术语——而你自己看到的仍是你原本的措辞。

全部在运行时完成，**不修改宿主任何文件**，DSH 升级不受影响。

## 特性

- **输入改写**：按工作区过滤，先把你的词替换成目标词，再发请求。一条规则可带多个原词（`葡萄/柚子/香蕉/苹果 → 水果`）。
- **输出还原**：模型吐出目标词，就按你**当次实际写过的原词按出现顺序**还原；写超次数时粘最后一个，不会乱序。
- **按工作区生效**：只在指定工作区里替换，其它工作区完全不受影响；也能一键对所有工作区生效。
- **热生效**：改配置不用重启，1.5 秒内下一轮对话就换新规则。
- **设置界面**：设置 → 词汇映射，勾工作区、编辑词表、一键试算（看模型看到什么 / 你会看到什么）。

## 安装

前提：DSH 0.2.2 及以上，profile 已启用 plugin manager。

```text
plugin_manager install_bundle  target = file:/path/to/dsh-word-swap
```

或者在 DSH 的插件页面用「添加插件 → 本地路径」填入插件目录。

安装后 host 半边立即生效（无需重启 DSH）；设置页刷新一次页面即可看到「词汇映射」。

## 设置界面

设置 → 词汇映射：

- **总开关**：输入改写 / 输出还原 / 对所有工作区生效。
- **生效的工作区**：勾选列表（来源是 DSH 的工作区注册表 + 默认目录 + 现有会话目录），右侧「刷新列表」可重新枚举——新建的工作区点一下就出现，不必重开设置页。也能手填路径。
- **词汇映射**：每行「我会写」→「模型看」。「我会写」支持逗号分隔多个词。
- **试一下**：输入一句话，显示 `toModel`（模型看到）、`toUser`（你会看到）、以及这一轮建立的映射记录。

## 配置文件

路径：`$DSH_HOME/dsh-word-swap/config.json`（Windows 下通常是 `%USERPROFILE%\.dsh\dsh-word-swap\config.json`）。

```json
{
  "enabled": true,
  "outputEnabled": true,
  "matchAllWorkspaces": false,
  "workspaces": ["D:\\DSH\\Holy Shit"],
  "rules": [
    { "from": ["葡萄", "柚子", "香蕉", "苹果"], "to": "水果" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `enabled` | 输入改写总开关 |
| `outputEnabled` | 输出还原总开关 |
| `matchAllWorkspaces` | `true` 时忽略 `workspaces`，对所有工作区生效 |
| `workspaces` | 生效的工作区路径数组；只写目录名（不含分隔符）按末段名匹配，大小写不敏感 |
| `rules[].from` | 会被替换掉的词，字符串或字符串数组 |
| `rules[].to` | 给模型看的词 |
| `rules[].mode` | 触发关系：`any`（默认，任一词出现即替换）/ `all`（词群全部出现在同一句才替换） |

配置按文件 mtime 热读，改完不用重启。

## HTTP 接口

插件自带一套只读/保存接口，设置界面就是调它们：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/dsh-word-swap/config` | 读配置 + 配置文件路径 + 已知工作区 |
| GET | `/dsh-word-swap/workspaces` | 只重新枚举工作区列表（给「刷新列表」用），不读配置 |
| POST | `/dsh-word-swap/config` | 保存配置（body `{ config }`） |
| POST | `/dsh-word-swap/preview` | 试算（body `{ text }`，返回 `toModel` / `toUser` / `hits` / `record`） |

## 实现要点

- 输入侧挂在 `llm/stream` 里做**请求层改写**：克隆一份 `GenerateOptions`，把其中 user 消息的 text 块换成目标词，再用 `WeakSet` 标记这份克隆、把请求重新送进 `llm.stream()`（重入时直接 `next()` 放行）。
  不改 `agent/pre-step` 是故意的：agent-loop 会把 `decision.messages` 追加进会话（`dsh-agent-loop/lib/index.js:892`），那样用户自己的聊天框里就会显示被替换后的词。改成请求层改写后，会话里存的始终是用户原文，聊天框显示原文，只有发给模型的请求被换掉。
- 输出侧挂 `llm/stream` 瀑布：包一层异步迭代器，`text-delta` 进缓冲，`block-end` 补发尾巴并回写完整文本；跨分片断词用 `maxOutLen - 1` 的长度留尾规避。
- 会话级映射记录 `Map<sessionId, {record, seen}>`，`record` 是 `目标词 → { sources: 原词序列, last }`；请求改写时取最后一条带命中的用户消息刷新它，没有命中就沿用上一轮（跨轮粘住）。
- 过滤：`options.purpose !== undefined`（标题生成等辅助请求）直接放行，不参与改写。

## 目录

```
dsh-word-swap/
├── index.js            host 半边：请求层改写 + llm/stream 还原 + HTTP 接口
├── client.js           客户端半边：设置 → 词汇映射 面板
├── cordis.patch.yml    插件行声明
├── package.json        dsh.bundle / dsh.client 清单
├── docs/README.md      较早的中文说明（含字段细节）
└── locale/             中英文案
```

## License

MIT
