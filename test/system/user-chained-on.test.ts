import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("system - user chained get with on", () => {
  const wss: Server = new Server("ws://localhost:9012")
  const holster: HolsterAPI = Holster({
    file: "test/system/user-chained-on",
    wss: wss,
    wait: 500,
  })
  const user = holster.user()

  test("user create and auth", async () => {
    await new Promise<void>((resolve, reject) => {
      user.create("testuser", "password", err => {
        if (err) reject(err)
        else {
          user.auth("testuser", "password", err => {
            if (err) reject(err)
            else resolve()
          })
        }
      })
    })
  })

  test("on listener fires with null when no data exists", async () => {
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    user.get("key").on(callback, true)

    await new Promise(resolve => setTimeout(resolve, 50))

    // This is the actual behavior - on fires with null for non-existent keys
    expect(updates).toHaveLength(1)
    expect(updates[0]).toBe(null)
    user.get("key").off(callback)
  })

  test("put then on listener receives data", async () => {
    // Put data first
    await new Promise(resolve => user.get("key2").put({ value: "test" }, resolve))

    // Then set up listener - should get the existing data
    await new Promise(resolve => setTimeout(resolve, 50))

    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    user.get("key2").on(callback, true)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(updates.length).toBeGreaterThan(0)
    expect(updates[0]).not.toBe(null)
    expect(updates[0]).toEqual({ value: "test" })
    user.get("key2").off(callback)
  })

  test("cleanup", async () => {
    await new Promise<void>((resolve, reject) => {
      fs.rm(
        "test/system/user-chained-on",
        { recursive: true, force: true },
        err => {
          if (err) reject(err)
          else resolve()
        },
      )
    })
  })
})
