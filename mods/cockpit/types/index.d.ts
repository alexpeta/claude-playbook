// What the band draws. Session-local: kept in $.state, never written to $.store or disk;
// the call-cap hook's ledger (~/.claude/builder-calls.jsonl) is the durable record of a build.

// The figures $.session.usage() and session.measure report. One the engine does not have is
// left out, never zeroed, and the band leaves it out too.
export type Usage = {
  tokens?: number
  window: number
  percent?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  usd?: number
}

// One subagent this session started.
export type AgentRow = {
  type: string
  model: string
  description: string
  startedAt: number
  calls: number
  isDone: boolean
  endedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      usage: Usage | null
      agents: Record<string, AgentRow>
      // The context fill after each measurement that moved it, oldest first.
      history: number[]
    }
  }
}
