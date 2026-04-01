import { describe, expect, it } from 'vitest'
import { applyScenarioToConfig, DEFAULT_CONFIG, DEFAULT_SCENARIOS, mergeConfigWithDefaults } from '../constants'

describe('scenario helpers', () => {
  it('applies scenario settings to config', () => {
    const scenario = DEFAULT_SCENARIOS.find(s => s.id === 'relax')!
    const next = applyScenarioToConfig(DEFAULT_CONFIG, scenario)

    expect(next.activeScenarioId).toBe('relax')
    expect(next.sensitivity).toBe(scenario.sensitivity)
    expect(next.analysisMode).toBe('lite')
    expect(next.promptHint).toBe(scenario.promptHint)
    expect(next.enabledTags).toEqual(scenario.enabledTags)
  })

  it('merges missing scenario fields from defaults', () => {
    const merged = mergeConfigWithDefaults({
      activeScenarioId: 'focus',
      scenarios: [{ id: 'focus', name: '专注', description: 'x', sensitivity: 80, enabledTags: ['clickbait'], analysisMode: 'lite', filterMode: 'vanish', promptHint: 'test', builtin: true }],
    })

    expect(merged.scenarios.some(s => s.id === 'relax')).toBe(true)
    expect(merged.scenarios.some(s => s.id === 'calm')).toBe(true)
  })
})
