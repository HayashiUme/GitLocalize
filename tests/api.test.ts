import { describe, expect, it, vi } from 'vitest'
import { createClient } from '../src/github/api'
import type { ClientTransport } from '../src/github/api'

function transportThat(...outcomes: ('fail' | 'limited' | 'ok')[]): ClientTransport {
  let call = 0
  return {
    async fetch() {
      const outcome = outcomes[Math.min(call, outcomes.length - 1)]
      call += 1
      if (outcome === 'fail') throw new TypeError('Failed to fetch')
      if (outcome === 'limited') {
        return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '4102444800' },
        })
      }
      return new Response(JSON.stringify({ login: 'mock-user' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  }
}

describe('request retry and error mapping', () => {
  it('rides out a transient network failure on a GET', async () => {
    const client = createClient('token', { transport: transportThat('fail', 'ok') })
    const user = await client.get<{ login: string }>('/user')
    expect(user.login).toBe('mock-user')
  })

  it('gives up after three attempts when the network keeps failing', async () => {
    const spy = vi.fn()
    const client = createClient('token', {
      transport: {
        async fetch(...args: Parameters<ClientTransport['fetch']>) {
          spy()
          void args
          throw new TypeError('Failed to fetch')
        },
      },
    })
    await expect(client.get('/user')).rejects.toMatchObject({ code: 'network' })
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-GET requests', async () => {
    const spy = vi.fn()
    const client = createClient('token', {
      transport: {
        async fetch(...args: Parameters<ClientTransport['fetch']>) {
          spy()
          void args
          throw new TypeError('Failed to fetch')
        },
      },
    })
    await expect(client.post('/x', {})).rejects.toMatchObject({ code: 'network' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('reports the rate-limit quota and reset time instead of retrying', async () => {
    const client = createClient('token', { transport: transportThat('limited') })
    const error = await client.get('/user').catch((caught: { code: string; detail: string }) => caught)
    expect(error.code).toBe('rate-limited')
    expect(error.detail).toContain('60 requests/hour')
  })
})
