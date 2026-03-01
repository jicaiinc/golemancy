import { describe, it, expect } from 'vitest'
import { parseErrorMessage } from './parse-error'

describe('parseErrorMessage', () => {
  it('extracts error from status-prefixed JSON body', () => {
    const error = new Error('422: {"error":"API key for provider \\"openai\\" is not set.","code":"API_KEY_MISSING"}')
    expect(parseErrorMessage(error)).toBe('API key for provider "openai" is not set.')
  })

  it('extracts error from raw JSON body (AI SDK v6 format)', () => {
    const error = new Error('{"error":"API key for provider \\"openai\\" is not set.","code":"API_KEY_MISSING"}')
    expect(parseErrorMessage(error)).toBe('API key for provider "openai" is not set.')
  })

  it('converts Internal Server Error to friendly message', () => {
    const error = new Error('500: {"error":"Internal Server Error"}')
    expect(parseErrorMessage(error)).toBe('generic')
  })

  it('converts raw Internal Server Error JSON to friendly message', () => {
    const error = new Error('{"error":"Internal Server Error"}')
    expect(parseErrorMessage(error)).toBe('generic')
  })

  it('passes through plain messages', () => {
    const error = new Error('Network error')
    expect(parseErrorMessage(error)).toBe('Network error')
  })

  it('passes through malformed JSON', () => {
    const error = new Error('500: not json')
    expect(parseErrorMessage(error)).toBe('500: not json')
  })

  it('treats empty error field as generic', () => {
    const error = new Error('422: {"error":""}')
    expect(parseErrorMessage(error)).toBe('generic')
  })

  it('translates UPPER_SNAKE_CASE server error codes via i18n fallback', () => {
    const error = new Error('404: {"error":"AGENT_NOT_FOUND"}')
    // i18next mock returns last key segment as fallback
    expect(parseErrorMessage(error)).toBe('AGENT_NOT_FOUND')
  })

  it('translates status-prefixed server error codes', () => {
    const error = new Error('409: {"error":"SKILL_IN_USE","agents":[]}')
    expect(parseErrorMessage(error)).toBe('SKILL_IN_USE')
  })
})
