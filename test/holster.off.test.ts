import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../src/holster"
import type { HolsterAPI } from "../src/holster"

describe("holster.off", () => {
  const wss: Server = new Server("ws://localhost:1234")
  const holster: HolsterAPI = Holster({ file: "test/holster.off", wss: wss, maxAge: 100 })

  test("calling off without get callback null", async () => {
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.off(callback)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toBe(null)
  })

  test("off with cb for property on root then update - no event", async () => {
    const updates: unknown[] = []
    const cb = (data: unknown) => {
      updates.push(data)
    }
    holster.get("key").on(cb)
    holster.get("key").off(cb)

    await new Promise(resolve => holster.get("key").put("value", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    // Callback should not have been called since it was removed
    expect(updates).toHaveLength(0)
  })

  test("off no cb for property on root then update - no event", async () => {
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.get("key1").on(callback)

    await new Promise(resolve => setTimeout(resolve, 10))
    holster.get("key1").off()

    await new Promise(resolve => holster.get("key1").put("value1", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    // Callback should not have been called since all listeners were removed
    expect(updates).toHaveLength(0)
  })

  test("cleanup", async () => {
    await new Promise<void>((resolve, reject) => {
      fs.rm("test/holster.off", { recursive: true, force: true }, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  })
})
