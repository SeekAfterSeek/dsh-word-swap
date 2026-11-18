/**
 * dsh-word-swap — 设置界面（Client 半边）。
 *
 * 手写 client bundle（与 dsh-meme 同款加载方式，无需构建）：
 *  - 注册 settings.section「词汇映射」页；
 *  - 同时注册 plugins.bundle.config（插件 → 词汇映射 详情页）复用同一面板；
 *  - 数据全走 host 半边的 /dsh-word-swap 路由（GET config / POST config / POST preview）。
 *
 * 注册 id 必须等于 loader entry 名（dsh-word-swap），否则 ModuleLoader 报
 * "loaded without registering dsh-word-swap"。
 */
window.__ModuleLoader__.load((() => {
  const ROUTE = '/dsh-word-swap'

  return {
    id: 'dsh-word-swap',
    factory: (require) => {
      const module = { exports: {} }
      const exports = module.exports
      Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

      const React = require('react')
      const h = React.createElement

      const CSS = [
        '.ws-panel{display:flex;flex-direction:column;gap:16px;padding:2px 0;font-size:13px;color:var(--dsw-alias-label-primary);max-width:760px}',
        '.ws-panel .sec{display:flex;flex-direction:column;gap:8px}',
        '.ws-panel .sec-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}',
        '.ws-panel .hint{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
        '.ws-panel .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
        '.ws-panel .switch{position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l1);cursor:pointer;transition:background .15s ease;flex:none;display:inline-block}',
        '.ws-panel .switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s ease}',
        '.ws-panel .switch.on{background:var(--dsw-alias-brand-primary)}',
        '.ws-panel .switch.on::after{transform:translateX(16px)}',
        '.ws-panel input[type=text]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px;font-size:13px;outline:none;transition:border-color .12s ease}',
        '.ws-panel input[type=text]:focus{border-color:var(--dsw-alias-brand-primary)}',
        '.ws-panel button{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;transition:border-color .12s ease}',
        '.ws-panel button:hover{border-color:var(--dsw-alias-brand-primary)}',
        '.ws-panel button:disabled{opacity:.45;cursor:default}',
        '.ws-panel .btn-primary{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
        '.ws-panel .ws-list{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1)}',
        '.ws-panel .ws-item{display:flex;gap:8px;align-items:center;padding:3px 0;cursor:pointer}',
        '.ws-panel .ws-item .path{font-family:ui-monospace,Consolas,monospace;font-size:12px}',
        '.ws-panel .ws-item .tag{font-size:10.5px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px}',
        '.ws-panel .rule{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-1)}',
        '.ws-panel .rule .line{display:flex;gap:8px;align-items:center}',
        '.ws-panel .rule .label{font-size:11.5px;color:var(--dsw-alias-label-secondary);width:60px;flex:none}',
        '.ws-panel .rule input{flex:1;min-width:120px}',
        '.ws-panel .notice{padding:7px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
        '.ws-panel .notice.err{border-color:#e5484d;color:#e5484d}',
        '.ws-panel .mono{font-family:ui-monospace,Consolas,monospace}',
        '.ws-panel .chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:1;min-width:200px}',
        '.ws-panel .chip{display:inline-flex;align-items:center;gap:5px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:3px 6px 3px 10px;font-size:12px;line-height:1.5}',
        '.ws-panel .chip button{border:0;background:transparent;padding:0 2px;font-size:13px;line-height:1;cursor:pointer;color:var(--dsw-alias-label-secondary);border-radius:999px}',
        '.ws-panel .chip button:hover{color:#e5484d}',
        '.ws-panel .seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;flex:none}',
        '.ws-panel .seg button{border:0;border-radius:0;background:transparent;padding:4px 10px;font-size:12px}',
        '.ws-panel .seg button.on{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}',
      ].join('\n')

      /** 装一次面板样式。 */
      function usePanelStyle() {
        React.useEffect(() => {
          const id = 'dsh-word-swap-style'
          if (document.getElementById(id) !== null) return undefined
          const style = document.createElement('style')
          style.id = id
          style.textContent = CSS
          document.head.appendChild(style)
          return () => {
            const existing = document.getElementById(id)
            if (existing !== null) existing.remove()
          }
        }, [])
      }

      /** GET 一个接口。 */
      async function apiGet(path) {
        const response = await fetch(ROUTE + path, { credentials: 'same-origin' })
        const body = await response.json()
        if (!response.ok || body.ok === false) throw new Error(body.error ?? `HTTP ${response.status}`)
        return body
      }

      /** POST 一个接口。 */
      async function apiPost(path, payload) {
        const response = await fetch(ROUTE + path, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = await response.json()
        if (!response.ok || body.ok === false) throw new Error(body.error ?? `HTTP ${response.status}`)
        return body
      }

      /** 把 from 输入框的串拆成词表。 */
      const splitWords = (text) => String(text ?? '')
        .split(/[,，、\s]+/)
        .map(word => word.trim())
        .filter(word => word.length > 0)

      /** 配置草稿 → 界面用的形状。 */
      function toDraft(config) {
        return {
          enabled: config.enabled !== false,
          outputEnabled: config.outputEnabled !== false,
          matchAllWorkspaces: config.matchAllWorkspaces === true,
          workspaces: [...(config.workspaces ?? [])],
          rules: (config.rules ?? []).map(rule => ({
            from: (rule.from ?? []).map(word => String(word ?? '')).filter(word => word.length > 0),
            to: String(rule.to ?? ''),
            mode: rule.mode === 'all' ? 'all' : 'any',
          })),
        }
      }

      /** 草稿 → 提交给 host 的形状。 */
      function fromDraft(draft) {
        return {
          enabled: draft.enabled,
          outputEnabled: draft.outputEnabled,
          matchAllWorkspaces: draft.matchAllWorkspaces,
          workspaces: draft.workspaces,
          rules: draft.rules
            .map(rule => ({ from: rule.from, to: rule.to.trim(), mode: rule.mode === 'all' ? 'all' : 'any' }))
            .filter(rule => rule.to.length > 0 && rule.from.length > 0),
        }
      }

      /**
       * 渲染兜底：面板内部抛错时把错误显示出来，而不是留一片空白。
       */
      class PanelBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { error: null }
        }

        static getDerivedStateFromError(error) {
          return { error }
        }

        render() {
          if (this.state.error !== null) {
            const error = this.state.error
            return h('div', { className: 'ws-panel' },
              h('div', { className: 'notice err' }, `面板渲染出错：${String(error && error.message ? error.message : error)}`),
              h('pre', {
                className: 'mono',
                style: { fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 },
              }, String(error && error.stack ? error.stack : '')),
            )
          }
          return this.props.children
        }
      }

      /** 开关。 */
      function Toggle(props) {
        return h('div', { className: 'row' },
          h('span', {
            className: `switch${props.value ? ' on' : ''}`,
            onClick: () => props.onChange(!props.value),
          }),
          h('span', null, props.label),
          props.hint === undefined ? null : h('span', { className: 'hint' }, props.hint),
        )
      }

      /** 一条映射规则的编辑器：词标签 + 目标词 + 触发关系。 */
      function RuleCard(props) {
        const rule = props.rule
        const [entry, setEntry] = React.useState('')
        const words = Array.isArray(rule.from) ? rule.from : []

        const addWords = (raw) => {
          const incoming = String(raw)
            .split(/[\r\n\t]+/)
            .map(word => word.trim())
            .filter(word => word.length > 0)
          if (incoming.length === 0) return
          // 保序去重：已有词保留原位置，新词按粘贴顺序追加
          const base = [...(Array.isArray(rule.from) ? rule.from : [])]
          for (const word of incoming) if (!base.includes(word)) base.push(word)
          props.onChange({ from: base })
        }
        const addWord = () => {
          const word = entry.trim()
          if (word === '') return
          setEntry('')
          if (words.includes(word)) return
          props.onChange({ from: [...words, word] })
        }
        const removeWord = (word) => props.onChange({ from: words.filter(item => item !== word) })

        const chips = words.map(word => h('span', { className: 'chip', key: word },
          h('span', null, word),
          h('button', { title: '删掉这个词', onClick: () => removeWord(word) }, '×'),
        ))

        return h('div', { className: 'rule' },
          h('div', { className: 'line' },
            h('span', { className: 'label' }, '我会写'),
            h('div', { className: 'chips' },
              chips.length === 0 ? h('span', { className: 'hint' }, '还没有词') : chips,
              h('input', {
                type: 'text',
                placeholder: '输入一个词，回车添加（可多行粘贴）',
                style: { width: 190 },
                value: entry,
                onChange: event => setEntry(event.target.value),
                onKeyDown: event => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  addWord()
                },
                onPaste: event => {
                  const clipboard = event.clipboardData
                  const text = clipboard === null || clipboard === undefined
                    ? ''
                    : String(clipboard.getData('text') ?? '')
                  if (!/[\r\n\t]/.test(text)) return
                  // 多行粘贴：按回车/制表符一次拆成多个标签
                  event.preventDefault()
                  addWords(entry === '' ? text : entry + '\n' + text)
                  setEntry('')
                },
              }),
              h('button', { onClick: addWord }, '添加'),
            ),
          ),
          h('div', { className: 'line' },
            h('span', { className: 'label' }, '模型看'),
            h('input', {
              type: 'text',
              placeholder: '水果',
              value: rule.to,
              onChange: event => props.onChange({ to: event.target.value }),
            }),
          ),
          h('div', { className: 'line' },
            h('span', { className: 'label' }, '触发'),
            h('div', { className: 'seg' },
              h('button', {
                className: rule.mode === 'all' ? '' : 'on',
                onClick: () => props.onChange({ mode: 'any' }),
              }, '任一词出现'),
              h('button', {
                className: rule.mode === 'all' ? 'on' : '',
                onClick: () => props.onChange({ mode: 'all' }),
              }, '同时出现'),
            ),
            h('span', { className: 'hint' },
              rule.mode === 'all'
                ? `这 ${words.length} 个词全部出现在同一句里才替换成「${rule.to || '目标词'}」`
                : `任意一个词命中就替换成「${rule.to || '目标词'}」`),
            h('button', { style: { marginLeft: 'auto', flex: 'none' }, onClick: props.onRemove }, '删除这条'),
          ),
        )
      }

      /** 设置面板。 */
      function WordSwapPanel() {
        usePanelStyle()
        const [draft, setDraft] = React.useState(null)
        const [saved, setSaved] = React.useState(null)
        const [workspaces, setWorkspaces] = React.useState([])
        const [configPath, setConfigPath] = React.useState('')
        const [notice, setNotice] = React.useState('')
        const [error, setError] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [wsBusy, setWsBusy] = React.useState(false)
        const [manualPath, setManualPath] = React.useState('')
        const [previewIn, setPreviewIn] = React.useState('葡萄，不是葡萄')
        const [preview, setPreview] = React.useState(null)

        const load = React.useCallback(async () => {
          setError('')
          try {
            const body = await apiGet('/config')
            setDraft(toDraft(body.config))
            setSaved(JSON.stringify(fromDraft(toDraft(body.config))))
            setWorkspaces(body.workspaces ?? [])
            setConfigPath(body.configPath ?? '')
          } catch (cause) {
            setError(String(cause.message ?? cause))
          }
        }, [])

        React.useEffect(() => { load() }, [load])

        if (error !== '' && draft === null) {
          return h('div', { className: 'ws-panel' },
            h('div', { className: 'notice err' }, `读取配置失败：${error}`),
            h('button', { onClick: load }, '重试'))
        }
        if (draft === null) return h('div', { className: 'ws-panel' }, h('div', { className: 'hint' }, '读取中…'))

        const dirty = JSON.stringify(fromDraft(draft)) !== saved
        const patch = (next) => setDraft({ ...draft, ...next })
        const toggleWorkspace = (path) => {
          const has = draft.workspaces.some(entry => entry.toLowerCase() === path.toLowerCase())
          patch({
            workspaces: has
              ? draft.workspaces.filter(entry => entry.toLowerCase() !== path.toLowerCase())
              : [...draft.workspaces, path],
          })
        }
        const updateRule = (index, next) => {
          const rules = draft.rules.map((rule, at) => at === index ? { ...rule, ...next } : rule)
          patch({ rules })
        }
        const removeRule = (index) => patch({ rules: draft.rules.filter((_, at) => at !== index) })
        const addRule = () => patch({ rules: [...draft.rules, { from: [], to: '', mode: 'any' }] })

        const save = async () => {
          setBusy(true)
          setError('')
          setNotice('')
          try {
            const body = await apiPost('/config', { config: fromDraft(draft) })
            setDraft(toDraft(body.config))
            setSaved(JSON.stringify(fromDraft(toDraft(body.config))))
            setNotice('已保存，正在生效（配置热读，无需重启）')
          } catch (cause) {
            setError(String(cause.message ?? cause))
          } finally {
            setBusy(false)
          }
        }

        // 注意：这个函数故意不用 useCallback —— 它原来写在下面两处 early return
        // 之后，导致首次渲染 13 个 hook、第二次渲染 14 个 hook，React 直接抛
        // Minified React error #310（Rendered more hooks than during the previous render）。
        async function refreshWorkspaces() {
          setWsBusy(true)
          setError('')
          try {
            const body = await apiGet('/workspaces')
            const list = body.workspaces ?? []
            setWorkspaces(list)
            setNotice(`工作区列表已刷新，共 ${list.length} 个`)
          } catch (cause) {
            setError(String(cause.message ?? cause))
          } finally {
            setWsBusy(false)
          }
        }

        const runPreview = async () => {
          setPreview(null)
          try {
            const body = await apiPost('/preview', { text: previewIn })
            setPreview(body)
          } catch (cause) {
            setError(String(cause.message ?? cause))
          }
        }

        const workspaceRows = workspaces.length === 0
          ? h('div', { className: 'hint' }, '没有发现可用的工作区，直接在下面手填路径。')
          : workspaces.map(entry => {
            const path = String(entry && entry.path ? entry.path : '')
            const on = draft.workspaces.some(item => item.toLowerCase() === path.toLowerCase())
            return h('label', { className: 'ws-item', key: path === '' ? `empty-${Math.random()}` : path },
              h('input', {
                type: 'checkbox',
                checked: on,
                onChange: () => toggleWorkspace(path),
              }),
              h('span', { className: 'path' }, path),
              entry && entry.source === 'config' ? h('span', { className: 'tag' }, '配置') : null,
              entry && entry.source === 'default' ? h('span', { className: 'tag' }, '默认') : null,
              entry && entry.source === 'workspace' ? h('span', { className: 'tag' }, '工作区') : null,
            )
          })

        return h('div', { className: 'ws-panel' },
          h('div', { className: 'hint' }, 'dsh-word-swap 面板 v0.2.0 已加载'),
          h('div', { className: 'sec' },
            h('div', { className: 'sec-title' }, '总开关'),
            h(Toggle, {
              label: '输入改写',
              value: draft.enabled,
              hint: '发出去之前把用户写的词换成给模型看的词',
              onChange: value => patch({ enabled: value }),
            }),
            h(Toggle, {
              label: '输出还原',
              value: draft.outputEnabled,
              hint: '模型写出目标词时，按你这一轮实际写过的词还原',
              onChange: value => patch({ outputEnabled: value }),
            }),
            h(Toggle, {
              label: '对所有工作区生效',
              value: draft.matchAllWorkspaces,
              hint: '关掉时只看下面勾选的工作区',
              onChange: value => patch({ matchAllWorkspaces: value }),
            }),
          ),

          h('div', { className: 'sec' },
            h('div', {
              className: 'sec-title',
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
            },
              h('span', null, '生效的工作区'),
              h('button', {
                disabled: wsBusy,
                onClick: refreshWorkspaces,
                style: { fontSize: 12, padding: '2px 10px' },
              }, wsBusy ? '刷新中…' : '刷新列表'),
            ),
            draft.matchAllWorkspaces
              ? h('div', { className: 'hint' }, '已开启「对所有工作区生效」，下面的勾选被忽略。')
              : h('div', { className: 'ws-list' }, workspaceRows),
            h('div', { className: 'row' },
              h('input', {
                type: 'text',
                placeholder: '手填工作区路径，例如 D:\\DSH\\Holy Shit',
                style: { flex: 1, minWidth: 240 },
                value: manualPath,
                onChange: event => setManualPath(event.target.value),
              }),
              h('button', {
                onClick: () => {
                  const path = manualPath.trim()
                  if (path === '') return
                  if (!draft.workspaces.some(item => item.toLowerCase() === path.toLowerCase())) {
                    patch({ workspaces: [...draft.workspaces, path] })
                  }
                  setManualPath('')
                },
              }, '添加'),
            ),
            draft.workspaces.length === 0
              ? h('div', { className: 'hint' }, '当前没有指定工作区 —— 等于对所有工作区生效。')
              : h('div', { className: 'hint' }, `已选 ${draft.workspaces.length} 个：${draft.workspaces.join('　|　')}`),
          ),

          h('div', { className: 'sec' },
            h('div', { className: 'sec-title' }, '词汇映射'),
            h('div', { className: 'hint' }, '每条规则：左边一堆词（一个词一个标签），右边是给模型看的词。「任一词出现」＝任意一个命中就替换；「同时出现」＝这堆词全部出现在同一句里才替换。输出时按你当次写过的词还原。'),
            draft.rules.map((rule, index) => h(RuleCard, {
              key: index,
              rule,
              onChange: next => updateRule(index, next),
              onRemove: () => removeRule(index),
            })),
            h('div', { className: 'row' },
              h('button', { onClick: addRule }, '＋ 新增一条映射'),
            ),
          ),

          h('div', { className: 'sec' },
            h('div', { className: 'sec-title' }, '试一下'),
            h('div', { className: 'row' },
              h('input', {
                type: 'text',
                style: { flex: 1, minWidth: 240 },
                value: previewIn,
                onChange: event => setPreviewIn(event.target.value),
              }),
              h('button', { onClick: runPreview }, '预览'),
            ),
            preview === null ? null : h('div', { className: 'notice' },
              h('div', null, '模型看到：', h('span', { className: 'mono' }, preview.toModel)),
              h('div', null, '你看到：', h('span', { className: 'mono' }, preview.toUser)),
              h('div', null, '本轮记录：', h('span', { className: 'mono' },
                (preview.record ?? []).map(item => `${item.target}←[${item.sources.join('→')}]`).join('  '))),
            ),
          ),

          h('div', { className: 'row' },
            h('button', { className: 'btn-primary', disabled: !dirty || busy, onClick: save },
              busy ? '保存中…' : dirty ? '保存' : '已保存'),
            h('button', { disabled: busy, onClick: load }, '重新读取'),
            dirty ? h('span', { className: 'hint' }, '有未保存的改动') : null,
          ),
          notice === '' ? null : h('div', { className: 'notice' }, notice),
          error === '' ? null : h('div', { className: 'notice err' }, error),
          configPath === '' ? null : h('div', { className: 'hint' }, `配置文件：${configPath}`),
        )
      }

      /** 安装客户端半边。 */
      function apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'word-swap', order: 26, label: '词汇映射' },
          () => h(PanelBoundary, null, h(WordSwapPanel)),
        ))
        slots.inject('plugins.bundle.config', () => slots.register(
          { name: 'plugins.bundle.config', key: 'dsh-word-swap' },
          () => h(PanelBoundary, null, h(WordSwapPanel)),
        ))
      }

      exports.apply = apply
      exports.inject = ['slots']
      exports.__test = { splitWords, toDraft, fromDraft }
      return module.exports
    },
  }
})())
