import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-04T20:00:00Z')

function band(bodyColumns: number) {
  return {
    plugin: 'cockpit',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  } as const
}
const WIDE = band(150)
const NARROW = band(70)

// The engine beneath the band: one session on Opus, the usage figures below, and the agents
// in `running` reported as running.
function world(on: On, running: Set<string>) {
  mock.env(on, {})
  const clock = mock.clock(on, { now: NOW })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', async () => ({
    value: {
      startedAt: NOW,
      context: { tokens: 124_000, window: 200_000, percent: 62 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 41, resetsAt: '2026-10-04T22:10:00Z' }],
      cost: { usd: 3.1 },
    },
  }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('agent.list', async () => ({
    value: [...running].map(id => ({ id, description: id, type: 'builder', status: 'running' })),
  }))
  on('agent.spawn', async (_$, e) => ({ model: 'claude-opus-5-5', agentId: e.description }))
  on('tool.call', async () => ({ result: { type: 'text', file: { filePath: '/x', content: '', numLines: 0, startLine: 1, totalLines: 0 } } }))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.invalidate', async () => ({ value: undefined }))
  return clock
}

async function start($: Engine) {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

async function spawn($: Engine, subagentType: string, description: string) {
  await $.agent.spawn({
    tool_use_id: `tu-${description}`,
    prompt: 'build it',
    description,
    subagentType,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
}

async function calls($: Engine, agentId: string, n: number) {
  // A model loop's call carries its agentId; the engine's own call arguments leave it out of the type.
  const call = { tool: 'Read', file_path: '/x', agentId } as { tool: 'Read'; file_path: string }
  for (let i = 0; i < n; i++) await $.tool.call(call)
}

test('the head shows the model, a context meter, the 5h window with its reset, and cost', async ($, on) => {
  world(on, new Set())
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...WIDE, surface })
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '62%' }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: '124k/200k' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '41%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '↻2h10m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '$3.10' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '━' })).toBeDefined()
    await ui.unmount()
  }
})

test('a narrow band keeps the numbers and drops the meters', async ($, on) => {
  world(on, new Set())
  await start($)
  const ui = await $.ui.mount({ ...NARROW, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '62%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '━' })).toBeUndefined()
})

test('the sparkline draws each measured context fill on one scale', async ($, on) => {
  world(on, new Set())
  await start($)
  for (const percent of [10, 50, 90]) {
    await $.session.measure({ context: { tokens: percent * 2000, window: 200_000, percent }, rateLimits: [], changed: ['context'] })
  }
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '▁' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▅' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: '█' }))?.props.color).toBe('error')
})

test("a builder's count turns from success to warning at 360 and to error at the cap", async ($, on) => {
  world(on, new Set(['slice-a']))
  await start($)
  await spawn($, 'builder', 'slice-a')
  await calls($, 'slice-a', 359)
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: '359/400' }))?.props.color).toBe('success')
  await calls($, 'slice-a', 1)
  await ui.redraw()
  expect((await ui.find({ type: 'Text', text: '360/400' }))?.props.color).toBe('warning')
  await calls($, 'slice-a', 40)
  await ui.redraw()
  expect((await ui.find({ type: 'Text', text: '400/400' }))?.props.color).toBe('error')
  expect(await ui.find({ type: 'Text', text: 'slice-a' })).toBeDefined()
})

test('an agent of another type shows a plain count', async ($, on) => {
  world(on, new Set(['scan']))
  await start($)
  await spawn($, 'Explore', 'scan')
  await calls($, 'scan', 3)
  const ui = await $.ui.mount({ ...WIDE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '3 calls' })).toBeDefined()
})

test('a finished agent shows a tick for a minute, then leaves the band', async ($, on) => {
  const clock = world(on, new Set(['slice-a']))
  await start($)
  await spawn($, 'builder', 'slice-a')
  await calls($, 'slice-a', 5)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'slice-a', reason: 'answer' })
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'slice-a' })).toBeDefined()
  await clock.advance(61_000)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: 'slice-a' })).toBeUndefined()
})

test('an agent the band never saw start is named without a model or a count', async ($, on) => {
  world(on, new Set(['old']))
  await start($)
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /old {2}\(started before the band loaded\)/ })).toBeDefined()
})
