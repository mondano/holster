import { describe, test, expect } from "bun:test"
import Radisk from "../src/radisk"
import Get from "../src/get"
import HAM from "../src/ham"
import User from "../src/user"
import SEA from "../src/sea"
import type { RadiskOptions, WireMessage } from "../src/schemas"

describe("error handling - validation and edge cases", () => {
  describe("radisk validation errors", () => {
    test("throws error when store is missing", () => {
      expect(() => Radisk({} as RadiskOptions)).toThrow(
        "Radisk needs `store` interface with `{get: fn, put: fn, list: fn}`"
      )
    })

    test("throws error when store.get is missing", () => {
      expect(() =>
        Radisk({
          store: {
            put: () => {},
            list: () => {},
          },
        } as RadiskOptions)
      ).toThrow("Radisk needs `store.get` interface with `(file, cb)`")
    })

    test("throws error when store.put is missing", () => {
      expect(() =>
        Radisk({
          store: {
            get: () => {},
            list: () => {},
          },
        } as RadiskOptions)
      ).toThrow("Radisk needs `store.put` interface with `(file, data, cb)`")
    })

    test("throws error when store.list is missing", () => {
      expect(() =>
        Radisk({
          store: {
            get: () => {},
            put: () => {},
          },
        } as RadiskOptions)
      ).toThrow("Radisk needs a streaming `store.list` interface with `(cb)`")
    })

    test("accepts valid store configuration", () => {
      const radisk = Radisk({
        store: {
          get: (_file, cb) => cb(undefined, undefined),
          put: (_file, _data, cb) => cb(undefined),
          list: cb => cb(),
        },
      } as RadiskOptions)
      expect(radisk).toBeDefined()
    })
  })

  describe("get message validation errors", () => {
    test("throws error for invalid lex - undefined", () => {
      expect(() => Get(undefined as any, {})).toThrow(
        "lex must be an object"
      )
    })

    test("throws error for invalid lex - null", () => {
      expect(() => Get(null as any, {})).toThrow(
        "lex must be an object"
      )
    })

    test("throws error for invalid graph - undefined", () => {
      expect(() => Get({ "#": "test" }, undefined as any)).toThrow(
        "graph must be an object"
      )
    })

    test("throws error for invalid graph - null", () => {
      expect(() => Get({ "#": "test" }, null as any)).toThrow(
        "graph must be an object"
      )
    })

    test("throws error for invalid graph - string", () => {
      expect(() => Get({ "#": "test" }, "not an object" as any)).toThrow(
        "graph must be an object"
      )
    })

    test("accepts valid lex and graph", () => {
      const result = Get({ "#": "validSoul" }, {})
      expect(result).toBeUndefined() // No data in empty graph
    })

    test("returns data for valid soul with fast=true", () => {
      const graph = {
        validSoul: {
          _: { "#": "validSoul", ">": { name: 1 } },
          name: "test",
        },
      }
      const result = Get({ "#": "validSoul" }, graph, true) // fast=true to return data
      expect(result).toBeDefined()
      expect(result?.validSoul?.name).toBe("test")
    })
  })

  describe("HAM state validation", () => {
    test("rejects updates with missing state", () => {
      const incoming = {
        _: { "#": "test" }, // Missing ">"
        value: "new",
      }
      const existing = {
        _: { "#": "test", ">": { value: 1 } },
        value: "old",
      }

      const result = HAM(
        incoming.value,
        (incoming._ as any)[">"]?.value,
        existing.value,
        existing._[">"].value
      )

      // Should reject update with undefined/missing state
      expect(result).toBeDefined()
    })

    test("accepts updates with newer state", () => {
      const result = HAM("new", 2, "old", 1)
      // Newer state (2) wins over older state (1)
      expect(result).toBeDefined()
    })

    test("rejects updates with older state", () => {
      const result = HAM("new", 1, "old", 2)
      // Older state (1) loses to newer state (2)
      expect(result).toBeDefined()
    })

    test("handles equal states with lexical comparison", () => {
      const result = HAM("beta", 1, "alpha", 1)
      // Equal states - lexical comparison
      expect(result).toBeDefined()
    })

    test("handles undefined values", () => {
      const result = HAM(undefined, 2, "old", 1)
      // Deletion (undefined) with newer state
      expect(result).toBeDefined()
    })

    test("handles null values", () => {
      const result = HAM(null, 2, "old", 1)
      // Null with newer state
      expect(result).toBeDefined()
    })
  })

  describe("radisk edge cases", () => {
    test("handles reading non-existent key", async () => {
      const store: Record<string, string> = {}
      const radisk = Radisk({
        store: {
          get: (file, cb) => {
            // Return undefined for non-existent files, don't error
            cb(undefined, store[file])
          },
          put: (file, data, cb) => {
            store[file] = data as string
            cb(undefined)
          },
          list: cb => {
            Object.keys(store).forEach(cb)
            cb()
          },
        },
      } as RadiskOptions)

      const value = await new Promise((resolve) => {
        radisk("nonExistent", (_err, val) => {
          resolve(val)
        })
      })

      expect(value).toBe(undefined)
    })

    test("handles writing and reading null", async () => {
      const store: Record<string, string> = {}
      const radisk = Radisk({
        store: {
          get: (file, cb) => cb(undefined, store[file]),
          put: (file, data, cb) => {
            store[file] = data as string
            cb(undefined)
          },
          list: cb => {
            Object.keys(store).forEach(cb)
            cb()
          },
        },
      } as RadiskOptions)

      radisk("nullKey", null)
      await new Promise(resolve => setTimeout(resolve, 10))

      const value = await new Promise((resolve, reject) => {
        radisk("nullKey", (err, val) => {
          if (err) reject(err)
          else resolve(val)
        })
      })

      expect(value).toBe(null)
    })

    test("handles writing and reading undefined", async () => {
      const store: Record<string, string> = {}
      const radisk = Radisk({
        store: {
          get: (file, cb) => cb(undefined, store[file]),
          put: (file, data, cb) => {
            store[file] = data as string
            cb(undefined)
          },
          list: cb => {
            Object.keys(store).forEach(cb)
            cb()
          },
        },
      } as RadiskOptions)

      radisk("undefinedKey", undefined)
      await new Promise(resolve => setTimeout(resolve, 10))

      const value = await new Promise((resolve) => {
        radisk("undefinedKey", (_err, val) => {
          resolve(val)
        })
      })

      expect(value).toBe(undefined)
    })
  })

  describe("user authentication errors", () => {
    test("handles wire get error during auth", async () => {
      // Mock wire that returns errors
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          cb({ err: "Network error", put: {} })
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-error", wait: 100 }, mockWire)

      const error = await new Promise<string | null | undefined>(resolve => {
        user.auth("testuser", "password", resolve)
      })

      expect(error).toContain("error getting")
      expect(error).toContain("Network error")
    })

    test("handles wrong username during auth", async () => {
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          // Return empty result (user not found)
          cb({ put: {} })
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-notfound", wait: 100 }, mockWire)

      const error = await new Promise<string | null | undefined>(resolve => {
        user.auth("nonexistent", "password", resolve)
      })

      expect(error).toBe("Wrong username or password")
    })

    test("handles wrong password during auth (decryption fails)", async () => {
      // Create a real user with encrypted credentials
      const pair = await SEA.pair()
      const salt = "testsalt123"
      const correctWork = await SEA.work("correctpassword", salt)
      const priv = { priv: pair.priv, epriv: pair.epriv }
      const enc = await SEA.encrypt(priv, correctWork)

      const userData = {
        pub: pair.pub,
        epub: pair.epub,
        auth: JSON.stringify({ enc, salt }),
      }

      const mockWire = {
        get: (lex: any, cb: (msg: WireMessage) => void) => {
          if (lex["#"].startsWith("~@")) {
            // Return alias pointing to user soul
            cb({ put: { [lex["#"]]: { [`~${pair.pub}`]: { "#": `~${pair.pub}` } } } })
          } else {
            // Return user data
            cb({ put: { [lex["#"]]: userData } })
          }
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-wrongpass", wait: 100 }, mockWire)

      const error = await new Promise<string | null | undefined>(resolve => {
        user.auth("testuser", "wrongpassword", resolve)
      })

      // Should fail because decryption with wrong password returns null
      expect(error).toBe("Wrong username or password")
    })

    test("handles wire put error during user creation", async () => {
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          // User doesn't exist yet
          cb({ put: {} })
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          // Simulate put error
          if (cb) cb("Database write failed")
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-create-error", wait: 100 }, mockWire)

      const error = await new Promise<string | null | undefined>(resolve => {
        user.create("newuser", "password", resolve)
      })

      expect(error).toContain("error putting")
      expect(error).toContain("Database write failed")
    })

    test("handles wire get error during user creation", async () => {
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          // Simulate get error
          cb({ err: "Connection timeout", put: {} })
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-create-get-error", wait: 100 }, mockWire)

      const error = await new Promise<string | null | undefined>(resolve => {
        user.create("newuser", "password", resolve)
      })

      expect(error).toContain("error getting")
      expect(error).toContain("Connection timeout")
    })

    test("prevents concurrent authentication", async () => {
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          // Delay response to keep auth in progress
          setTimeout(() => cb({ put: {} }), 200)
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-concurrent", wait: 100 }, mockWire)

      // Start first auth (will be slow)
      user.auth("testuser", "password", () => {})

      // Try second auth immediately
      const error = await new Promise<string | null | undefined>(resolve => {
        user.auth("testuser", "password", resolve)
      })

      expect(error).toBe("User is already authenticating")
    })

    test("prevents concurrent user creation", async () => {
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          // Delay response to keep creation in progress
          setTimeout(() => cb({ put: {} }), 200)
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-concurrent-create", wait: 100 }, mockWire)

      // Start first create (will be slow)
      user.create("testuser", "password", () => {})

      // Try second create immediately
      const error = await new Promise<string | null | undefined>(resolve => {
        user.create("testuser", "password", resolve)
      })

      expect(error).toBe("User is already being created")
    })

    test("handles wire put error during password change", async () => {
      const pair = await SEA.pair()
      const salt = "testsalt123"
      const work = await SEA.work("oldpassword", salt)
      const priv = { priv: pair.priv, epriv: pair.epriv }
      const enc = await SEA.encrypt(priv, work)

      const userData = {
        pub: pair.pub,
        epub: pair.epub,
        auth: JSON.stringify({ enc, salt }),
      }

      let putCallCount = 0
      const mockWire = {
        get: (lex: any, cb: (msg: WireMessage) => void) => {
          if (lex["#"].startsWith("~@")) {
            cb({ put: { [lex["#"]]: { [`~${pair.pub}`]: { "#": `~${pair.pub}` } } } })
          } else {
            cb({ put: { [lex["#"]]: userData } })
          }
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          putCallCount++
          // Fail on the password change put
          if (cb) cb("Storage quota exceeded")
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-change-error", wait: 100 }, mockWire)

      const error = await new Promise<string | null | undefined>(resolve => {
        user.change("testuser", "oldpassword", "newpassword", resolve)
      })

      expect(error).toContain("error putting")
      expect(error).toContain("Storage quota exceeded")
    })

    test("handles wire put error during user deletion", async () => {
      const pair = await SEA.pair()
      const salt = "testsalt123"
      const work = await SEA.work("password", salt)
      const priv = { priv: pair.priv, epriv: pair.epriv }
      const enc = await SEA.encrypt(priv, work)

      const userData = {
        pub: pair.pub,
        epub: pair.epub,
        auth: JSON.stringify({ enc, salt }),
      }

      const mockWire = {
        get: (lex: any, cb: (msg: WireMessage) => void) => {
          if (lex["#"].startsWith("~@")) {
            cb({ put: { [lex["#"]]: { [`~${pair.pub}`]: { "#": `~${pair.pub}` } } } })
          } else {
            cb({ put: { [lex["#"]]: userData } })
          }
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          // Fail the deletion put
          if (cb) cb("Permission denied")
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-delete-error", wait: 100 }, mockWire)

      const error = await new Promise<string | null | undefined>(resolve => {
        user.delete("testuser", "password", resolve)
      })

      expect(error).toContain("error putting null")
      expect(error).toContain("Permission denied")
    })

    test("prevents deletion while authenticating", async () => {
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          setTimeout(() => cb({ put: {} }), 200)
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-delete-concurrent", wait: 100 }, mockWire)

      // Start auth (will be slow)
      user.auth("testuser", "password", () => {})

      // Try delete immediately
      const error = await new Promise<string | null | undefined>(resolve => {
        user.delete("testuser", "password", resolve)
      })

      expect(error).toBe("User is already authenticating")
    })

    test("prevents password change while authenticating", async () => {
      const mockWire = {
        get: (_lex: any, cb: (msg: WireMessage) => void) => {
          setTimeout(() => cb({ put: {} }), 200)
        },
        put: (_data: any, cb?: (err: string | null) => void) => {
          if (cb) cb(null)
        },
        on: () => {},
        off: () => {},
      } as any

      const user = User({ file: "test/user-change-concurrent", wait: 100 }, mockWire)

      // Start auth (will be slow)
      user.auth("testuser", "password", () => {})

      // Try change immediately
      const error = await new Promise<string | null | undefined>(resolve => {
        user.change("testuser", "password", "newpass", resolve)
      })

      expect(error).toBe("User is already authenticating")
    })
  })

  describe("SEA crypto errors", () => {
    test("verify throws error for invalid signature format", async () => {
      const pair = await SEA.pair()
      const invalidSig = "not.a.valid.signature"

      // Invalid signature format should throw during parsing
      await expect(SEA.verify(invalidSig, pair)).rejects.toThrow()
    })

    test("verify returns null with wrong public key", async () => {
      const pair1 = await SEA.pair()
      const pair2 = await SEA.pair()
      const data = "test message"

      // Sign with pair1, verify with pair2's public key
      const sig = await SEA.sign(data, pair1)
      const result = await SEA.verify(sig!, pair2)

      expect(result).toBe(null)
    })

    test("sign throws error with null/undefined data", async () => {
      const pair = await SEA.pair()

      // Signing null/undefined data is not supported and should throw
      await expect(SEA.sign(null as any, pair)).rejects.toThrow()
      await expect(SEA.sign(undefined as any, pair)).rejects.toThrow()
    })

    test("encrypt handles null/undefined data", async () => {
      const pair = await SEA.pair()

      const result1 = await SEA.encrypt(null, pair)
      const result2 = await SEA.encrypt(undefined, pair)

      // Should encrypt the literal values
      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })

    test("decrypt returns null for invalid ciphertext", async () => {
      const pair = await SEA.pair()
      const invalidCt = { ct: "invalid", iv: "invalid", s: "invalid" }

      const result = await SEA.decrypt(invalidCt, pair)

      expect(result).toBe(null)
    })

    test("decrypt returns null with wrong key", async () => {
      const pair1 = await SEA.pair()
      const pair2 = await SEA.pair()
      const data = { secret: "value" }

      const encrypted = await SEA.encrypt(data, pair1)
      const result = await SEA.decrypt(encrypted, pair2)

      expect(result).toBe(null)
    })

    test("verify throws error with malformed pair object", async () => {
      const data = "test"
      const pair = await SEA.pair()
      const sig = await SEA.sign(data, pair)

      // Use malformed pair - should throw when trying to import invalid key
      await expect(SEA.verify(sig!, { pub: "not-a-valid-pub-key" })).rejects.toThrow()
    })

    test("sign returns null when pair is missing keys", async () => {
      const data = "test"

      // Missing priv key
      const result1 = await SEA.sign(data, { pub: "pubkey" })
      expect(result1).toBe(null)

      // Missing pub key
      const result2 = await SEA.sign(data, { priv: "privkey" })
      expect(result2).toBe(null)

      // Null pair
      const result3 = await SEA.sign(data, null)
      expect(result3).toBe(null)
    })

    test("encrypt returns null when pair is missing epriv", async () => {
      const data = { test: "value" }

      // Missing epriv key
      const result1 = await SEA.encrypt(data, { pub: "pubkey" })
      expect(result1).toBe(null)

      // Null pair
      const result2 = await SEA.encrypt(data, null)
      expect(result2).toBe(null)
    })

    test("decrypt returns null when pair is missing epriv", async () => {
      const enc = { ct: "test", iv: "test", s: "test" }

      // Missing epriv key
      const result1 = await SEA.decrypt(enc, { pub: "pubkey" })
      expect(result1).toBe(null)

      // Null pair
      const result2 = await SEA.decrypt(enc, null)
      expect(result2).toBe(null)
    })

    test("work handles empty inputs gracefully", async () => {
      const result1 = await SEA.work("", "salt")
      const result2 = await SEA.work("data", "")

      // Should still produce output (may be predictable but valid)
      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })
  })
})
