import fs from "fs/promises"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("system - listener before data", () => {
  const wss: Server = new Server("ws://localhost:9107")
  const holster: HolsterAPI = Holster({ file: "test/system/listener-before-data", wss: wss })

  test("listener set up before data exists receives data when populated", async () => {
    const results: unknown[] = []

    // Set up listener first - this is the browser Display.js pattern
    const cb = (data: unknown) => {
      results.push(data as { value: string } | null)
    }

    holster.get("testkey").on(cb)

    // Give listener time to set up
    await new Promise(resolve => setTimeout(resolve, 100))
    await new Promise(resolve => holster.get("testkey").put({ value: "test" }, resolve))

    // Give listener time to fire
    await new Promise(resolve => setTimeout(resolve, 200))

    // With the new behavior, listener fires after data is stored
    // Should have received the test value from the put
    const nonNull = results.filter(r => r !== null)
    expect(nonNull.length).toBeGreaterThanOrEqual(1)
    expect((nonNull[0] as unknown as { value: string }).value).toBe("test")

    holster.get("testkey").off(cb)
  })

  test("cleanup", async () => {
    await fs.rm("test/system/listener-before-data", { recursive: true, force: true })
  })
})
