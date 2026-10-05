import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-05T20:00:00Z')
const MAIN = '/w/app'
const TREE = '/w/app/.claude/worktrees/b1'
const REPO = '/w/app/.git'
const GIT_DIR: Record<string, string> = { [MAIN]: '/w/app/.git', [TREE]: '/w/app/.git/worktrees/b1' }
const TOOL = 'mcp__gate__run'

// still-water's scripts/gate.sh, as it prints.
const GREEN = ['== gate: typecheck\n', 'tsc ok\n', '== gate: lint\n', 'eslint ok\n', '== gate: test\n', '12 passed\n', '== gate: all stages passed\n']
const RED = ['== gate: typecheck\n', 'tsc ok\n', '== gate: lint\n', 'src/a.ts:3 no-unused-vars\n', '== gate: lint failed (exit 1); later stages not run\n']

type World = {
  files: Map<string, string>
  sha: Record<string, string>
  dirty: Set<string>
  out: string[]
  code: number
  exitFile: string | null
  hold: Promise<void> | null
  spawned: { argv: readonly string[]; cwd?: string; env?: Record<string, string> }[]
  ledger: string[]
  status: (string | undefined)[]
  toasts: string[]
}

function topOf(dir: string) {
  if (dir === TREE || dir.startsWith(`${TREE}/`)) return TREE
  if (dir === MAIN || dir.startsWith(`${MAIN}/`)) return MAIN
  return null
}

// The engine beneath the mod: two checkouts of one repo (the main one and a builder's worktree),
// git answered from `w`, and a gate whose output, exit code and exit file the test sets.
function world(on: On, env: Record<string, string> = { HOME: '/h' }, store: Record<string, unknown> = {}) {
  const w: World = {
    files: new Map(), sha: { [MAIN]: 'aaa1111', [TREE]: 'bbb2222' }, dirty: new Set(),
    out: GREEN, code: 0, exitFile: 'exit=0\n', hold: null, spawned: [], ledger: [], status: [], toasts: [],
  }
  mock.env(on, env)
  mock.store(on, store)
  const clock = mock.clock(on, { now: NOW })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: MAIN }))
  on('agent.list', async () => ({ value: [{ id: 'a1', type: 'builder', description: 'slice', status: 'running' }] }))
  on('tool.register', async (_$, e) => ({ value: { tool: `mcp__gate__${e.name}` } }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.status', async (_$, e) => {
    w.status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', async (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', async () => ({ value: undefined }))
  on('fs.read', async (_$, e) => {
    const text = w.files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.write', async (_$, e) => {
    w.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('process.run', async (_$, e) => {
    const [cmd, ...args] = e.argv
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout: `${stdout}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const fail = { value: { exitCode: 128, stdout: '', stderr: 'fatal', isStdoutTruncated: false, isStderrTruncated: false } }
    if (cmd === 'sh') {
      w.ledger.push(e.init?.stdin ?? '')
      return ok('')
    }
    const top = topOf(args[1] ?? '')
    if (cmd !== 'git' || top === null) return fail
    const rest = args.slice(2).join(' ')
    if (rest === 'rev-parse --show-toplevel') return ok(top)
    if (rest === 'rev-parse --path-format=absolute --git-common-dir') return ok(REPO)
    if (rest === 'rev-parse --absolute-git-dir') return ok(GIT_DIR[top] ?? '')
    if (rest === 'rev-parse --short HEAD') return ok(w.sha[top] ?? '')
    if (rest === 'branch --show-current') return ok(top === MAIN ? 'main' : 'feat/b1')
    if (rest === 'status --porcelain') return ok(w.dirty.has(top) ? ' M src/a.ts' : '')
    return fail
  })
  on('process.spawn', async function* (_$, e) {
    w.spawned.push({ argv: e.argv, cwd: e.cwd, env: e.env })
    const [first, ...rest] = w.out
    if (first !== undefined) yield { stream: 'stdout' as const, text: first }
    if (w.hold !== null) await w.hold
    for (const text of rest) yield { stream: 'stdout' as const, text }
    const exitPath = e.env?.GATE_EXIT_FILE
    if (exitPath !== undefined && w.exitFile !== null) w.files.set(exitPath, w.exitFile)
    return { value: { code: w.code, signal: null } }
  })
  // Beneath every plugin, the tools themselves: Bash runs (a shell gate writes its exit file).
  on('tool.call', async (_$, e) => {
    if (e.tool === 'Bash') {
      const named = /GATE_EXIT_FILE=(\S+)/.exec(e.command)?.[1]
      if (named !== undefined && w.exitFile !== null) w.files.set(named, w.exitFile)
      return { result: { stdout: '', stderr: '', interrupted: false } }
    }
    return { result: { type: 'update', filePath: '/x', content: '', structuredPatch: [], originalFile: null } }
  })
  return { w, clock }
}

async function start($: Engine) {
  await $.session.start({ cwd: MAIN, surface: 'terminal', isInteractive: true })
}

// A model loop's call carries its agentId; the engine's own call arguments leave it out of the type.
function bash($: Engine, command: string, agentId?: string) {
  return $.tool.call({ tool: 'Bash', command, ...(agentId === undefined ? {} : { agentId }) } as { tool: 'Bash'; command: string })
}

function gate($: Engine, checkout: string, agentId?: string) {
  return $.tool.call({ tool: TOOL, checkout, ...(agentId === undefined ? {} : { agentId }) } as unknown as { tool: 'Bash'; command: string })
}

function textOf(res: unknown) {
  const r = res as { result?: unknown; text?: string; deny?: string }
  return typeof r.result === 'string' ? r.result : (r.deny ?? r.text ?? '')
}

function refused(res: unknown) {
  const r = res as { isError?: boolean; deny?: string }
  return r.isError === true || r.deny !== undefined
}

test('a green gate: the verdict from the exit code and file, its stages, the status line and the ledger', async ($, on) => {
  const { w } = world(on)
  await start($)
  const res = await gate($, TREE, 'a1')
  const text = textOf(res)
  expect(text).toContain('exit=0 · 3 stages passed')
  expect(text).toContain('feat/b1 @ bbb2222, tree clean')
  expect(text).toContain('typecheck 0s · lint 0s · test 0s')
  expect(text).toContain('log: /w/app/.git/worktrees/b1/gate.log')
  expect(w.spawned[0]?.argv).toEqual(['pnpm', 'gate'])
  expect(w.spawned[0]?.cwd).toBe(TREE)
  expect(w.spawned[0]?.env).toEqual({ GATE_EXIT_FILE: '/w/app/.git/worktrees/b1/gate.exit' })
  expect(w.status.at(-1)).toBe('gate ✓ b1 @ bbb2222 · 0s')
  expect(w.toasts.at(-1)).toBe('gate ✓ b1 @ bbb2222 in 0s')
  const line = JSON.parse(w.ledger[0] ?? '{}') as Record<string, unknown>
  expect(line.exit).toBe(0)
  expect(line.agent).toBe('builder')
  expect(line.via).toBe('tool')
  expect(line.stages).toEqual([{ name: 'typecheck', ms: 0 }, { name: 'lint', ms: 0 }, { name: 'test', ms: 0 }])
})

test("a red gate names the failing stage and returns that stage's lines, not the earlier ones", async ($, on) => {
  const { w } = world(on)
  await start($)
  w.out = RED
  w.code = 1
  w.exitFile = 'exit=1\n'
  const text = textOf(await gate($, TREE))
  expect(text).toContain('exit=1 · failed at lint (stage 2 of ?)')
  expect(text).toContain('src/a.ts:3 no-unused-vars')
  expect(text).not.toContain('tsc ok')
  expect(w.status.at(-1)).toBe('gate ✗ lint · b1 @ bbb2222')
})

test('an exit file that disagrees with the exit code is no verdict, and never green', async ($, on) => {
  const { w } = world(on)
  await start($)
  await gate($, TREE) // arms the repo
  w.exitFile = 'exit=2\n'
  const text = textOf(await gate($, TREE))
  expect(text).toContain('exit=? · the gate exited 0 but its exit file says exit=2')
  const push = await bash($, `cd ${TREE} && git push -u origin feat/b1`)
  expect(refused(push)).toBe(true)
  expect(textOf(push)).toContain('could not be read')
})

test('a gate that writes no exit file is no verdict', async ($, on) => {
  const { w } = world(on)
  await start($)
  w.exitFile = null
  expect(textOf(await gate($, TREE))).toContain('exit=? · the gate exited 0 but wrote nothing to GATE_EXIT_FILE')
})

test('a gate piped, or run with no exit file, or chained to a push, is refused', async ($, on) => {
  world(on)
  await start($)
  for (const command of [
    `cd ${TREE} && GATE_EXIT_FILE=/s/g.exit pnpm gate 2>&1 | tail -20`,
    `cd ${TREE} && pnpm run gate > /s/g.log 2>&1`,
    `cd ${TREE} && GATE_EXIT_FILE=/s/g.exit pnpm gate > /s/g.log 2>&1; git push`,
  ]) {
    expect(refused(await bash($, command))).toBe(true)
  }
  const ok = await bash($, `cd ${TREE} && GATE_EXIT_FILE=/s/g.exit pnpm gate > /s/g.log 2>&1 || cat /s/g.exit`)
  expect(refused(ok)).toBe(false)
})

test('a gate run through Bash is recorded from its exit file, and arms the push guard', async ($, on) => {
  const { w } = world(on)
  await start($)
  await bash($, `cd ${TREE} && GATE_EXIT_FILE=/s/g.exit pnpm gate > /s/g.log 2>&1; cat /s/g.exit`, 'a1')
  expect(w.status.at(-1)).toBe('gate ✓ b1 @ bbb2222 · 0s')
  expect((JSON.parse(w.ledger[0] ?? '{}') as { via?: string }).via).toBe('bash')
  expect(refused(await bash($, `cd ${MAIN} && git push`))).toBe(true)
})

test('the push guard: an unarmed repo pushes; armed, it wants a green gate in that checkout', async ($, on) => {
  const { w } = world(on)
  await start($)
  expect(refused(await bash($, `cd ${TREE} && git push`))).toBe(false)
  await gate($, MAIN)
  const none = await bash($, `cd ${TREE} && git push`)
  expect(refused(none)).toBe(true)
  expect(textOf(none)).toContain(`no gate has run in ${TREE}`)
  await gate($, TREE)
  const same = (await bash($, `cd ${TREE} && git push`)) as { context?: readonly string[] }
  expect(refused(same)).toBe(false)
  expect(same.context ?? []).toEqual([])
  w.sha[TREE] = 'ccc3333'
  const moved = (await bash($, `cd ${TREE} && git push`)) as { context?: readonly string[] }
  expect(refused(moved)).toBe(false)
  expect(moved.context?.[0]).toContain('was at bbb2222; this push is ccc3333')
  expect(refused(await bash($, `cd ${TREE} && git push --delete origin old`))).toBe(false)
})

test("a subagent's push with no path is let through with a note that it was not checked", async ($, on) => {
  world(on)
  await start($)
  await gate($, MAIN)
  const res = (await bash($, 'git push -u origin feat/b1', 'a1')) as { context?: readonly string[] }
  expect(refused(res)).toBe(false)
  expect(res.context?.[0]).toContain('could not tell which checkout')
})

test('while a gate runs, its checkout refuses edits and tree moves; other checkouts do not', async ($, on) => {
  const { w, clock } = world(on)
  await start($)
  let release = () => {}
  w.hold = new Promise(r => {
    release = r
  })
  const running = gate($, TREE, 'a1')
  await clock.advance(0)
  expect(w.status.at(-1)).toMatch(/^gate . typecheck 1 · 0s · b1 · builder$/)
  expect(refused(await $.tool.call({ tool: 'Edit', file_path: `${TREE}/src/a.ts`, old_string: 'a', new_string: 'b' }))).toBe(true)
  expect(refused(await $.tool.call({ tool: 'Write', file_path: `${TREE}/src/new/b.ts`, content: '' }))).toBe(true)
  expect(refused(await bash($, `cd ${TREE} && git stash`))).toBe(true)
  expect(refused(await $.tool.call({ tool: 'Edit', file_path: `${MAIN}/src/a.ts`, old_string: 'a', new_string: 'b' }))).toBe(false)
  expect(refused(await gate($, TREE))).toBe(true)
  release()
  await running
  expect(refused(await $.tool.call({ tool: 'Edit', file_path: `${TREE}/src/a.ts`, old_string: 'a', new_string: 'b' }))).toBe(false)
})

test('the stage count comes from the last green run, and the status line goes stale when HEAD moves', async ($, on) => {
  const { w, clock } = world(on)
  await start($)
  await gate($, TREE)
  let release = () => {}
  w.hold = new Promise(r => {
    release = r
  })
  const running = gate($, TREE)
  await clock.advance(0)
  expect(w.status.at(-1)).toMatch(/^gate . typecheck 1\/3 · 0s · b1$/)
  release()
  await running
  w.sha[TREE] = 'ddd4444'
  await clock.advance(10_000)
  expect(w.status.at(-1)).toBe('gate ✓ b1 @ bbb2222 · 0s · stale')
})

test('the gate command and exit variable come from the environment', async ($, on) => {
  const { w } = world(on, { HOME: '/h', CLAUDE_GATE_COMMAND: 'make check', CLAUDE_GATE_EXIT_VAR: '' })
  await start($)
  w.out = ['ok\n']
  w.code = 3
  const text = textOf(await gate($, TREE))
  expect(w.spawned[0]?.argv).toEqual(['make', 'check'])
  expect(w.spawned[0]?.env).toEqual({})
  expect(text).toContain('exit=3 · failed')
  expect(refused(await bash($, `cd ${TREE} && make check | tail`))).toBe(true)
  expect(refused(await bash($, `cd ${TREE} && make check > /s/log 2>&1`))).toBe(false)
})
