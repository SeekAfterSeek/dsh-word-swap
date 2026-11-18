/**
 * dsh-word-swap — 词汇映射（Host 半边）。
 *
 * 两件事，全部在运行时做，不改宿主任何文件：
 *  1) 输入侧：Event `llm/stream`（waterfall）。克隆一份请求、把其中 user 消息的
 *     文本换成「给模型看的词」再发出去；会话里存的仍是用户原文，聊天框不受影响。
 *     同时记下这一轮每个目标词实际来自哪些原始词、按出现顺序排列。
 *  2) 输出侧：同一个 `llm/stream`。模型吐出的文本里出现目标词时，按记录逆序还原
 *     成用户当次真正写下的词（超出记录次数就粘最后一个）。
 *
 * 作用范围按工作区（会话的工作目录）过滤：配置里的 workspaces 为空表示所有工作区。
 * 配置存 $DSH_HOME/dsh-word-swap/config.json，mtime 变了就热读，不用重启；
 * 设置界面由 client.js 注册（走本插件的 /dsh-word-swap HTTP 路由）。
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 插件名（cordis entry 名）。 */
export const name = 'dsh-word-swap'

/** 依赖的宿主服务。 */
export const inject = ['webServer', 'sessions', 'workingDirectory']

const DSH_HOME = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
  ? process.env.DSH_HOME
  : join(homedir(), '.dsh')

const CONFIG_PATH = join(DSH_HOME, 'dsh-word-swap', 'config.json')
const ROUTE = '/dsh-word-swap'

/** 默认配置：上线即按用户指定的一组设置跑。 */
const DEFAULT_CONFIG = {
  /** 输入侧改写总开关。 */
  enabled: true,
  /** 输出侧还原总开关。 */
  outputEnabled: true,
  /** 只看 workspaces 之外的补丁：true 时忽略 workspaces，对所有工作区生效。 */
  matchAllWorkspaces: false,
  /** 生效的工作区：绝对路径、父目录前缀，或只写目录名（按末段匹配）。 */
  workspaces: ['D:\\DSH\\Holy Shit'],
  /** 规则：from 是要被换掉的词（字符串或数组），to 是给模型看的词。 */
  rules: [{ from: ['葡萄', '柚子', '香蕉', '苹果'], to: '水果' }],
}

// ---------------------------------------------------------------------------
// 配置读写（mtime 热加载）
// ---------------------------------------------------------------------------

let configCache = { mtime: -1, config: DEFAULT_CONFIG }

/** 读配置；文件不存在时返回默认值并落盘，读取失败退回内存默认。 */
function loadConfig() {
  let mtime = -1
  try {
    mtime = statSync(CONFIG_PATH).mtimeMs
  } catch {
    // 首次运行：把默认配置写下去，用户能在设置里直接看到并改
    try {
      mkdirSync(dirname(CONFIG_PATH), { recursive: true })
      writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
      mtime = statSync(CONFIG_PATH).mtimeMs
    } catch {
      return normalizeConfig(DEFAULT_CONFIG)
    }
  }
  if (mtime === configCache.mtime) return configCache.config
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    const config = normalizeConfig(parsed)
    configCache = { mtime, config }
    return config
  } catch {
    // 用户手改坏了 JSON：沿用上一次的成功值，不让改写整个停掉
    return configCache.config === DEFAULT_CONFIG ? normalizeConfig(DEFAULT_CONFIG) : configCache.config
  }
}

/** 存配置（设置界面保存时调用）。 */
function saveConfig(patch) {
  const current = loadConfig()
  const next = normalizeConfig({ ...current, ...patch })
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  configCache = { mtime: statSync(CONFIG_PATH).mtimeMs, config: next }
  return next
}

/** 把任意输入收成一个干净的配置对象。 */
function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const rules = []
  for (const rule of Array.isArray(source.rules) ? source.rules : []) {
    if (rule === null || typeof rule !== 'object') continue
    const to = String(rule.to ?? '').trim()
    if (to.length === 0) continue
    const fromRaw = Array.isArray(rule.from) ? rule.from : [rule.from]
    const from = [...new Set(fromRaw
      .map(value => String(value ?? '').trim())
      .filter(value => value.length > 0 && value !== to))]
    if (from.length === 0) continue
    rules.push({ from, to })
  }
  return {
    enabled: source.enabled !== false,
    outputEnabled: source.outputEnabled !== false,
    matchAllWorkspaces: source.matchAllWorkspaces === true,
    workspaces: (Array.isArray(source.workspaces) ? source.workspaces : [])
      .map(value => String(value ?? '').trim())
      .filter(value => value.length > 0),
    rules,
  }
}

// ---------------------------------------------------------------------------
// 规则模型
// ---------------------------------------------------------------------------

/**
 * 编译规则：输入侧 from→to，输出侧按 to 反推 from。
 * @param config - 归一化后的配置。
 * @returns 两个按长度降序的匹配表。
 */
function buildModel(config) {
  /** @type {{ pat: string, to: string }[]} */
  const inputList = []
  /** @type {{ pat: string, target: string, repl: string | null }[]} */
  const outputList = []
  for (const rule of config.rules) {
    // 同一个 to 可能被多条规则指向；输出侧合并来源，按规则顺序保留
    for (const from of rule.from) inputList.push({ pat: from, to: rule.to })
    const existing = outputList.find(entry => entry.pat === rule.to)
    if (existing !== undefined) continue
    outputList.push({
      pat: rule.to,
      target: rule.to,
      // 一个目标词只对应一个来源时静态替换；对应多个来源时按本轮记录动态取
      repl: rule.from.length === 1 ? rule.from[0] : null,
    })
  }
  // 长词优先，避免「葡萄干」被「葡萄」先吃掉
  inputList.sort((left, right) => right.pat.length - left.pat.length)
  outputList.sort((left, right) => right.pat.length - left.pat.length)
  const maxOutLen = outputList.reduce((max, entry) => Math.max(max, entry.pat.length), 0)
  return { inputList, outputList, targets: outputList.map(entry => entry.pat), maxOutLen }
}

/**
 * 改写一句用户输入，并把命中顺序记下来。
 * @param text - 原文。
 * @param model - 编译后的规则。
 * @param hits - 收集容器，按文本出现顺序 push `{ to, src }`。
 * @returns 改写后的文本。
 */
function rewriteInput(text, model, hits) {
  let out = ''
  let index = 0
  while (index < text.length) {
    let matched = null
    for (const entry of model.inputList) {
      if (text.startsWith(entry.pat, index)) {
        matched = entry
        break
      }
    }
    if (matched === null) {
      out += text[index]
      index += 1
      continue
    }
    out += matched.to
    hits.push({ to: matched.to, src: matched.pat })
    index += matched.pat.length
  }
  // 用户自己就写了目标词：记一条「来源就是它本身」，输出侧原样还回去
  const mentioned = new Set(hits.map(hit => hit.to))
  for (const target of model.targets) {
    if (mentioned.has(target)) continue
    if (text.includes(target)) hits.push({ to: target, src: target })
  }
  return out
}

/**
 * 按当前记录给出一个输出侧命中该换成什么。
 * @param entry - 输出侧匹配项。
 * @param record - 本轮记录 `Map<target, { sources, last }>`。
 * @param cursors - 本次响应内每个目标词已经被消费到第几个。
 * @returns 替换文本；null 表示保持原样。
 */
function replacementFor(entry, record, cursors) {
  if (entry.repl !== null) return entry.repl
  const state = record?.get(entry.pat)
  if (state === undefined) return null
  const used = cursors.get(entry.pat) ?? 0
  cursors.set(entry.pat, used + 1)
  if (used < state.sources.length) return state.sources[used]
  return state.last ?? null
}

/**
 * 从缓冲区头部尽量吐出已确定的输出，尾部留着等下个分片。
 * @param buffer - 待处理原文。
 * @param model - 编译后的规则。
 * @param record - 本轮记录。
 * @param cursors - 消费游标。
 * @param final - true 表示这是最后一段，全部吐完。
 * @returns `{ emit, rest }`。
 */
function drain(buffer, model, record, cursors, final) {
  const safe = final ? buffer.length : buffer.length - (model.maxOutLen - 1)
  let out = ''
  let index = 0
  while (index < buffer.length) {
    let matched = null
    for (const entry of model.outputList) {
      if (buffer.startsWith(entry.pat, index)) {
        matched = entry
        break
      }
    }
    if (matched !== null) {
      const replacement = replacementFor(matched, record, cursors)
      out += replacement === null ? matched.pat : replacement
      index += matched.pat.length
      continue
    }
    if (index >= safe) break
    out += buffer[index]
    index += 1
  }
  return { emit: out, rest: buffer.slice(index) }
}

// ---------------------------------------------------------------------------
// 工作区匹配
// ---------------------------------------------------------------------------

/** 统一路径写法，便于比较。 */
function normalizePath(value) {
  return String(value ?? '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

/**
 * 这个工作目录是否在生效范围内。
 * @param config - 配置。
 * @param cwd - 会话工作目录。
 * @returns 是否生效。
 */
function matchesWorkspace(config, cwd) {
  if (config.matchAllWorkspaces) return true
  const list = config.workspaces ?? []
  if (list.length === 0) return true
  const target = normalizePath(cwd)
  if (target.length === 0) return false
  for (const entry of list) {
    const wanted = normalizePath(entry)
    if (wanted.length === 0) continue
    if (target === wanted) return true
    if (target.startsWith(`${wanted}\\`)) return true
    // 只写了目录名（不含分隔符）：按末段匹配
    if (!wanted.includes('\\') && target.split('\\').pop() === wanted) return true
  }
  return false
}

/** 取一个会话的工作目录，取不到算空串。 */
function cwdOfSession(ctx, session) {
  if (session === undefined || session === null) return ''
  try {
    return ctx.workingDirectory.get(session)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// 会话级记录：这一轮模型说的「水果」要还原成什么
// ---------------------------------------------------------------------------

const MAX_SESSIONS = 64
/** @type {Map<string, { record: Map<string, { sources: string[], last: string }>, seen: string[] }>} */
const sessionState = new Map()

/**
 * 取（或建）某个会话的记录容器。
 * @param sessionId - 会话 id。
 * @returns 该会话的状态。
 */
function stateOf(sessionId) {
  const key = String(sessionId ?? '')
  let state = sessionState.get(key)
  if (state === undefined) {
    state = { record: new Map(), seen: [] }
    sessionState.set(key, state)
    while (sessionState.size > MAX_SESSIONS) {
      const oldest = sessionState.keys().next()
      if (oldest.done === true) break
      sessionState.delete(oldest.value)
    }
  }
  return state
}

/**
 * 把一次改写的命中写进记录（按目标词分组，保持出现顺序）。
 * @param state - 会话状态。
 * @param hits - 命中列表。
 */
function applyHits(state, hits) {
  const grouped = new Map()
  for (const hit of hits) {
    if (!grouped.has(hit.to)) grouped.set(hit.to, [])
    grouped.get(hit.to).push(hit.src)
  }
  for (const [target, sources] of grouped) {
    state.record.set(target, { sources, last: sources[sources.length - 1] })
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 请求层改写：会话里存原文，只把「送给模型的那一份」换掉
// ---------------------------------------------------------------------------

/** 已被本插件克隆并重发的请求对象，用于跳出 llm/stream 的重入。 */
const REENTER = new WeakSet()

/**
 * 克隆一份请求，把其中 user 消息的文本按规则改写。
 * 只记录最后一条带命中的用户消息，作为输出侧逆映射的依据。
 * @param options - 原始 GenerateOptions（深冻结，不可改）。
 * @param model - 编译后的规则。
 * @returns 改写后的 messages、是否变化、以及本轮命中。
 */
function rewriteRequest(options, model) {
  const messages = []
  let changed = false
  let hits = []
  for (const message of options.messages) {
    if (message?.role !== 'user' || !Array.isArray(message.content)) {
      messages.push(message)
      continue
    }
    const local = []
    let touched = false
    const content = message.content.map(part => {
      if (part?.type !== 'text' || typeof part.text !== 'string') return part
      const text = rewriteInput(part.text, model, local)
      if (text === part.text) return part
      touched = true
      return { ...part, text }
    })
    if (local.length > 0) hits = local
    if (touched) {
      changed = true
      messages.push({ ...message, content })
    } else {
      messages.push(message)
    }
  }
  return { messages, changed, hits }
}

// 插件本体
// ---------------------------------------------------------------------------

/**
 * 安装插件。
 * @param ctx - 插件上下文。
 */
export function apply(ctx) {
  // ---- 输入侧：请求层改写 ----
  // 不能挂在 agent/pre-step 上：agent-loop 会把 decision.messages 追加进会话
  // （dsh-agent-loop/lib/index.js:892 session.append("user/message", message)），
  // 用户在聊天框里就会看到被替换后的词。这里改成克隆请求再重发。
  // ---- 输出侧 ----

  ctx.on('llm/stream', function (options, next) {
    const config = loadConfig()
    // 只处理主对话请求：标题生成之类的辅助调用原样放过
    if (options.purpose !== undefined) return next()
    if (REENTER.has(options)) return next()
    const session = options.sessionId === undefined ? undefined : ctx.sessions.get(options.sessionId)
    if (session !== undefined && !matchesWorkspace(config, cwdOfSession(ctx, session))) return next()
    const key = session?.id ?? options.sessionId
    const model = buildModel(config)
    let source = null

    if (config.enabled && model.inputList.length > 0) {
      const plan = rewriteRequest(options, model)
      if (plan.hits.length > 0) applyHits(stateOf(key), plan.hits)
      if (plan.changed) {
        const llm = this?.stream !== undefined ? this : (ctx.llm ?? ctx.get('llm'))
        if (llm?.stream !== undefined) {
          const rewritten = { ...options, messages: plan.messages }
          REENTER.add(rewritten)
          source = llm.stream(rewritten)
        }
      }
    }

    if (source === null) source = next()
    if (!config.outputEnabled || model.outputList.length === 0) return source
    return wrapStream(source, model, stateOf(key).record)
  })

  // ---- HTTP：设置界面用 ----
  const webServer = ctx.webServer ?? ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler(req, res) {
        handleRequest(ctx, req, res)
      },
    }), 'dsh-word-swap: settings api')
  }
}

/**
 * 包一层流：文本分片过映射，块结束时把尾巴补上并修正块正文。
 * @param source - 上游分片流。
 * @param model - 编译后的规则。
 * @param record - 本轮记录。
 * @returns 改写后的分片流。
 */
async function* wrapStream(source, model, record) {
  /** @type {Map<number, { rest: string, out: string }>} */
  const blocks = new Map()
  const cursors = new Map()
  for await (const chunk of source) {
    if (chunk?.type === 'text-delta') {
      const slot = blocks.get(chunk.index) ?? { rest: '', out: '' }
      const { emit, rest } = drain(slot.rest + chunk.text, model, record, cursors, false)
      blocks.set(chunk.index, { rest, out: slot.out + emit })
      if (emit.length > 0) yield { ...chunk, text: emit }
      continue
    }
    if (chunk?.type === 'block-end') {
      const slot = blocks.get(chunk.index)
      if (slot !== undefined) {
        blocks.delete(chunk.index)
        const { emit } = drain(slot.rest, model, record, cursors, true)
        const full = slot.out + emit
        if (emit.length > 0) yield { type: 'text-delta', index: chunk.index, text: emit }
        const block = chunk.block
        if (block?.type === 'text' && typeof block.text === 'string') {
          yield { ...chunk, block: { ...block, text: full } }
          continue
        }
      } else {
        // 没有分片、只有整块的适配器：整段重写一次
        const block = chunk.block
        if (block?.type === 'text' && typeof block.text === 'string') {
          const { emit } = drain(block.text, model, record, cursors, true)
          yield { ...chunk, block: { ...block, text: emit } }
          continue
        }
      }
      yield chunk
      continue
    }
    yield chunk
  }
  // 流提前结束时把没吐完的尾巴补上，避免用户看到半句话
  for (const [index, slot] of blocks) {
    const { emit } = drain(slot.rest, model, record, cursors, true)
    if (emit.length > 0) yield { type: 'text-delta', index, text: emit }
  }
  blocks.clear()
}

// ---------------------------------------------------------------------------
// HTTP 处理
// ---------------------------------------------------------------------------

/** 回一个 JSON。 */
function sendJson(res, body, status = 200) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

/** 读完请求体。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => {
      chunks.push(chunk)
      if (chunks.reduce((sum, item) => sum + item.length, 0) > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * 已知的工作区列表：默认目录 + 配置里写过的 + 现有会话用过的。
 * @param ctx - 插件上下文。
 * @param config - 配置。
 * @returns 去重后的列表。
 */
function listWorkspaces(ctx, config) {
  const seen = new Map()
  const push = (directory, source) => {
    const path = String(directory ?? '').trim()
    if (path.length === 0) return
    const key = normalizePath(path)
    if (seen.has(key)) return
    seen.set(key, { path, name: path.split(/[\\/]/).pop() ?? path, source })
  }
  try {
    const registry = ctx.get('workspaceRegistry')
    for (const workspace of registry?.list?.() ?? []) push(workspace?.path, 'workspace')
  } catch {
    // 没有工作区服务时，退回默认目录 / 配置 / 会话三种来源
  }
  push(ctx.workingDirectory?.defaultDirectory, 'default')
  for (const entry of config.workspaces) push(entry, 'config')
  try {
    for (const session of ctx.sessions.list()) push(cwdOfSession(ctx, session), 'session')
  } catch {
    // 列不出来也不影响设置页（还能手填路径）
  }
  return [...seen.values()].slice(0, 60)
}

/**
 * 处理设置界面的请求。
 * @param ctx - 插件上下文。
 * @param req - 请求。
 * @param res - 响应。
 */
function handleRequest(ctx, req, res) {
  const url = new URL(req.url ?? ROUTE, 'http://localhost')
  const path = url.pathname.slice(ROUTE.length) || '/'
  const config = loadConfig()

  if (req.method === 'GET' && (path === '/' || path === '/config')) {
    sendJson(res, {
      ok: true,
      config,
      configPath: CONFIG_PATH,
      workspaces: listWorkspaces(ctx, config),
    })
    return
  }

  if (req.method === 'GET' && path === '/workspaces') {
    sendJson(res, { ok: true, workspaces: listWorkspaces(ctx, config) })
    return
  }

  if (req.method === 'POST' && path === '/config') {
    readBody(req).then(body => {
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        sendJson(res, { ok: false, error: '请求体不是合法 JSON' }, 400)
        return
      }
      const saved = saveConfig(parsed?.config ?? parsed ?? {})
      sendJson(res, { ok: true, config: saved, configPath: CONFIG_PATH })
    }).catch(error => {
      sendJson(res, { ok: false, error: String(error?.message ?? error) }, 400)
    })
    return
  }

  if (req.method === 'POST' && path === '/preview') {
    readBody(req).then(body => {
      let parsed = {}
      try {
        parsed = JSON.parse(body || '{}')
      } catch {
        parsed = {}
      }
      const text = String(parsed.text ?? '')
      const model = buildModel(config)
      const hits = []
      const rewritten = rewriteInput(text, model, hits)
      const state = { record: new Map(), seen: [] }
      applyHits(state, hits)
      const cursors = new Map()
      const { emit } = drain(rewritten, model, state.record, cursors, true)
      sendJson(res, {
        ok: true,
        toModel: rewritten,
        toUser: emit,
        hits,
        record: [...state.record.entries()].map(([target, value]) => ({ target, ...value })),
      })
    }).catch(error => {
      sendJson(res, { ok: false, error: String(error?.message ?? error) }, 400)
    })
    return
  }

  sendJson(res, { ok: false, error: `unknown route ${path}` }, 404)
}

// 供 node --test / 手工脚本直接验证纯逻辑
export const __test = {
  normalizeConfig,
  buildModel,
  rewriteInput,
  drain,
  matchesWorkspace,
  applyHits,
  wrapStream,
  loadConfig,
  saveConfig,
  CONFIG_PATH,
  DEFAULT_CONFIG,
}
