import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../src/holster"
import type { HolsterAPI } from "../src/holster"

describe("holster.user.off", () => {
  const wss: Server = new Server("ws://localhost:9011")
  const holster: HolsterAPI = Holster({
    file: "test/holster.user.off",
    wss: wss,
    maxAge: 100,
    wait: 500,
  })
  const user = holster.user()

  test("user create", async () => {
    await new Promise<void>((resolve, reject) => {
      user.create("alice", "password", err => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  test("user auth", async () => {
    await new Promise<void>((resolve, reject) => {
      user.auth("alice", "password", err => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  test("calling off without get callback null", async () => {
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    user.off(callback)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toBe(null)
  })

  test("off with cb for property then update - no event", async () => {
    const updates: unknown[] = []
    const cb = (data: unknown) => {
      updates.push(data)
    }
    user.get("key").on(cb)
    user.get("key").off(cb)

    await new Promise(resolve => user.get("key").put("value", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    // Callback should not have been called since it was removed
    expect(updates).toHaveLength(0)
  })

  test("off no cb for property then update - no event", async () => {
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    user.get("key1").on(callback)

    await new Promise(resolve => setTimeout(resolve, 10))
    user.get("key1").off()

    await new Promise(resolve => user.get("key1").put("value1", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    // Callback should not have been called since all listeners were removed
    expect(updates).toHaveLength(0)
  })

  test("cleanup", async () => {
    await new Promise<void>((resolve, reject) => {
      fs.rm("test/holster.user.off", { recursive: true, force: true }, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  })
})
