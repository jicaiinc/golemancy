import { describe, it, expect } from 'vitest'
import { parseErrorMessage } from './parse-error'

describe('parseErrorMessage', () => {
  it('prefers body.code over body.error for i18n lookup', () => {
    const error = new Error('422: {"error":"API key for provider \\"openai\\" is not set.","code":"API_KEY_MISSING"}')
    expect(parseErrorMessage(error)).toEqual({ message: 'API_KEY_MISSING', code: 'API_KEY_MISSING' })
  })

  it('prefers body.code from raw JSON body (AI SDK v6 format)', () => {
    const error = new Error('{"error":"API key for provider \\"openai\\" is not set.","code":"API_KEY_MISSING"}')
    expect(parseErrorMessage(error)).toEqual({ message: 'API_KEY_MISSING', code: 'API_KEY_MISSING' })
  })

  it('converts Internal Server Error to friendly message', () => {
    const error = new Error('500: {"error":"Internal Server Error"}')
    expect(parseErrorMessage(error)).toEqual({ message: 'generic' })
  })

  it('converts raw Internal Server Error JSON to friendly message', () => {
    const error = new Error('{"error":"Internal Server Error"}')
    expect(parseErrorMessage(error)).toEqual({ message: 'generic' })
  })

  it('passes through plain messages', () => {
    const error = new Error('Network error')
    expect(parseErrorMessage(error)).toEqual({ message: 'Network error' })
  })

  it('passes through malformed JSON', () => {
    const error = new Error('500: not json')
    expect(parseErrorMessage(error)).toEqual({ message: '500: not json' })
  })

  it('treats empty error field as generic', () => {
    const error = new Error('422: {"error":""}')
    expect(parseErrorMessage(error)).toEqual({ message: 'generic' })
  })

  it('translates UPPER_SNAKE_CASE server error codes via i18n fallback', () => {
    const error = new Error('404: {"error":"AGENT_NOT_FOUND"}')
    // i18next mock returns last key segment as fallback
    expect(parseErrorMessage(error)).toEqual({ message: 'AGENT_NOT_FOUND', code: 'AGENT_NOT_FOUND' })
  })

  it('translates status-prefixed server error codes', () => {
    const error = new Error('409: {"error":"SKILL_IN_USE","agents":[]}')
    expect(parseErrorMessage(error)).toEqual({ message: 'SKILL_IN_USE', code: 'SKILL_IN_USE' })
  })

  it('returns human-readable message when no code and error is not UPPER_SNAKE', () => {
    const error = new Error('422: {"error":"Something went wrong with the API"}')
    expect(parseErrorMessage(error)).toEqual({ message: 'Something went wrong with the API' })
  })

  it('returns code for ConfigurationError with PROVIDER_NOT_CONFIGURED', () => {
    const error = new Error('422: {"error":"Provider \\"xxx\\" is not configured.","code":"PROVIDER_NOT_CONFIGURED"}')
    expect(parseErrorMessage(error)).toEqual({ message: 'PROVIDER_NOT_CONFIGURED', code: 'PROVIDER_NOT_CONFIGURED' })
  })

  it('returns code for NO_PROVIDER_CONFIGURED', () => {
    const error = new Error('422: {"error":"No model configured.","code":"NO_PROVIDER_CONFIGURED"}')
    expect(parseErrorMessage(error)).toEqual({ message: 'NO_PROVIDER_CONFIGURED', code: 'NO_PROVIDER_CONFIGURED' })
  })
})
