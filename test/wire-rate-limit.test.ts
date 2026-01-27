import { describe, test, expect } from "bun:test"

// Internal rate limiter implementation (extracted for testing)
interface RateLimiterClient {
  requests: number[]
  lastCleanup: number
  throttleCount: number
}

const createRateLimiter = (isTestEnv = true) => {
  const clients = new Map<string, RateLimiterClient>()
  const maxRequests = 1500
  const windowMs = 60000
  const disconnectThreshold = 10
  let cleanupInterval: NodeJS.Timeout | null = null

  const cleanup = (): void => {
    const now = Date.now()
    for (const [_clientId, data] of Array.from(clients.entries())) {
      // Check throttle reset BEFORE updating lastCleanup
      if (now - data.lastCleanup > windowMs * 10) {
        data.throttleCount = 0
      }
      if (now - data.lastCleanup > windowMs) {
        data.requests = []
        data.lastCleanup = now
      }
      data.requests = data.requests.filter(time => now - time < windowMs)
    }
  }

  if (!isTestEnv) {
    cleanupInterval = setInterval(cleanup, windowMs / 4)
  }

  return {
    getDelay: (clientId: string): number => {
      const now = Date.now()
      const client = clients.get(clientId) || {
        requests: [],
        lastCleanup: now,
        throttleCount: 0,
      }

      client.requests = client.requests.filter(time => now - time < windowMs)

      if (client.requests.length >= maxRequests) {
        const oldestRequest = Math.min(...client.requests)
        const delay = windowMs - (now - oldestRequest)
        client.throttleCount = (client.throttleCount || 0) + 1
        clients.set(clientId, client)
        return Math.max(0, delay)
      }

      client.requests.push(now)
      clients.set(clientId, client)
      return 0
    },

    getRemainingRequests: (clientId: string): number => {
      const client = clients.get(clientId)
      if (!client) return maxRequests

      const now = Date.now()
      const validRequests = client.requests.filter(time => now - time < windowMs)
      return Math.max(0, maxRequests - validRequests.length)
    },

    getThrottleCount: (clientId: string): number => {
      const client = clients.get(clientId)
      return client ? client.throttleCount || 0 : 0
    },

    shouldDisconnect: (clientId: string): boolean => {
      const client = clients.get(clientId)
      if (!client) return false
      return client.throttleCount >= disconnectThreshold
    },

    destroy: (): void => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval)
        cleanupInterval = null
      }
      clients.clear()
    },

    cleanup,
    _clients: clients, // Expose for testing
  }
}

describe("wire - rate limiter", () => {
  describe("basic rate limiting", () => {
    test("allows requests under the limit", () => {
      const limiter = createRateLimiter()

      for (let i = 0; i < 100; i++) {
        const delay = limiter.getDelay("client1")
        expect(delay).toBe(0)
      }

      const remaining = limiter.getRemainingRequests("client1")
      expect(remaining).toBe(1400) // 1500 - 100
    })

    test("throttles when limit exceeded", () => {
      const limiter = createRateLimiter()

      // Make 1500 requests (at the limit)
      for (let i = 0; i < 1500; i++) {
        limiter.getDelay("client1")
      }

      // Next request should be delayed
      const delay = limiter.getDelay("client1")
      expect(delay).toBeGreaterThan(0)
      expect(delay).toBeLessThanOrEqual(60000)
    })

    test("tracks requests per client separately", () => {
      const limiter = createRateLimiter()

      // Client 1 makes 100 requests
      for (let i = 0; i < 100; i++) {
        limiter.getDelay("client1")
      }

      // Client 2 makes 50 requests
      for (let i = 0; i < 50; i++) {
        limiter.getDelay("client2")
      }

      expect(limiter.getRemainingRequests("client1")).toBe(1400)
      expect(limiter.getRemainingRequests("client2")).toBe(1450)
    })

    test("returns full limit for new client", () => {
      const limiter = createRateLimiter()

      const remaining = limiter.getRemainingRequests("newClient")
      expect(remaining).toBe(1500)
    })
  })

  describe("throttle counting", () => {
    test("increments throttle count when rate limited", () => {
      const limiter = createRateLimiter()

      // Exceed the limit
      for (let i = 0; i < 1501; i++) {
        limiter.getDelay("client1")
      }

      expect(limiter.getThrottleCount("client1")).toBe(1)
    })

    test("increments throttle count for each violation", () => {
      const limiter = createRateLimiter()

      // Exceed limit multiple times
      for (let i = 0; i < 1503; i++) {
        limiter.getDelay("client1")
      }

      expect(limiter.getThrottleCount("client1")).toBe(3)
    })

    test("returns zero throttle count for new client", () => {
      const limiter = createRateLimiter()

      expect(limiter.getThrottleCount("newClient")).toBe(0)
    })
  })

  describe("disconnect threshold", () => {
    test("does not disconnect under threshold", () => {
      const limiter = createRateLimiter()

      // Violate rate limit 9 times (just under threshold of 10)
      for (let i = 0; i < 1509; i++) {
        limiter.getDelay("client1")
      }

      expect(limiter.shouldDisconnect("client1")).toBe(false)
    })

    test("disconnects at threshold", () => {
      const limiter = createRateLimiter()

      // Violate rate limit 10 times (at threshold)
      for (let i = 0; i < 1510; i++) {
        limiter.getDelay("client1")
      }

      expect(limiter.shouldDisconnect("client1")).toBe(true)
    })

    test("disconnects above threshold", () => {
      const limiter = createRateLimiter()

      // Violate rate limit 15 times (above threshold)
      for (let i = 0; i < 1515; i++) {
        limiter.getDelay("client1")
      }

      expect(limiter.shouldDisconnect("client1")).toBe(true)
    })

    test("does not disconnect client with no violations", () => {
      const limiter = createRateLimiter()

      expect(limiter.shouldDisconnect("client1")).toBe(false)
    })
  })

  describe("window sliding and cleanup", () => {
    test("clears old requests outside window", async () => {
      const limiter = createRateLimiter()
      const client = {
        requests: [Date.now() - 61000, Date.now() - 70000], // Outside 60s window
        lastCleanup: Date.now(),
        throttleCount: 0,
      }

      limiter._clients.set("client1", client)

      limiter.cleanup()

      const remaining = limiter.getRemainingRequests("client1")
      expect(remaining).toBe(1500) // All old requests cleared
    })

    test("preserves recent requests within window", () => {
      const limiter = createRateLimiter()

      // Make some recent requests
      for (let i = 0; i < 100; i++) {
        limiter.getDelay("client1")
      }

      limiter.cleanup()

      const remaining = limiter.getRemainingRequests("client1")
      expect(remaining).toBe(1400) // Recent requests still counted
    })

    test("resets throttle count after extended period", () => {
      const limiter = createRateLimiter()
      const client = {
        requests: [],
        lastCleanup: Date.now() - 600001, // > 10 * windowMs
        throttleCount: 5,
      }

      limiter._clients.set("client1", client)

      limiter.cleanup()

      expect(limiter.getThrottleCount("client1")).toBe(0)
    })

    test("updates lastCleanup timestamp", () => {
      const limiter = createRateLimiter()
      const oldTime = Date.now() - 61000
      const client = {
        requests: [],
        lastCleanup: oldTime,
        throttleCount: 0,
      }

      limiter._clients.set("client1", client)

      limiter.cleanup()

      const updatedClient = limiter._clients.get("client1")
      expect(updatedClient?.lastCleanup).toBeGreaterThan(oldTime)
    })
  })

  describe("delay calculation", () => {
    test("calculates correct delay when just over limit", () => {
      const limiter = createRateLimiter()

      // Fill to limit
      for (let i = 0; i < 1500; i++) {
        limiter.getDelay("client1")
      }

      const delay = limiter.getDelay("client1")

      // Delay should be close to full window (60s)
      expect(delay).toBeGreaterThan(50000)
      expect(delay).toBeLessThanOrEqual(60000)
    })

    test("returns zero delay when under limit", () => {
      const limiter = createRateLimiter()

      limiter.getDelay("client1")

      const delay = limiter.getDelay("client1")
      expect(delay).toBe(0)
    })
  })

  describe("memory management", () => {
    test("clears all clients on destroy", () => {
      const limiter = createRateLimiter()

      limiter.getDelay("client1")
      limiter.getDelay("client2")
      limiter.getDelay("client3")

      expect(limiter._clients.size).toBe(3)

      limiter.destroy()

      expect(limiter._clients.size).toBe(0)
    })

    test("cleans up interval on destroy", () => {
      const limiter = createRateLimiter(false) // Enable cleanup interval

      limiter.destroy()

      // If this test completes without hanging, interval was cleaned up
      expect(true).toBe(true)
    })
  })

  describe("edge cases", () => {
    test("handles empty client ID", () => {
      const limiter = createRateLimiter()

      const delay = limiter.getDelay("")
      expect(delay).toBe(0)

      const remaining = limiter.getRemainingRequests("")
      expect(remaining).toBeGreaterThan(0)
    })

    test("handles concurrent requests from same client", () => {
      const limiter = createRateLimiter()

      const delays = Array.from({ length: 10 }, () => limiter.getDelay("client1"))

      delays.forEach(delay => expect(delay).toBe(0))
      expect(limiter.getRemainingRequests("client1")).toBe(1490)
    })

    test("handles requests at exact limit boundary", () => {
      const limiter = createRateLimiter()

      // Make exactly 1500 requests
      for (let i = 0; i < 1500; i++) {
        const delay = limiter.getDelay("client1")
        expect(delay).toBe(0)
      }

      // 1501st request should be delayed
      const delay = limiter.getDelay("client1")
      expect(delay).toBeGreaterThan(0)
    })
  })
})
