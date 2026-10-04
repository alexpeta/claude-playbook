import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { AgentRow, Usage } from '../types'

const usage = atom({ plugin: 'cockpit', key: 'usage' } as const, null)
const agents = atom({ plugin: 'cockpit', key: 'agents' } as const, {})
const history = atom({ plugin: 'cockpit', key: 'history' } as const, [])

// Claude Code's own theme keys (read off the 2.1.289 binary's theme tables), so the band follows
// the person's theme the way /usage and the agent list do.
const THEME = { accent: 'claude', warn: 'warning', bad: 'error', dim: 'subtle', ok: 'success', ctx: 'permission', limit: 'rate_limit_fill' }
const HUES = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan', 'yellow', 'red'].map(h => `${h}_FOR_SUBAGENTS_ONLY`)

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const SPARK = '▁▂▃▄▅▆▇█'
const TICK_MS = 250
const DONE_SHOWN_MS = 60_000
const HISTORY = 24

// The builder call cap, mirrored from the playbook's hooks/call-cap.py, which enforces it: the
// same environment names and the same defaults. The band shows the count; the hook stops a build.
async function capOf($: EngineInterface) {
  const types = (await $.env.get('CLAUDE_CALL_CAP_AGENTS')) ?? 'builder'
  return {
    types: types.split(',').filter(Boolean),
    cap: Number((await $.env.get('CLAUDE_CALL_CAP')) ?? 400),
    warnAt: Number((await $.env.get('CLAUDE_CALL_CAP_WARN_AT')) ?? 360),
  }
}

function toUsage(u: { context: SessionContextUsage; rateLimits: SessionRateLimit[]; cost?: SessionCost }): Usage {
  const out: Usage = {
    window: u.context.window,
    limits: u.rateLimits.map(l => (l.resetsAt === undefined
      ? { kind: l.kind, percentUsed: l.percentUsed }
      : { kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
  if (u.context.tokens !== undefined) out.tokens = u.context.tokens
  if (u.context.percent !== undefined) out.percent = u.context.percent
  if (u.cost !== undefined) out.usd = u.cost.usd
  return out
}

async function seed($: EngineInterface) {
  const u = toUsage(await $.session.usage())
  await update($, usage, () => u)
}

function tokens(n: number) {
  return n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

function span(ms: number) {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

function heat(percent: number, base: string) {
  return percent >= 80 ? THEME.bad : percent >= 60 ? THEME.warn : base
}

// claude-opus-5-5 → Opus 5.5, claude-haiku-4-5-20251001 → Haiku 4.5; anything else as given.
function modelName(id: string) {
  const m = /^(?:claude-)?([a-z]+)-(\d+)-(\d+)(?:-\d{8})?$/.exec(id)
  if (m === null || m[1] === undefined) return id
  return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`
}

function hueOf(type: string) {
  let h = 0
  for (const ch of type) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return HUES[h % HUES.length] ?? THEME.accent
}

// A bar in the style of rich's progress bars: a heavy rule, the done part in colour and a half
// cell at its edge, the rest dim.
function meter(fraction: number, width: number) {
  const halves = Math.round(Math.min(Math.max(fraction, 0), 1) * width * 2)
  const full = Math.floor(halves / 2)
  const isHalf = halves % 2 === 1
  let rest = width - full - (isHalf ? 1 : 0)
  let empty = ''
  if (rest > 0 && !isHalf && full > 0) {
    empty = '╺'
    rest -= 1
  }
  return { filled: '━'.repeat(full) + (isHalf ? '╸' : ''), empty: empty + '━'.repeat(rest) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await seed($)
    // Spinners turn while an agent runs; otherwise a redraw every 30 s keeps the clocks honest.
    let ticks = 0
    $.clock.every(TICK_MS, () => {
      ticks += 1
      void $.agent.list().then(list => {
        if (ticks % 120 === 0 || list.some(a => a.status === 'running')) void $.ui.invalidate('ui.render')
      })
    })
    return next(e)
  })

  // /clear, /resume and /branch empty $.state and fire no session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await seed($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const u = toUsage(e)
    await update($, usage, () => u)
    const percent = e.context.percent
    if (percent !== undefined && e.changed.includes('context')) {
      await update($, history, h => [...h, percent].slice(-HISTORY))
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    if (id !== undefined) {
      const row: AgentRow = {
        type: e.subagentType,
        model: result.model,
        description: e.description,
        startedAt: await $.clock.now(),
        calls: 0,
        isDone: false,
        endedAt: null,
      }
      await update($, agents, m => ({ ...m, [id]: row }))
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      await update($, agents, m => {
        const row = m[id]
        return row === undefined ? m : { ...m, [id]: { ...row, calls: row.calls + 1, isDone: false, endedAt: null } }
      })
    }
    return next(e)
  })

  // A subagent's run ends with its own turn.complete; a SendMessage that wakes it again
  // shows it again on its next tool call.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      await update($, agents, m => {
        const row = m[id]
        return row === undefined ? m : { ...m, [id]: { ...row, isDone: true, endedAt: now } }
      })
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const u = await read($, usage)
    const rows = await read($, agents)
    const past = await read($, history)
    const now = await $.clock.now()
    const running = (await $.agent.list()).filter(a => a.status === 'running' && rows[a.id]?.isDone !== true)
    const finished = Object.entries(rows).filter(([, r]) => r.isDone && r.endedAt !== null && now - r.endedAt < DONE_SHOWN_MS)
    if (u === null && running.length === 0 && finished.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const { types, cap, warnAt } = await capOf($)

    const cols = e.props.bodyColumns
    const isWide = cols >= 130
    const isMid = cols >= 90
    const ctxWidth = isWide ? 16 : isMid ? 10 : 0
    const limitWidth = isWide ? 8 : 0
    const sparkCount = isWide ? 12 : 0
    const callWidth = isWide ? 16 : isMid ? 8 : 0

    const bar = (fraction: number, width: number, color: string) => {
      const { filled, empty } = meter(fraction, width)
      return [<Text color={color}>{filled}</Text>, <Text color={THEME.dim}>{empty}</Text>, <Text>{' '}</Text>]
    }

    // ── the head: model, context, rate limits, cost
    const head = [
      <Box flexDirection="row">
        <Text color={THEME.accent}>{'✻ '}</Text>
        <Text bold>{modelName(await $.session.model())}</Text>
      </Box>,
    ]
    if (u !== null) {
      if (u.percent !== undefined && u.tokens !== undefined) {
        const color = heat(u.percent, THEME.ctx)
        const spark = []
        for (const p of past.slice(-sparkCount)) {
          spark.push(<Text color={heat(p, THEME.dim)}>{SPARK[Math.min(SPARK.length - 1, Math.floor((p / 100) * SPARK.length))] ?? ''}</Text>)
        }
        head.push(
          <Box flexDirection="row">
            <Text color={THEME.dim}>{'ctx '}</Text>
            {ctxWidth > 0 ? bar(u.percent / 100, ctxWidth, color) : []}
            <Text color={color} bold>{`${u.percent}%`}</Text>
            <Text color={THEME.dim}>{` ${tokens(u.tokens)}/${tokens(u.window)}`}</Text>
            {spark.length > 1 ? [<Text>{' '}</Text>, ...spark] : []}
          </Box>,
        )
      } else {
        head.push(<Text color={THEME.dim}>{`ctx ${tokens(u.window)}`}</Text>)
      }
      for (const l of u.limits) {
        const color = heat(l.percentUsed, THEME.limit)
        head.push(
          <Box flexDirection="row">
            <Text color={THEME.dim}>{`${LIMIT_LABEL[l.kind] ?? l.kind} `}</Text>
            {limitWidth > 0 ? bar(l.percentUsed / 100, limitWidth, color) : []}
            <Text color={color}>{`${l.percentUsed}%`}</Text>
            {l.resetsAt === undefined ? [] : <Text color={THEME.dim}>{` ↻${span(Date.parse(l.resetsAt) - now)}`}</Text>}
          </Box>,
        )
      }
      if (u.usd !== undefined) head.push(<Text color={THEME.dim}>{`$${u.usd.toFixed(2)}`}</Text>)
    }

    // ── one row per agent: running first, then the ones that finished in the last minute
    type Line = { id: string; row: AgentRow | undefined; type: string; description: string; isDone: boolean }
    const lines: Line[] = [
      ...running.map(a => ({ id: a.id, row: rows[a.id], type: rows[a.id]?.type ?? a.type, description: rows[a.id]?.description ?? a.description, isDone: false })),
      ...finished.map(([id, r]) => ({ id, row: r, type: r.type, description: r.description, isDone: true })),
    ]
    const typeWidth = Math.max(0, ...lines.map(l => l.type.length))
    const modelWidth = Math.max(0, ...lines.map(l => (l.row === undefined ? 0 : modelName(l.row.model).length)))
    const countWidth = callWidth + `${cap}/${cap}`.length + (callWidth > 0 ? 1 : 0)
    const frame = SPINNER[Math.floor(now / TICK_MS) % SPINNER.length] ?? '•'

    const agentLines = lines.map((l, i) => {
      const branch = i === lines.length - 1 ? '  └─ ' : '  ├─ '
      const hue = hueOf(l.type)
      const lead = [
        <Text color={THEME.dim}>{branch}</Text>,
        l.isDone ? <Text color={THEME.ok}>{'✓ '}</Text> : <Text color={hue}>{`${frame} `}</Text>,
        <Text color={l.isDone ? THEME.dim : hue} bold={!l.isDone}>{`${l.type.padEnd(typeWidth)}  `}</Text>,
      ]
      const row = l.row
      if (row === undefined) {
        // Started before this band loaded: no model or count to show, and none is made up.
        return (
          <Box key={l.id} flexDirection="row">
            {lead}
            <Text color={THEME.dim} wrap="truncate">{`${l.description}  (started before the band loaded)`}</Text>
          </Box>
        )
      }
      const isCapped = types.includes(row.type)
      const countColor = row.calls >= cap ? THEME.bad : row.calls >= warnAt ? THEME.warn : THEME.ok
      const count = isCapped
        ? [
            ...(callWidth > 0 && !l.isDone ? bar(row.calls / cap, callWidth, countColor) : []),
            <Text color={l.isDone ? THEME.dim : countColor}>{`${row.calls}/${cap}`.padEnd(l.isDone || callWidth === 0 ? countWidth : countWidth - callWidth - 1)}</Text>,
          ]
        : [<Text color={THEME.dim}>{`${row.calls} calls`.padEnd(countWidth)}</Text>]
      const elapsed = span((l.isDone && row.endedAt !== null ? row.endedAt : now) - row.startedAt)
      return (
        <Box key={l.id} flexDirection="row">
          {lead}
          <Text color={THEME.dim}>{`${modelName(row.model).padEnd(modelWidth)}  `}</Text>
          {count}
          <Text color={THEME.dim}>{`  ${elapsed.padStart(6)}  `}</Text>
          <Text color={l.isDone ? THEME.dim : undefined} wrap="truncate">{row.description}</Text>
        </Box>
      )
    })

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={3}>{head}</Box>
        {agentLines}
      </Box>
    )
  })
}
