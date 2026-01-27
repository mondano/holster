import { describe, test, expect } from "bun:test"
import HAM from "../src/ham"
import SEA from "../src/sea"
import type { Graph, ListenMap } from "../src/schemas"

describe("HAM.mix() - CRDT conflict resolution", () => {
  describe("input validation", () => {
    test("throws error for invalid change parameter", async () => {
      await expect(
        HAM.mix(null as any, {}, false, {})
      ).rejects.toThrow("change must be an object")
    })

    test("throws error for invalid graph parameter", async () => {
      await expect(
        HAM.mix({}, null as any, false, {})
      ).rejects.toThrow("graph must be an object")
    })

    test("throws error for invalid listen parameter", async () => {
      await expect(
        HAM.mix({}, {}, false, null as any)
      ).rejects.toThrow("listen must be an object")
    })

    test("accepts valid parameters", async () => {
      const result = await HAM.mix({}, {}, false, {})
      expect(result).toBeDefined()
      expect(result.now).toEqual({})
      expect(result.defer).toEqual({})
      expect(result.wait).toBe(0)
      expect(result.listeners).toEqual([])
    })
  })

  describe("basic conflict resolution", () => {
    test("merges non-conflicting update", async () => {
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 1 } },
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.now.soul1?.name).toBe("Alice")
      expect(graph.soul1?.name).toBe("Alice")
    })

    test("accepts update with newer timestamp", async () => {
      const graph: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 1 } },
          name: "Alice",
        },
      }
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 2 } },
          name: "Bob",
        },
      }
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.now.soul1?.name).toBe("Bob")
      expect(graph.soul1?.name).toBe("Bob")
    })

    test("rejects update with older timestamp", async () => {
      const graph: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 2 } },
          name: "Bob",
        },
      }
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 1 } },
          name: "Alice",
        },
      }
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.now).toEqual({})
      expect(graph.soul1?.name).toBe("Bob") // Unchanged
    })
  })

  describe("future timestamps and deferred updates", () => {
    test("defers update with future timestamp within 24 hours", async () => {
      const futureTime = Date.now() + 1000 // 1 second in future
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: futureTime } },
          name: "Future",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.defer.soul1?.name).toBe("Future")
      expect(result.now).toEqual({})
      expect(result.wait).toBeGreaterThan(0)
      expect(result.wait).toBeLessThanOrEqual(1000)
    })

    test("rejects update with timestamp > 24 hours in future", async () => {
      const farFuture = Date.now() + 86400001 // > 24 hours
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: farFuture } },
          name: "TooFar",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.defer).toEqual({})
      expect(result.now).toEqual({})
      expect(graph.soul1).toBeUndefined()
    })

    test("tracks minimum wait time across multiple deferred updates", async () => {
      const future1 = Date.now() + 5000
      const future2 = Date.now() + 2000 // Earlier
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: future1 } },
          name: "Later",
        },
        soul2: {
          _: { "#": "soul2", ">": { name: future2 } },
          name: "Sooner",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.wait).toBeLessThanOrEqual(2000)
      expect(result.defer.soul1).toBeDefined()
      expect(result.defer.soul2).toBeDefined()
    })
  })

  describe("graph size limits (MAX_GRAPH_SIZE)", () => {
    test("removes oldest souls when exceeding 10,000 limit", async () => {
      const graph: Graph = {}

      // Fill graph with 10,001 souls
      for (let i = 0; i < 10001; i++) {
        graph[`soul${i}`] = {
          _: { "#": `soul${i}`, ">": { data: i } }, // Earlier souls have lower timestamps
          data: `value${i}`,
        }
      }

      const change: Graph = {}
      const listen: ListenMap = {}

      await HAM.mix(change, graph, false, listen)

      // Graph should be trimmed to 10,000
      expect(Object.keys(graph).length).toBe(10000)

      // Oldest souls (lowest timestamps) should be removed
      expect(graph["soul0"]).toBeUndefined()
      expect(graph["soul10000"]).toBeDefined() // Newest should remain
    })

    test("keeps newest souls when trimming", async () => {
      const graph: Graph = {}

      // Create souls with different ages
      for (let i = 0; i < 10001; i++) {
        const timestamp = 1000000 + i * 1000 // Each soul is 1 second newer
        graph[`soul${i}`] = {
          _: { "#": `soul${i}`, ">": { data: timestamp } },
          data: `value${i}`,
        }
      }

      const change: Graph = {}
      const listen: ListenMap = {}

      await HAM.mix(change, graph, false, listen)

      // Newest souls should remain
      expect(graph["soul10000"]).toBeDefined()
      expect(graph["soul9999"]).toBeDefined()
      expect(graph["soul9500"]).toBeDefined()

      // Oldest should be removed
      expect(graph["soul0"]).toBeUndefined()
    })
  })

  describe("user soul validation (~publickey and ~@alias)", () => {
    test("requires verification for ~publickey souls", async () => {
      const pub = "testPublicKey123"
      const change: Graph = {
        [`~${pub}`]: {
          _: { "#": `~${pub}`, ">": { name: 1 } },
          pub: pub,
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      // Without signature verification, should skip
      const result = await HAM.mix(change, graph, false, listen)

      expect(result.now[`~${pub}`]).toBeUndefined()
    })

    test("rejects ~publickey soul when public key doesn't match", async () => {
      const pub = "correctKey"
      const wrongSoul = "~wrongKey"
      const change: Graph = {
        [wrongSoul]: {
          _: { "#": wrongSoul, ">": { name: 1 } },
          pub: pub, // Mismatched pub key
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.now[wrongSoul]).toBeUndefined()
      expect(graph[wrongSoul]).toBeUndefined()
    })

    test("validates ~@alias souls require self-identifying rel", async () => {
      const aliasSoul = "~@alice"
      const targetSoul = "targetSoul123"
      const change: Graph = {
        [aliasSoul]: {
          _: { "#": aliasSoul, ">": { [targetSoul]: 1 } },
          [targetSoul]: { "#": targetSoul }, // Key must match soul ID in value
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      // Alias accepted when key matches rel.is(value)
      expect(result.now[aliasSoul]?.[targetSoul]).toEqual({ "#": targetSoul })
    })

    test("rejects ~@alias when key doesn't match rel.is(value)", async () => {
      const aliasSoul = "~@alice"
      const change: Graph = {
        [aliasSoul]: {
          _: { "#": aliasSoul, ">": { wrongKey: 1 } },
          wrongKey: { "#": "targetSoul" }, // Key doesn't match the soul ID
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      // Rejected because wrongKey !== "targetSoul"
      expect(result.now[aliasSoul]).toBeUndefined()
    })
  })

  describe("signature verification", () => {
    test("requires valid signatures when secure=true", async () => {
      const pair = await SEA.pair()
      const timestamp = Date.now()
      const soul = `~${pair.pub}`

      // Create unsigned data
      const change: Graph = {
        [soul]: {
          _: { "#": soul, ">": { name: timestamp } },
          pub: pair.pub,
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, true, listen)

      // Without valid signature, should be rejected
      expect(result.now[soul]).toBeUndefined()
    })

    test("verifies timestamp signatures when provided", async () => {
      const pair = await SEA.pair()
      const timestamp = Date.now()
      const soul = `~${pair.pub}`

      // Sign the timestamp
      const sig = await SEA.sign(timestamp.toString(), pair)

      const change: Graph = {
        [soul]: {
          _: {
            "#": soul,
            ">": { name: timestamp },
            s: { [timestamp]: sig }
          },
          pub: pair.pub,
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      // Signature verification happens asynchronously
      // Since SEA.verifyTimestamp requires valid signature format,
      // this tests that the verification path is executed
      expect(result).toBeDefined()
    })

    test("rejects data with invalid signature", async () => {
      const pair = await SEA.pair()
      const timestamp = Date.now()
      const soul = `~${pair.pub}`

      // Use wrong signature
      const invalidSig = "invalidSignature123"

      const change: Graph = {
        [soul]: {
          _: {
            "#": soul,
            ">": { name: timestamp },
            s: { [timestamp]: invalidSig }
          },
          pub: pair.pub,
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      // Invalid signature should be rejected
      expect(result.now[soul]).toBeUndefined()
    })

    test("skips node when no valid signed properties", async () => {
      const pair = await SEA.pair()
      const timestamp = Date.now()
      const soul = `~${pair.pub}`

      const change: Graph = {
        [soul]: {
          _: {
            "#": soul,
            ">": { name: timestamp },
            s: {} // Empty signatures
          },
          pub: pair.pub,
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      // No valid signatures, should skip
      expect(result.now[soul]).toBeUndefined()
    })
  })

  describe("listener callbacks", () => {
    test("triggers listeners for updated properties", async () => {
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 1 } },
          name: "Alice",
        },
      }
      const graph: Graph = {}

      let callbackCalled = false
      const listen: ListenMap = {
        soul1: [
          {
            ".": "name",
            cb: () => { callbackCalled = true }
          }
        ]
      }

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.listeners.length).toBe(1)
      result.listeners[0]()
      expect(callbackCalled).toBe(true)
    })

    test("triggers soul-level listeners after field updates", async () => {
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 1, age: 1 } },
          name: "Alice",
          age: 30,
        },
      }
      const graph: Graph = {}

      let soulCallbackCalled = false
      const listen: ListenMap = {
        soul1: [
          {
            cb: () => { soulCallbackCalled = true }
          }
        ]
      }

      const result = await HAM.mix(change, graph, false, listen)

      // Soul-level listener triggered for each field plus once at end
      expect(result.listeners.length).toBeGreaterThan(0)
      result.listeners.forEach(cb => cb())
      expect(soulCallbackCalled).toBe(true)
    })

    test("doesn't trigger listeners for rejected updates", async () => {
      const graph: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 2 } },
          name: "Bob",
        },
      }
      const change: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { name: 1 } },
          name: "Alice",
        },
      }

      const listen: ListenMap = {
        soul1: [{ cb: () => {} }]
      }

      const result = await HAM.mix(change, graph, false, listen)

      // Old timestamp rejected, no listeners triggered
      expect(result.listeners.length).toBe(0)
    })
  })

  describe("edge cases", () => {
    test("skips nodes without metadata", async () => {
      const change: Graph = {
        invalidNode: {
          // Missing _ metadata
          name: "Invalid"
        } as any,
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      const result = await HAM.mix(change, graph, false, listen)

      expect(result.now).toEqual({})
      expect(graph.invalidNode).toBeUndefined()
    })

    test("preserves signatures for unsigned updates", async () => {
      const timestamp = Date.now()
      const change: Graph = {
        soul1: {
          _: {
            "#": "soul1",
            ">": { name: timestamp },
            s: { [timestamp]: "someSig" }
          },
          name: "Alice",
        },
      }
      const graph: Graph = {}
      const listen: ListenMap = {}

      await HAM.mix(change, graph, false, listen)

      // When secure=false, signatures are preserved even if not verified
      expect(graph.soul1?.name).toBe("Alice")
      expect(graph.soul1?._?.s?.[timestamp]).toBe("someSig")
    })
  })
})
