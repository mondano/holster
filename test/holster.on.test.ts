import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../src/holster"
import type { HolsterAPI } from "../src/holster"

describe("holster.on", () => {
  const wss: Server = new Server("ws://localhost:9003")
  const holster: HolsterAPI = Holster({ file: "test/holster.on", wss: wss, maxAge: 100 })

  test("calling on without get callback null", async () => {
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.on(callback)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toBe(null)
    holster.off(callback)
  })

  test("on for property on root then update - event", async () => {
    // Listener is now called for initial put and updates
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.get("key").on(callback)

    await new Promise(resolve => holster.get("key").put("value", resolve))
    await new Promise(resolve => holster.get("key").put("update", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(updates).toHaveLength(2)
    expect(updates[0]).toBe("value")
    expect(updates[1]).toBe("update")
    holster.get("key").off(callback)
  })

  test("on for property then update - two listeners", async () => {
    const updates1: unknown[] = []
    const callback1 = (data: unknown) => {
      updates1.push(data)
    }
    holster.get("two").on(callback1)

    const updates2: unknown[] = []
    const callback2 = (data: unknown) => {
      updates2.push(data)
    }
    holster.get("two").on(callback2)

    await new Promise(resolve => holster.get("two").put("value", resolve))
    await new Promise(resolve => holster.get("two").put("update", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(updates1).toHaveLength(2)
    expect(updates1[1]).toBe("update")
    expect(updates2).toHaveLength(2)
    expect(updates2[1]).toBe("update")
    holster.get("two").off(callback1)
    holster.get("two").off(callback2)
  })

  test("on for different property on root - no event", async () => {
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.get("key1").on(callback)

    await new Promise(resolve => setTimeout(resolve, 100))
    await new Promise(resolve => holster.get("key2").put("value2", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    // key1 listener should not have been called
    expect(updates).toHaveLength(0)
    holster.get("key1").off(callback)
  })

  test("on for property on root two updates - two events", async () => {
    await new Promise(resolve => holster.get("key3").put("value3", resolve))

    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.get("key3").on(callback)

    await new Promise(resolve => holster.get("key3").put("update1", resolve))
    await new Promise(resolve => setTimeout(resolve, 200))
    await new Promise(resolve => holster.get("key3").put("update2", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(updates).toHaveLength(2)
    expect(updates[0]).toBe("update1")
    expect(updates[1]).toBe("update2")
    holster.get("key3").off(callback)
  })

  test("on for properties on root in for loop", async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => holster.get("for" + i).put(i, resolve))
    }

    // Need to wait until after all initial puts are done to set on listeners.
    await new Promise(resolve => setTimeout(resolve, 500))

    const callbacks: Array<(data: unknown) => void> = []
    const updates: unknown[][] = []
    for (let i = 0; i < 5; i++) {
      const idx = i // Capture value
      updates[idx] = []
      const callback = (data: unknown) => {
        updates[idx].push(data)
      }
      callbacks[idx] = callback
      holster.get("for" + idx).on(callback)
    }

    await new Promise(resolve => setTimeout(resolve, 100))

    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => holster.get("for" + i).put("update" + i, resolve))
    }

    await new Promise(resolve => setTimeout(resolve, 200))

    for (let i = 0; i < 5; i++) {
      expect(updates[i]).toHaveLength(1)
      expect(updates[i][0]).toBe("update" + i)
      holster.get("for" + i).off(callbacks[i])
    }
  })

  test("on with get flag set - data returned", async () => {
    await new Promise(resolve => holster.get("key4").put("value4", resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.get("key4").on(callback, true)

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toBe("value4")
    holster.get("key4").off(callback)
  })

  test("chained next before on", async () => {
    // The node needs to exist before it can be listend to for updates.
    await new Promise(resolve =>
      holster
        .get("hello")
        .next("world!")
        .put("ok", resolve)
    )

    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster
      .get("hello")
      .next("world!")
      .on(callback)

    await new Promise(resolve => setTimeout(resolve, 10))
    await new Promise(resolve =>
      holster
        .get("hello")
        .next("world!")
        .put("update", resolve)
    )
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toBe("update")
    holster.get("hello").next("world!").off(callback)
  })

  test("on and put object on root in graph format", async () => {
    const plain = {
      key: "plain value",
      number: 42,
    }
    await new Promise(resolve => holster.get("plain").put(plain, resolve))

    const update = {
      key: "update",
      number: 42,
    }
    const updates: unknown[] = []
    const callback = (data: unknown) => {
      updates.push(data)
    }
    holster.get("plain").on(callback)

    await new Promise(resolve => setTimeout(resolve, 10))
    await new Promise(resolve => holster.get("plain").put(update, resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual(update)
    holster.get("plain").off(callback)
  })

  test("on and put nested object", async () => {
    const nested = {
      key: "nested key",
      child: {
        has: "child key",
      },
    }
    // The node needs to exist before it can be listend to for updates.
    await new Promise(resolve => holster.get("nested").put(nested, resolve))

    const update = {
      key: "nested update",
      child: {
        has: "child update",
      },
    }

    const parentUpdates: unknown[] = []
    const parentCallback = (data: unknown) => {
      parentUpdates.push(data)
    }
    holster.get("nested").on(parentCallback)

    const childUpdates: unknown[] = []
    const childCallback = (data: unknown) => {
      childUpdates.push(data)
    }
    holster
      .get("nested")
      .next("child")
      .on(childCallback)

    await new Promise(resolve => setTimeout(resolve, 10))
    await new Promise(resolve => holster.get("nested").put(update, resolve))
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(parentUpdates).toHaveLength(1)
    expect(parentUpdates[0]).toEqual(update)
    expect(childUpdates).toHaveLength(1)
    expect(childUpdates[0]).toEqual(update.child)
    holster.get("nested").off(parentCallback)
    holster.get("nested").next("child").off(childCallback)
  })

  test("cleanup", async () => {
    await new Promise<void>((resolve, reject) => {
      fs.rm("test/holster.on", { recursive: true, force: true }, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  })
})
