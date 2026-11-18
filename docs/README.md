# dsh-word-swap

DSH 词汇映射插件。两件事，都在运行时完成，**不改宿主任何文件**（DSH 升级不受影响）：

1. **输入改写**：发请求前把用户写的词换成「给模型看的词」，同时记下这一轮每个目标词实际来自哪些原始词、按出现顺序。
2. **输出还原**：模型吐出目标词时，按上面的记录逆序还原成你当次真正写下的词（说超了次数就粘最后一个）。

作用范围按**工作区**过滤（会话的工作目录），可以是多个工作区，也可以对所有工作区生效。

## 安装

已经装进 desktop profile：

```
plugin_manager install_bundle  target = file:/path/to/dsh-word-swap
```

装完 host 半边立刻生效（无需重启）；客户端设置页刷新一下页面即可看到。

## 设置界面

设置 → **词汇映射**（也出现在 插件 → 词汇映射 详情页）：

- 三个开关：输入改写 / 输出还原 / 对所有工作区生效
- 工作区勾选（自动列出侧边栏里建过的工作区、默认目录、配置里的、以及现有会话用过的目录），也可以手填路径；标题右边有「刷新列表」，新建工作区后点一下就能勾上，不用重开设置页
- 词汇映射表：一行 = 一组「我会写」→「模型看」，可新增、删除
- 试一下：给一句话，看模型看到什么、你会看到什么、本轮记录长什么样

## 配置文件

`$DSH_HOME/dsh-word-swap/config.json`（默认 `C:\Users\Lenovo\.dsh\dsh-word-swap\config.json`），mtime 变了就热读，改完 1.5 秒内生效：

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

- `rules[].from`：字符串或字符串数组，多个词映射到同一个 `to`。
- `rules[].to`：给模型看的词，同时是输出侧要还原的目标词。
- `workspaces` 为空 = 对所有工作区生效；只写目录名（不含分隔符）按末段匹配。
- `matchAllWorkspaces: true` 时忽略 `workspaces`。

## HTTP 接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/dsh-word-swap/config` | 读配置 + 配置文件路径 + 已知工作区 |
| POST | `/dsh-word-swap/config` | 保存配置（body `{ config }`） |
| GET | `/dsh-word-swap/workspaces` | 只重新枚举工作区列表（给「刷新列表」按钮用），不读配置 |
| POST | `/dsh-word-swap/preview` | 试算（body `{ text }`，返回 `toModel` / `toUser` / `hits` / `record`） |

## 实现要点

- 输入侧挂 `agent/pre-step`（waterfall）：`await next()` 后改写 `decision.messages` 里的 text 块，按消息 id 去重，避免后续 step 重复记录。
- 输出侧挂 `llm/stream`（waterfall）：包一层异步迭代器，`text-delta` 进 per-block 缓冲，`safe = buffer.length - (maxOutLen - 1)` 留住尾巴防止跨分片把词切断；`block-end` 补发尾巴并把 `block.text` 换成还原后的全文。`options.purpose !== undefined` 的辅助调用（标题生成等）原样放过。
- 会话记录 `Map<sessionId, { record: Map<target,{sources,last}>, seen }>`，最多 64 个会话。
- 多来源（一个 `to` 对应多个 `from`）走动态还原：本轮第 k 次出现 → `sources[k]`；来源唯一时是静态替换。用户自己直接写目标词时，记一条「来源即本身」，原样还回去。
