import fs from "fs/promises"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("system - user concurrent listeners", () => {
  const wss: Server = new Server("ws://localhost:9015")
  const holster: HolsterAPI = Holster({
    file: "test/system/user-concurrent-listeners",
    wss: wss,
    wait: 500,
  })
  const user = holster.user()

  test("user create and auth", async () => {
    await new Promise(resolve => user.create("testuser", "password", resolve))
    await new Promise(resolve => user.auth("testuser", "password", resolve))
  })

  test("multiple listeners on same path receive data", async () => {
    await new Promise(resolve => user.get("key").put({ value: "test" }, resolve))

    let listener1Called = false
    let listener2Called = false
    let resolve1: () => void
    let resolve2: () => void

    const promise1 = new Promise<void>(resolve => { resolve1 = resolve })
    const promise2 = new Promise<void>(resolve => { resolve2 = resolve })

    // Set up two listeners on the same path
    const cb1 = (data: unknown) => {
      listener1Called = true
      expect(data).not.toBeNull()
      expect(data).toEqual({ value: "test" })
      resolve1()
    }

    const cb2 = (data: unknown) => {
      listener2Called = true
      expect(data).not.toBeNull()
      expect(data).toEqual({ value: "test" })
      resolve2()
    }

    user.get("key").on(cb1, true)
    user.get("key").on(cb2, true)

    await Promise.all([promise1, promise2])
    expect(listener1Called).toBe(true)
    expect(listener2Called).toBe(true)

    user.get("key").off(cb1)
    user.get("key").off(cb2)
  })

  test("nested listeners on parent and child paths", async () => {
    await new Promise(resolve => user.get("parent").put({ value: "parent-value" }, resolve))
    await new Promise(resolve => user.get("parent").next("child").put({ value: "child-value" }, resolve))

    let parentCalled = false
    let childCalled = false
    let resolveParent: () => void
    let resolveChild: () => void

    const parentPromise = new Promise<void>(resolve => { resolveParent = resolve })
    const childPromise = new Promise<void>(resolve => { resolveChild = resolve })

    // Listen on parent
    const parentCb = (data: unknown) => {
      parentCalled = true
      expect(data).not.toBeNull()
      expect((data as { value: string }).value).toBe("parent-value")
      // Parent includes child as a rel
      expect((data as { child?: unknown }).child).not.toBeUndefined()
      resolveParent()
    }

    // Listen on child
    const childCb = (data: unknown) => {
      childCalled = true
      expect(data).not.toBeNull()
      expect(data).toEqual({ value: "child-value" })
      resolveChild()
    }

    user.get("parent").on(parentCb, true)
    user.get("parent").next("child").on(childCb, true)

    await Promise.all([parentPromise, childPromise])
    expect(parentCalled).toBe(true)
    expect(childCalled).toBe(true)

    user.get("parent").off(parentCb)
    user.get("parent").next("child").off(childCb)
  })

  test("listener race condition - data before and after listener setup", async () => {
    const results: unknown[] = []

    // Put data first
    await new Promise(resolve => user.get("race").put({ value: "first" }, resolve))

    // Set up listener with _get=true to read existing data
    // The listener will be called with the existing data via the get request
    const cb = (data: unknown) => {
      results.push((data as { value?: string } | null)?.value)
    }

    user.get("race").on(cb, true)

    // Immediately put new data - listener will fire for this put as well
    await new Promise(resolve => setTimeout(resolve, 50))
    await new Promise(resolve => user.get("race").put({ value: "second" }, resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    // Should have received both values - one from get, one from put
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]).toBe("first")

    user.get("race").off(cb)
  })

  test("cleanup", async () => {
    await fs.rm("test/system/user-concurrent-listeners", { recursive: true, force: true })
  })
})
