import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

// The gate's verdict is its exit code, held to the exit file it writes, never the prose it prints
// (the playbook's templates/CLAUDE.md, "Capture exit codes directly"). Configured per repo through
// the environment, as the call cap is, so a project's settings `env` can set it:
//   CLAUDE_GATE_COMMAND   the gate, run by argv with no shell (default `pnpm gate`)
//   CLAUDE_GATE_EXIT_VAR  the variable the gate writes `exit=<code>` to (default `GATE_EXIT_FILE`;
//                         empty: the gate writes none, and its exit code alone is the verdict)
// A gate that prints `== gate: <stage>` lines (still-water's scripts/gate.sh) gets per-stage
// progress and times; any other gate is one stage.

const TOOL = 'mcp__gate__run'
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const TICK_MS = 250
const STALE_EVERY = 40 // ticks: the shown checkout's HEAD and tree are read every 10 s
const TAIL_LINES = 60
const MARK = /^== gate: (.+)$/
const FAILED = /^(\S+) failed \(exit (\d+)\)/
const PUSH = /\bgit\s+(?:-C\s+\S+\s+)?push\b/
const PUSH_EXEMPT = /\s(?:--dry-run|-n|--delete|-d)(?=\s|$)/
const MUTATES = /\bgit\s+(?:-C\s+\S+\s+)?(?:switch|checkout|stash|rebase|reset|merge|pull|commit|cherry-pick|am|restore|clean)\b/

type Checkout = { top: string; repo: string; gitDir: string; sha: string; branch: string; isClean: boolean }

// One gate run. `exit` stays null while it runs, and when the verdict could not be read honestly
// (`reason` says why): a null exit is never green.
type Run = Checkout & {
  via: 'tool' | 'command' | 'bash'
  agent: string | null
  startedAt: number
  endedAt: number | null
  stage: string | null
  stages: { name: string; ms: number }[]
  total: number | null
  exit: number | null
  failedStage: string | null
  reason: string | null
  tail: string
  logFile: string | null
}

// Session-local, never persisted: the gates running now (a reload kills their children with the
// module) and the run the status line shows. The durable record is $.store (`last:<checkout>`,
// `armed:<repo>`, `stages:<repo>`) and the ledger, ~/.claude/gate-runs.jsonl.
const running = new Map<string, Run>()
let shown: Run | null = null
let isShownStale = false
let tick = 0

async function configOf($: EngineInterface) {
  const command = ((await $.env.get('CLAUDE_GATE_COMMAND')) ?? 'pnpm gate').trim()
  const exitVar = ((await $.env.get('CLAUDE_GATE_EXIT_VAR')) ?? 'GATE_EXIT_FILE').trim()
  return { command, argv: command.split(/\s+/), exitVar }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// `pnpm gate` matches `pnpm run gate` too.
function gatePattern(command: string) {
  const [head = '', ...rest] = command.split(/\s+/)
  const tail = rest.length === 0 ? '' : `\\s+(?:run\\s+)?${rest.map(esc).join('\\s+')}`
  return new RegExp(`(?:^|[\\s;&|(])${esc(head)}${tail}(?=$|[\\s;&|)])`)
}

// Piped: a `|` (not `||`) after the gate, before the next `;`, `&` or newline. `2>&1` is a
// redirection, not a list, so it is taken out first.
function isPiped(command: string, gate: RegExp) {
  const plain = command.replace(/\d*>&\d+/g, '')
  const m = gate.exec(plain)
  if (m === null) return false
  const segment = /^[^;&\n]*/.exec(plain.slice(m.index + m[0].length))?.[0] ?? ''
  return segment.replace(/\|\|/g, '').includes('|')
}

// The directory a shell line names for itself: a `cd <abs>` or `git -C <abs>`. A relative path
// needs the shell's own cwd, which no event carries, so it names nothing.
function dirOf(command: string) {
  const m = /(?:^\s*|[;&|(]\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/.exec(command) ?? /\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/.exec(command)
  const path = m?.[1]?.replace(/^["']|["']$/g, '')
  return path !== undefined && path.startsWith('/') ? path : null
}

// Where a Bash call runs: the directory it names, else the session's for the main loop. A
// subagent's shell may sit in a worktree no event reports, so without a named path it is unknown.
async function dirFor($: EngineInterface, command: string, agentId: string | undefined) {
  return dirOf(command) ?? (agentId === undefined ? await $.session.cwd() : null)
}

async function git($: EngineInterface, dir: string, ...args: string[]) {
  try {
    const r = await $.process.run(['git', '-C', dir, ...args])
    return r.exitCode === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
}

async function checkoutAt($: EngineInterface, dir: string): Promise<Checkout | null> {
  const top = await git($, dir, 'rev-parse', '--show-toplevel')
  if (top === null || top === '') return null
  const [repo, gitDir, sha, branch, status] = await Promise.all([
    git($, top, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
    git($, top, 'rev-parse', '--absolute-git-dir'),
    git($, top, 'rev-parse', '--short', 'HEAD'),
    git($, top, 'branch', '--show-current'),
    git($, top, 'status', '--porcelain'),
  ])
  if (repo === null || gitDir === null || sha === null || status === null) return null
  return { top, repo, gitDir, sha, branch: branch === null || branch === '' ? 'detached' : branch, isClean: status === '' }
}

// The checkout a file lies in, from its nearest existing folder (a Write may create the rest).
async function topOf($: EngineInterface, path: string) {
  let dir = path
  while (dir.includes('/') && dir !== '/') {
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
    const top = await git($, dir, 'rev-parse', '--show-toplevel')
    if (top !== null && top !== '') return top
  }
  return null
}

async function agentLabel($: EngineInterface, agentId: string | undefined) {
  if (agentId === undefined) return null
  const found = (await $.agent.list()).find(a => a.id === agentId)
  return found?.type ?? 'agent'
}

function span(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

function basename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function begin(co: Checkout, via: Run['via'], agent: string | null, startedAt: number, total: number | null): Run {
  const run: Run = {
    ...co, via, agent, startedAt, total,
    endedAt: null, stage: null, stages: [], exit: null, failedStage: null, reason: null, tail: '', logFile: null,
  }
  running.set(co.top, run)
  shown = run
  isShownStale = false
  return run
}

async function finish($: EngineInterface, run: Run) {
  run.endedAt = await $.clock.now()
  run.stage = null
  running.delete(run.top)
  const { tail: _tail, ...kept } = run
  await $.store.set(`last:${run.top}`, kept)
  if (run.exit === 0) {
    await $.store.set(`armed:${run.repo}`, true)
    if (run.stages.length > 0) await $.store.set(`stages:${run.repo}`, run.stages.length)
  }
  await ledger($, run)
  await showStatus($)
  $.ui.toast(headline(run))
}

async function ledger($: EngineInterface, run: Run) {
  const home = await $.env.get('HOME')
  if (home === undefined) {
    $.ui.log('gate: HOME is unset, so this run was not written to ~/.claude/gate-runs.jsonl', { to: 'debug' })
    return
  }
  const line = JSON.stringify({
    at: new Date(run.startedAt).toISOString(),
    repo: run.repo, checkout: run.top, branch: run.branch, sha: run.sha, isClean: run.isClean,
    via: run.via, agent: run.agent, exit: run.exit, failedStage: run.failedStage, reason: run.reason,
    ms: (run.endedAt ?? run.startedAt) - run.startedAt, stages: run.stages,
  })
  const path = `${home}/.claude/gate-runs.jsonl`
  await $.process.run(['sh', '-c', 'cat >> "$0"', path], { stdin: `${line}\n` }).catch(() => {
    $.ui.log(`gate: could not append to ${path}`, { to: 'debug' })
  })
}

// Runs the gate in a checkout the mod owns end to end: no shell, no pipe, the verdict from the exit
// code and the exit file.
async function runGate($: EngineInterface, co: Checkout, via: Run['via'], agent: string | null) {
  const cfg = await configOf($)
  const total = await $.store.get(`stages:${co.repo}`)
  const run = begin(co, via, agent, await $.clock.now(), typeof total === 'number' ? total : null)
  run.logFile = `${co.gitDir}/gate.log`
  const exitFile = `${co.gitDir}/gate.exit`
  await showStatus($)
  let log = ''
  let partial = ''
  let stageAt = run.startedAt
  let code: number | null = null
  const close = (now: number) => {
    if (run.stage !== null) run.stages.push({ name: run.stage, ms: now - stageAt })
    run.stage = null
    stageAt = now
  }
  try {
    if (cfg.exitVar !== '') await $.fs.write(exitFile, '') // a previous run's verdict is never read
    const child = $.process.spawn({ argv: cfg.argv, cwd: co.top, env: cfg.exitVar === '' ? {} : { [cfg.exitVar]: exitFile } })
    for await (const chunk of child) {
      log += chunk.text
      if (chunk.stream !== 'stdout') continue
      const lines = (partial + chunk.text).split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) {
        const said = MARK.exec(line)?.[1]
        if (said === undefined) continue
        const now = await $.clock.now()
        const failed = FAILED.exec(said)
        if (failed !== null) {
          run.failedStage = failed[1] ?? run.stage
          close(now)
        } else if (said === 'all stages passed') {
          close(now)
        } else {
          close(now)
          run.stage = said
          await showStatus($)
        }
      }
    }
    const ended = await child.result
    code = ended.code
    if (code === null) run.reason = `the gate was ended by ${ended.signal ?? 'a signal'}`
  } catch (err) {
    run.reason = `\`${cfg.command}\` could not run in ${co.top}: ${err instanceof Error ? err.message : String(err)}`
  }
  if (run.reason === null && code !== null) {
    if (cfg.exitVar === '') {
      run.exit = code
    } else {
      const said = /^exit=(\d+)/m.exec(await $.fs.read(exitFile).catch(() => ''))?.[1]
      if (said === undefined) run.reason = `the gate exited ${code} but wrote nothing to ${cfg.exitVar}`
      else if ((said === '0') !== (code === 0)) run.reason = `the gate exited ${code} but its exit file says exit=${said}`
      else run.exit = Number(said)
    }
  }
  if (run.exit !== 0 && run.failedStage === null) run.failedStage = run.stage // ended mid-stage
  close(await $.clock.now())
  if (run.exit !== 0) run.tail = tailOf(log, run.failedStage)
  await $.fs.write(run.logFile, log).catch(() => {
    run.logFile = null
  })
  await finish($, run)
  return run
}

function tailOf(log: string, stage: string | null) {
  const at = stage === null ? -1 : log.lastIndexOf(`== gate: ${stage}\n`)
  return (at < 0 ? log : log.slice(at)).trimEnd().split('\n').slice(-TAIL_LINES).join('\n')
}

function headline(run: Run) {
  const where = `${basename(run.top)} @ ${run.sha}`
  const took = span((run.endedAt ?? run.startedAt) - run.startedAt)
  if (run.exit === 0) return `gate ✓ ${where} in ${took}`
  if (run.exit === null) return `gate ? ${where}: ${run.reason ?? 'no verdict'}`
  return `gate ✗ ${run.failedStage ?? `exit=${run.exit}`} · ${where} in ${took}`
}

// What the model reads: the verdict first, then the times, the log's path, and for a red gate the
// failing stage's last lines.
function verdict(run: Run) {
  const took = span((run.endedAt ?? run.startedAt) - run.startedAt)
  const tree = run.isClean ? 'tree clean' : 'with uncommitted changes'
  const at = `${run.branch} @ ${run.sha}, ${tree}`
  const n = run.stages.length
  const head = run.exit === null
    ? `exit=? · ${run.reason ?? 'no verdict'} · ${took} · ${at}`
    : run.exit === 0
      ? `exit=0 · ${n === 0 ? 'passed' : `${n} stages passed`} · ${took} · ${at}`
      : `exit=${run.exit} · ${run.failedStage === null ? 'failed' : `failed at ${run.failedStage} (stage ${n} of ${run.total ?? '?'})`} · ${took} · ${at}`
  const lines = [head]
  if (n > 0) lines.push(run.stages.map(s => `${s.name} ${span(s.ms)}`).join(' · '))
  if (run.logFile !== null) lines.push(`log: ${run.logFile}`)
  if (run.tail !== '') lines.push('', `--- the last lines of ${run.failedStage ?? 'the log'} ---`, run.tail)
  return lines.join('\n')
}

function statusOf(run: Run, now: number) {
  const name = basename(run.top)
  const who = run.agent === null ? '' : ` · ${run.agent}`
  if (run.endedAt === null) {
    const spin = SPINNER[tick % SPINNER.length]
    const stage = run.via === 'bash' ? 'running (bash)' : run.stage ?? 'starting'
    const of = run.stage === null || run.via === 'bash' ? '' : ` ${run.stages.length + 1}${run.total === null ? '' : `/${run.total}`}`
    return `gate ${spin} ${stage}${of} · ${span(now - run.startedAt)} · ${name}${who}`
  }
  const sha = `${run.sha}${run.isClean ? '' : '+'}`
  const stale = isShownStale ? ' · stale' : ''
  if (run.exit === 0) return `gate ✓ ${name} @ ${sha} · ${span(run.endedAt - run.startedAt)}${stale}`
  if (run.exit === null) return `gate ? ${name} @ ${sha} · no verdict${stale}`
  return `gate ✗ ${run.failedStage ?? `exit=${run.exit}`} · ${name} @ ${sha}${stale}`
}

async function showStatus($: EngineInterface) {
  const latest = [...running.values()].at(-1) ?? shown
  if (latest === null) return
  $.ui.status(statusOf(latest, await $.clock.now()))
}

// HEAD moved, or a tree gated clean is dirty now: the verdict no longer speaks for the checkout.
async function checkStale($: EngineInterface) {
  if (shown === null || running.size > 0) return
  const co = await checkoutAt($, shown.top)
  const isStale = co === null || co.sha !== shown.sha || (shown.isClean && !co.isClean)
  if (isStale !== isShownStale) {
    isShownStale = isStale
    await showStatus($)
  }
}

function withNote(res: ToolCallResult, note: string): ToolCallResult {
  return res.deny !== undefined || res.isError === true ? res : { ...res, context: [...(res.context ?? []), note] }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const cfg = await configOf($)
    await $.tool.register({
      name: 'run',
      description: `Runs the CI gate (\`${cfg.command}\`) in one checkout and returns its verdict, read from the gate's exit code${cfg.exitVar === '' ? '' : ` and the exit file it writes (${cfg.exitVar})`}, never from the prose it prints. Use it instead of running the gate through Bash. It blocks until the gate ends, which takes minutes. It returns exit=<code>, the stages and their times, and for a red gate the failing stage's last ${TAIL_LINES} lines; the whole log stays on disk at the path it names. Edits to the checkout are refused while it runs.`,
      inputSchema: {
        type: 'object',
        properties: { checkout: { type: 'string', description: "Absolute path of the checkout to gate: your worktree's root, or the main checkout." } },
        required: ['checkout'],
      },
    })
    await $.command.register({
      name: 'gate',
      description: 'Run the CI gate in this checkout (or the path given) with no Claude turn; the verdict lands in the status line and the conversation.',
    })
    // The session's own checkout shows its last verdict from the start, stale or not.
    const home = await checkoutAt($, e.cwd)
    const last = home === null ? undefined : await $.store.get(`last:${home.top}`)
    if (last !== undefined && last !== null && typeof last === 'object') {
      shown = { ...(last as Run), tail: '' }
      await checkStale($)
      await showStatus($)
    }
    $.clock.every(TICK_MS, () => {
      tick += 1
      if (running.size > 0) void showStatus($)
      else if (tick % STALE_EVERY === 0) void checkStale($)
    })
    return started
  })

  // A pattern, not the name: the tool names a machine declares are its own connected MCP tools.
  on('tool.call', { tool: /^mcp__gate__run$/ }, async ($, e) => {
    const checkout = (e as unknown as { checkout?: unknown }).checkout
    if (typeof checkout !== 'string' || !checkout.startsWith('/')) {
      return { deny: "gate: name the checkout by its absolute path (your worktree's root, or the main checkout)." }
    }
    const co = await checkoutAt($, checkout)
    if (co === null) return { deny: `gate: ${checkout} is not a git checkout.` }
    const busy = running.get(co.top)
    if (busy !== undefined) return { deny: `gate: a gate already runs in ${co.top} (${busy.stage ?? 'starting'}); wait for its verdict.` }
    const run = await runGate($, co, 'tool', await agentLabel($, e.agentId))
    return { result: verdict(run) }
  })

  on('command.run', { command: 'gate' }, async ($, e) => {
    const dir = e.args.trim() === '' ? await $.session.cwd() : e.args.trim()
    const co = await checkoutAt($, dir)
    if (co === null) return { text: `gate: ${dir} is not a git checkout.` }
    const busy = running.get(co.top)
    if (busy !== undefined) return { text: `gate: a gate already runs in ${co.top} (${busy.stage ?? 'starting'}).` }
    // The run outlives this answer (the API's own pattern for a child that runs on after its
    // hook): the person keeps the prompt, and the verdict reaches the model as a note.
    void (async () => {
      const run = await runGate($, co, 'command', null)
      await $.session
        .append({ message: { type: 'user', content: [{ type: 'text', text: `The gate the person ran with /gate has ended.\n${verdict(run)}` }] } })
        .catch(() => $.ui.log('gate: the verdict could not be added to the conversation', { to: 'debug' }))
    })()
    return { text: `gate: started in ${co.top} @ ${co.sha}. The status line follows it; the verdict lands in the conversation when it ends.` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = e.command
    const cfg = await configOf($)
    const gate = gatePattern(cfg.command)
    if (gate.test(command)) {
      const how = `Call ${TOOL} with the checkout's absolute path, or run \`${cfg.exitVar === '' ? '' : `${cfg.exitVar}=<scratch>/gate.exit `}${cfg.command} > <scratch>/gate.log 2>&1\` and read the ${cfg.exitVar === '' ? 'exit code' : 'exit file'}.`
      if (isPiped(command, gate)) return { deny: `gate: \`${cfg.command}\` piped into another command reports that command's exit status, not the gate's. ${how}` }
      if (cfg.exitVar !== '' && !new RegExp(`(?:^|[\\s;&(])${esc(cfg.exitVar)}=\\S`).test(command)) {
        return { deny: `gate: \`${cfg.command}\` without ${cfg.exitVar} leaves no verdict but its prose. ${how}` }
      }
      if (PUSH.test(command)) return { deny: 'gate: a gate and a push in one command push whatever the gate says. Gate, read the verdict, then push.' }
      if (e.run_in_background === true) {
        return withNote(await next(e), `gate: a gate run in the background is not recorded, so the push guard will not count it. Call ${TOOL} instead.`)
      }
      const dir = await dirFor($, command, e.agentId)
      const co = dir === null ? null : await checkoutAt($, dir)
      if (co === null || dir === null) {
        return withNote(await next(e), `gate: could not tell which checkout this gate ran in, so it is not recorded and the push guard will not count it. Start the command with \`cd <checkout> &&\`, or call ${TOOL}.`)
      }
      if (running.has(co.top)) return { deny: `gate: a gate already runs in ${co.top}; wait for its verdict.` }
      const run = begin(co, 'bash', await agentLabel($, e.agentId), await $.clock.now(), null)
      await showStatus($)
      const res = await next(e)
      if (cfg.exitVar === '') {
        run.reason = 'a gate run through Bash with no exit file leaves no verdict the mod can read'
      } else {
        const named = new RegExp(`${esc(cfg.exitVar)}=("[^"]+"|'[^']+'|\\S+)`).exec(command)?.[1]?.replace(/^["']|["']$/g, '') ?? ''
        const file = named.startsWith('/') ? named : `${dir}/${named}`
        const said = /^exit=(\d+)/m.exec(await $.fs.read(file).catch(() => ''))?.[1]
        if (said === undefined) run.reason = `no exit=<code> in ${file}`
        else run.exit = Number(said)
      }
      await finish($, run)
      return res
    }

    if (PUSH.test(command) && !PUSH_EXEMPT.test(command)) {
      const dir = await dirFor($, command, e.agentId)
      if (dir === null) {
        return withNote(await next(e), 'gate: could not tell which checkout this push is from, so its gate was not checked. Start the command with `cd <checkout> &&` to have it checked.')
      }
      const co = await checkoutAt($, dir)
      // Only a repo that has passed a gate under this mod is guarded: one with no gate never is.
      if (co === null || (await $.store.get(`armed:${co.repo}`)) !== true) return next(e)
      if (running.has(co.top)) return { deny: `gate: a gate is running in ${co.top}; push once its verdict is green.` }
      const last = (await $.store.get(`last:${co.top}`)) as Run | undefined
      if (last === undefined || last === null) {
        return { deny: `gate: no gate has run in ${co.top}. Call ${TOOL} with that path (or the person runs /gate), then push.` }
      }
      if (last.exit !== 0) {
        const why = last.exit === null ? `could not be read (${last.reason ?? 'no verdict'})` : `failed at ${last.failedStage ?? `exit=${last.exit}`}`
        return { deny: `gate: the last gate in ${co.top} ${why} at ${last.sha}. Fix it, gate again, then push.` }
      }
      const res = await next(e)
      if (last.sha !== co.sha || !last.isClean) {
        return withNote(res, `gate: the last green gate in ${co.top} was at ${last.sha}${last.isClean ? '' : ' with uncommitted changes'}; this push is ${co.sha}. CI checks the difference.`)
      }
      return res
    }

    if (running.size > 0 && MUTATES.test(command)) {
      const dir = await dirFor($, command, e.agentId)
      const top = dir === null ? null : await git($, dir, 'rev-parse', '--show-toplevel')
      const busy = top === null ? undefined : running.get(top)
      if (busy !== undefined) return { deny: `gate: a gate is running in ${busy.top}; changing its tree now changes what it checks. Wait for its verdict.` }
    }
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    if (running.size === 0) return next(e)
    const path = 'notebook_path' in e ? e.notebook_path : e.file_path
    const top = await topOf($, path)
    const busy = top === null ? undefined : running.get(top)
    if (busy === undefined) return next(e)
    const now = await $.clock.now()
    return { deny: `gate: a gate is running in ${busy.top} (${busy.stage ?? 'running'}, ${span(now - busy.startedAt)}); a change now alters what it checks. Wait for its verdict, then edit.` }
  })
}
