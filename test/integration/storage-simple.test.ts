/**
 * Simple integration tests - Local storage without networking
 * Tests file-based persistence and in-memory operations
 */

import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"

describe("Integration - Local storage (no relay)", () => {
  test("writes and reads data locally", async () => {
    const db = Holster({ file: "test/integration/local-simple", port: 9800 })

    // Write data
    await new Promise<void>(resolve => {
      db.get("user1").put({ name: "Alice", age: 30 }, () => resolve())
    })

    // Read it back immediately
    const data = await new Promise(resolve => {
      db.get("user1").on(resolve)
    })

    expect(data).toMatchObject({ name: "Alice", age: 30 })
  })

  test("persists data across instance restarts", async () => {
    const file = "test/integration/persist-simple"

    // First instance - write data
    const db1 = Holster({ file, port: 9801 })
    await new Promise<void>(resolve => {
      db1.get("counter").put({ value: 42 }, () => resolve())
    })
    await new Promise(resolve => setTimeout(resolve, 100))

    // Second instance - read persisted data
    const db2 = Holster({ file, port: 9802 })
    await new Promise(resolve => setTimeout(resolve, 200)) // Wait for disk read

    const data = await new Promise(resolve => {
      db2.get("counter").on(resolve)
    })

    expect(data).toMatchObject({ value: 42 })
  })

  test("handles multiple fields on same soul", async () => {
    const db = Holster({ file: "test/integration/multifield", port: 9803 })

    // Write multiple fields
    await new Promise<void>(resolve => {
      db.get("profile").put({ name: "Bob" }, () => {
        db.get("profile").put({ age: 25 }, () => {
          db.get("profile").put({ city: "NYC" }, () => resolve())
        })
      })
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Read merged data
    const data = await new Promise(resolve => {
      db.get("profile").on(resolve)
    })

    expect(data).toMatchObject({ name: "Bob", age: 25, city: "NYC" })
  })

  test("handles rapid sequential writes", async () => {
    const db = Holster({ file: "test/integration/rapid", port: 9804 })

    // Write 50 values rapidly
    for (let i = 0; i < 50; i++) {
      await new Promise<void>(resolve => {
        db.get(`item${i}`).put({ value: i }, () => resolve())
      })
    }

    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify a few random values
    const checks = await Promise.all([
      new Promise(resolve => db.get("item0").on(resolve)),
      new Promise(resolve => db.get("item25").on(resolve)),
      new Promise(resolve => db.get("item49").on(resolve)),
    ])

    expect(checks[0]).toMatchObject({ value: 0 })
    expect(checks[1]).toMatchObject({ value: 25 })
    expect(checks[2]).toMatchObject({ value: 49 })
  })

  test("handles graph references", async () => {
    const db = Holster({ file: "test/integration/refs", port: 9805 })

    // Create referenced nodes
    await new Promise<void>(resolve => {
      db.get("author123").put({ name: "Charlie" }, () => {
        db.get("post456").put(
          {
            title: "Hello World",
            author: { "#": "author123" },
          },
          () => resolve()
        )
      })
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Read post and verify reference
    const post = await new Promise(resolve => {
      db.get("post456").on(resolve)
    })

    expect(post).toMatchObject({
      title: "Hello World",
      author: { "#": "author123" },
    })

    // Read author
    const author = await new Promise(resolve => {
      db.get("author123").on(resolve)
    })

    expect(author).toMatchObject({ name: "Charlie" })
  })

  test("on() callback receives updates", async () => {
    const db = Holster({ file: "test/integration/updates", port: 9806 })

    const updates: any[] = []

    // Set up listener first
    db.get("live").on(data => {
      console.log("[TEST] Received update:", data)
      updates.push(data)
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Write initial value
    await new Promise<void>(resolve => {
      db.get("live").put({ count: 1 }, () => resolve())
    })

    await new Promise(resolve => setTimeout(resolve, 200))

    // Write update
    await new Promise<void>(resolve => {
      db.get("live").put({ count: 2 }, () => resolve())
    })

    await new Promise(resolve => setTimeout(resolve, 200))

    // Should have received at least the updates
    expect(updates.length).toBeGreaterThan(0)
    const lastUpdate = updates[updates.length - 1]
    expect(lastUpdate).toMatchObject({ count: 2 })
  })

  test("handles null and undefined values", async () => {
    const db = Holster({ file: "test/integration/nulls", port: 9807 })

    // Write then delete (set to null)
    await new Promise<void>(resolve => {
      db.get("temp").put({ data: "exists" }, () => {
        db.get("temp").put({ data: null }, () => resolve())
      })
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    const data = await new Promise(resolve => {
      db.get("temp").on(resolve)
    })

    // Null should delete the property
    expect((data as any).data).toBe(null)
  })

  test("large dataset storage", async () => {
    const db = Holster({ file: "test/integration/large", port: 9808 })

    // Write 200 records
    const writes = []
    for (let i = 0; i < 200; i++) {
      writes.push(
        new Promise<void>(resolve => {
          db.get(`rec${i}`).put(
            {
              id: i,
              data: `value${i}`,
              meta: { created: Date.now() }
            },
            () => resolve()
          )
        })
      )
    }

    await Promise.all(writes)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Spot check a few records
    const samples = await Promise.all([
      new Promise(resolve => db.get("rec0").on(resolve)),
      new Promise(resolve => db.get("rec100").on(resolve)),
      new Promise(resolve => db.get("rec199").on(resolve)),
    ])

    expect(samples[0]).toMatchObject({ id: 0, data: "value0" })
    expect(samples[1]).toMatchObject({ id: 100, data: "value100" })
    expect(samples[2]).toMatchObject({ id: 199, data: "value199" })
  })
})
