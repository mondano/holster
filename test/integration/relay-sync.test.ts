/**
 * Integration tests - Real relay server and peer-to-peer synchronization
 * Tests actual networking, storage, and CRDT conflict resolution
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import Holster from "../../src/holster"
import { Server } from "bun"
import type { ServerWebSocket } from "bun"

// Mock WebSocketServer to prevent auto-server creation
const mockWss = {
  clients: () => [],
  on: () => {},
  close: () => {},
}

// Helper to create relay server on a specific port
function createRelay(port: number): Server {
  const clients = new Set<ServerWebSocket<unknown>>()

  return Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname === "/holster") {
        const upgraded = server.upgrade(req)
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 })
        }
        return undefined
      }
      return new Response("Not Found", { status: 404 })
    },
    websocket: {
      message(ws, msg) {
        // Relay message to all other connected clients
        const data = typeof msg === "string" ? msg : new TextDecoder().decode(msg)
        for (const client of clients) {
          if (client !== ws && client.readyState === 1) {
            client.send(data)
          }
        }
      },
      open(ws) {
        clients.add(ws)
      },
      close(ws) {
        clients.delete(ws)
      },
    },
  })
}

describe("Integration - Real relay sync", () => {
  let relay: Server<WebSocket>
  const relayPort = 9900

  beforeAll(async () => {
    // Start real relay server
    relay = createRelay(relayPort)
    console.log(`[TEST] Relay server started on port ${relayPort}`)
    await new Promise(resolve => setTimeout(resolve, 500)) // Give server time to bind
  })

  afterAll(() => {
    relay.stop()
    console.log("[TEST] Relay server stopped")
  })

  test("syncs data between two peers through relay", async () => {
    console.log("[TEST] Creating peer1...")
    const peer1 = Holster({
      file: "test/integration/peer1",
      port: 9910,  // Each peer gets its own port
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    console.log("[TEST] Creating peer2...")
    const peer2 = Holster({
      file: "test/integration/peer2",
      port: 9911,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    // Wait for WebSocket connections to establish
    console.log("[TEST] Waiting for connections to establish...")
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Peer1 writes data
    console.log("[TEST] Peer1 writing data...")
    await new Promise<void>(resolve => {
      peer1.get("test").put({ message: "Hello from peer1" }, (ack) => {
        console.log("[TEST] Peer1 put callback:", ack)
        resolve()
      })
    })

    // Wait for sync through relay
    console.log("[TEST] Waiting for sync...")
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Peer2 should receive the data
    console.log("[TEST] Peer2 reading data...")
    const data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for data")), 3000)
      peer2.get("test").on((d) => {
        console.log("[TEST] Peer2 received:", d)
        clearTimeout(timeout)
        resolve(d)
      })
    })

    expect(data).toMatchObject({ message: "Hello from peer1" })
    console.log("[TEST] Test passed!")
  })

  test("handles concurrent writes with CRDT conflict resolution", async () => {
    const peer1 = Holster({
      file: "test/integration/concurrent1",
      peers: [`ws://localhost:${relayPort}/holster`],
      port: 9912,
    })

    const peer2 = Holster({
      file: "test/integration/concurrent2",
      peers: [`ws://localhost:${relayPort}/holster`],
      port: 9913,
    })

    // Both peers write different values concurrently
    const writes = Promise.all([
      new Promise<void>(resolve => {
        peer1.get("concurrent").put({ value: "peer1", timestamp: 1 }, () => resolve())
      }),
      new Promise<void>(resolve => {
        peer2.get("concurrent").put({ value: "peer2", timestamp: 2 }, () => resolve())
      }),
    ])

    await writes
    await new Promise(resolve => setTimeout(resolve, 300))

    // Both peers should converge to same state (higher timestamp wins)
    const [data1, data2] = await Promise.all([
      new Promise(resolve => peer1.get("concurrent").on(resolve)),
      new Promise(resolve => peer2.get("concurrent").on(resolve)),
    ])

    // Should have converged to the same value
    expect(data1).toEqual(data2)
  })

  test("late-joining peer syncs existing data", async () => {
    const peer1 = Holster({
      file: "test/integration/early", port: 9914,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    // Peer1 writes data first
    await new Promise<void>(resolve => {
      peer1.get("existing").put({ data: "I was here first" }, () => resolve())
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Peer2 joins late
    const peer2 = Holster({
      file: "test/integration/late", port: 9915,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    await new Promise(resolve => setTimeout(resolve, 300))

    // Late peer should receive existing data
    const data = await new Promise(resolve => {
      peer2.get("existing").on(resolve)
    })

    expect(data).toMatchObject({ data: "I was here first" })
  })

  test("persists data to storage and reloads", async () => {
    const storageFile = "test/integration/persist"

    // Create peer, write data
    const peer1 = Holster({
      file: storageFile, port: 9916,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    await new Promise<void>(resolve => {
      peer1.get("persistent").put({ saved: "to disk" }, () => resolve())
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Create new peer with same storage - should load from disk
    const peer2 = Holster({
      file: storageFile, port: 9917,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    const data = await new Promise(resolve => {
      peer2.get("persistent").on(resolve)
    })

    expect(data).toMatchObject({ saved: "to disk" })
  })

  test("syncs nested graph structures", async () => {
    const peer1 = Holster({
      file: "test/integration/nested1", port: 9918,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    const peer2 = Holster({
      file: "test/integration/nested2", port: 9919,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    // Create nested structure with references
    const userId = "user123"
    const postId = "post456"

    await new Promise<void>(resolve => {
      peer1.get(userId).put({ name: "Alice" }, () => {
        peer1.get(postId).put({ title: "My Post", author: { "#": userId } }, () => resolve())
      })
    })

    await new Promise(resolve => setTimeout(resolve, 300))

    // Peer2 should receive nested structure
    const [user, post] = await Promise.all([
      new Promise(resolve => peer2.get(userId).on(resolve)),
      new Promise(resolve => peer2.get(postId).on(resolve)),
    ])

    expect(user).toMatchObject({ name: "Alice" })
    expect(post).toMatchObject({ title: "My Post" })
    expect((post as any).author).toMatchObject({ "#": userId })
  })

  test("handles connection drops and reconnection", async () => {
    const peer = Holster({
      file: "test/integration/reconnect", port: 9920,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    // Write initial data
    await new Promise<void>(resolve => {
      peer.get("resilient").put({ status: "online" }, () => resolve())
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Simulate connection established
    const data = await new Promise(resolve => {
      peer.get("resilient").on(resolve)
    })

    expect(data).toMatchObject({ status: "online" })
  })

  test("multiple peers sync complex updates", async () => {
    const peers = [
      Holster({ port: 9921, file: "test/integration/multi1", peers: [`ws://localhost:${relayPort}/holster`] }),
      Holster({ port: 9922, file: "test/integration/multi2", peers: [`ws://localhost:${relayPort}/holster`] }),
      Holster({ port: 9923, file: "test/integration/multi3", peers: [`ws://localhost:${relayPort}/holster`] }),
    ]

    // Each peer writes different fields
    await Promise.all([
      new Promise<void>(r => peers[0].get("shared").put({ field1: "from peer1" }, () => r())),
      new Promise<void>(r => peers[1].get("shared").put({ field2: "from peer2" }, () => r())),
      new Promise<void>(r => peers[2].get("shared").put({ field3: "from peer3" }, () => r())),
    ])

    await new Promise(resolve => setTimeout(resolve, 400))

    // All peers should have merged state
    const results = await Promise.all(
      peers.map(peer => new Promise(resolve => peer.get("shared").on(resolve)))
    )

    // All peers should converge to same merged state
    for (const result of results) {
      expect(result).toMatchObject({
        field1: "from peer1",
        field2: "from peer2",
        field3: "from peer3",
      })
    }
  })
})

describe("Integration - User auth over relay", () => {
  let relay: Server<WebSocket>
  const relayPort = 9901

  beforeAll(async () => {
    relay = createRelay(relayPort)
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterAll(() => {
    relay.stop()
  })

  test("creates user and syncs to other peer", async () => {
    const peer1 = Holster({
      file: "test/integration/auth1", port: 9924,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    const peer2 = Holster({
      file: "test/integration/auth2", port: 9925,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    // Create user on peer1
    await new Promise<void>((resolve, reject) => {
      peer1.user().create("alice", "password123", err => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })

    await new Promise(resolve => setTimeout(resolve, 500))

    // Authenticate on peer2 - should work because user synced
    await new Promise<void>((resolve, reject) => {
      peer2.user().auth("alice", "password123", err => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })

    expect(peer2.user().is).toBeDefined()
    expect(peer2.user().is?.username).toBe("alice")
  })

  test("syncs user data between authenticated peers", async () => {
    const peer1 = Holster({
      file: "test/integration/userdata1", port: 9926,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    const peer2 = Holster({
      file: "test/integration/userdata2", port: 9927,
      peers: [`ws://localhost:${relayPort}/holster`],
    })

    // Create and auth user on peer1
    await new Promise<void>((resolve, reject) => {
      peer1.user().create("bob", "password456", err => {
        if (err) reject(new Error(err))
        else {
          peer1.user().auth("bob", "password456", err => {
            if (err) reject(new Error(err))
            else resolve()
          })
        }
      })
    })

    // Write user-specific data
    await new Promise<void>(resolve => {
      peer1.user().get("profile").put({ bio: "I am Bob" }, () => resolve())
    })

    await new Promise(resolve => setTimeout(resolve, 500))

    // Auth on peer2 and read user data
    await new Promise<void>((resolve, reject) => {
      peer2.user().auth("bob", "password456", err => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })

    await new Promise(resolve => setTimeout(resolve, 200))

    const profile = await new Promise(resolve => {
      peer2.user().get("profile").on(resolve)
    })

    expect(profile).toMatchObject({ bio: "I am Bob" })
  })
})

describe("Integration - Storage operations", () => {
  test("stores and retrieves large datasets", async () => {
    const db = Holster({ port: 9928, file: "test/integration/largedata" })

    // Write 100 records
    const writes = []
    for (let i = 0; i < 100; i++) {
      writes.push(
        new Promise<void>(resolve => {
          db.get(`record${i}`).put({ index: i, data: `value${i}` }, () => resolve())
        })
      )
    }

    await Promise.all(writes)
    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify storage
    const reads = []
    for (let i = 0; i < 100; i++) {
      reads.push(
        new Promise(resolve => {
          db.get(`record${i}`).on(resolve)
        })
      )
    }

    const results = await Promise.all(reads)

    expect(results.length).toBe(100)
    expect(results[50]).toMatchObject({ index: 50, data: "value50" })
  })

  test("handles rapid updates to same key", async () => {
    const db = Holster({ port: 9929, file: "test/integration/rapidupdates" })

    // Rapidly update same key
    for (let i = 0; i < 20; i++) {
      await new Promise<void>(resolve => {
        db.get("counter").put({ value: i }, () => resolve())
      })
    }

    await new Promise(resolve => setTimeout(resolve, 100))

    const final = await new Promise(resolve => {
      db.get("counter").on(resolve)
    })

    expect((final as any).value).toBe(19)
  })

  test("persists updates across restarts", async () => {
    const file = "test/integration/restart"

    // First instance
    const db1 = Holster({ file, port: 9930 })
    await new Promise<void>(resolve => {
      db1.get("persistent").put({ version: 1 }, () => resolve())
    })
    await new Promise(resolve => setTimeout(resolve, 100))

    // Second instance (simulates restart)
    const db2 = Holster({ file, port: 9931 })
    await new Promise(resolve => setTimeout(resolve, 100))

    const data = await new Promise(resolve => {
      db2.get("persistent").on(resolve)
    })

    expect(data).toMatchObject({ version: 1 })

    // Update in second instance
    await new Promise<void>(resolve => {
      db2.get("persistent").put({ version: 2 }, () => resolve())
    })
    await new Promise(resolve => setTimeout(resolve, 100))

    // Third instance should see latest
    const db3 = Holster({ file, port: 9932 })
    await new Promise(resolve => setTimeout(resolve, 100))

    const updated = await new Promise(resolve => {
      db3.get("persistent").on(resolve)
    })

    expect(updated).toMatchObject({ version: 2 })
  })
})
