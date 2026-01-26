import fs from "fs/promises"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("system - user listener before data", () => {
  const wss: Server = new Server("ws://localhost:9017")
  const holster: HolsterAPI = Holster({
    file: "test/system/user-listener-before-data",
    wss: wss,
    wait: 500,
  })
  const user = holster.user()

  test("user create and auth", async () => {
    await new Promise(resolve => user.create("testuser", "password", resolve))
    await new Promise(resolve => user.auth("testuser", "password", resolve))
  })

  test("listener set up before data exists receives data when populated", async () => {
    const results: unknown[] = []

    // Set up listener first before data exists
    const cb = (data: unknown) => {
      results.push(data as { value: string } | null)
    }

    user.get("testkey").on(cb)

    // Give listener time to set up
    await new Promise(resolve => setTimeout(resolve, 100))
    await new Promise(resolve => user.get("testkey").put({ value: "test" }, resolve))

    // Give listener time to fire
    await new Promise(resolve => setTimeout(resolve, 200))

    // With the new behavior, listener fires after data is stored
    // Should have received the test value from the put
    const nonNull = results.filter(r => r !== null)
    expect(nonNull.length).toBeGreaterThanOrEqual(1)
    expect(nonNull[0]).toEqual({ value: "test" })

    user.get("testkey").off(cb)
  })

  test("cleanup", async () => {
    await fs.rm("test/system/user-listener-before-data", { recursive: true, force: true })
  })
})
