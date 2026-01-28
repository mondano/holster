/**
 * Integration test - Real relay server authentication debugging
 * Tests connection to wss://holster.haza.website and authentication flow
 * Based on issues described in test.md
 */

import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("Integration - Real relay authentication (@ruzgar)", () => {
  const RELAY_URL = "wss://holster.haza.website"
  const USERNAME = "@ruzgar"
  const ALIAS = `~${USERNAME}`

  let holster: HolsterAPI
  let pubkey: string | null = null

  test("connects to real relay server", async () => {
    holster = Holster({
      peers: [RELAY_URL],
      file: "test/integration/real-relay-debug",
    })

    expect(holster).toBeDefined()
    expect(holster.wire).toBeDefined()

    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 2000))
  }, 10000)

  test("retrieves alias data for ~@ruzgar", async () => {
    console.log(`[TEST] Looking up alias: ${ALIAS}`)

    const aliasData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for alias data"))
      }, 5000)

      holster.wire.get({ "#": ALIAS }, (msg) => {
        console.log("[TEST] Alias response:", JSON.stringify(msg, null, 2))
        clearTimeout(timeout)

        if (msg.err) {
          console.error(`[TEST] Error getting alias: ${msg.err}`)
          resolve({ error: msg.err })
        } else {
          resolve(msg)
        }
      }, { wait: 1000 })
    })

    console.log("[TEST] Alias data:", aliasData)

    // Extract public key from alias if it exists
    if (aliasData && typeof aliasData === 'object' && 'put' in aliasData) {
      const put = (aliasData as any).put
      if (put && put[ALIAS]) {
        // The alias should point to a public key
        const aliasNode = put[ALIAS]
        console.log("[TEST] Alias node:", aliasNode)

        // Find the public key (it should be a key that matches the username)
        for (const [key, value] of Object.entries(aliasNode)) {
          if (key !== '_' && typeof value === 'object' && value && '#' in value) {
            pubkey = (value as any)['#']
            console.log(`[TEST] Found public key: ${pubkey}`)
            break
          }
        }
      }
    }

    expect(aliasData).toBeDefined()
  }, 10000)

  test("retrieves public key data if found", async () => {
    if (!pubkey) {
      console.warn("[TEST] No public key found in previous test, skipping")
      return
    }

    console.log(`[TEST] Looking up public key: ${pubkey}`)

    const pubkeyData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for pubkey data"))
      }, 5000)

      holster.wire.get({ "#": pubkey! }, (msg) => {
        console.log("[TEST] Pubkey response:", JSON.stringify(msg, null, 2))
        clearTimeout(timeout)

        if (msg.err) {
          console.error(`[TEST] Error getting pubkey: ${msg.err}`)
          resolve({ error: msg.err })
        } else {
          resolve(msg)
        }
      }, { wait: 1000 })
    })

    console.log("[TEST] Public key data:", pubkeyData)
    expect(pubkeyData).toBeDefined()

    // Check if auth data exists
    if (pubkeyData && typeof pubkeyData === 'object' && 'put' in pubkeyData) {
      const put = (pubkeyData as any).put
      if (put && put[pubkey!]) {
        const node = put[pubkey!]
        console.log("[TEST] User node keys:", Object.keys(node).filter(k => k !== '_'))

        if (node.auth) {
          console.log("[TEST] ✓ Auth data exists")
          console.log("[TEST] Auth data type:", typeof node.auth)

          // Try to parse auth data
          try {
            const auth = typeof node.auth === 'string'
              ? JSON.parse(node.auth)
              : node.auth
            console.log("[TEST] Auth structure:", {
              hasEnc: !!auth.enc,
              hasSalt: !!auth.salt,
              encLength: auth.enc?.length,
            })
          } catch (e) {
            console.error("[TEST] Failed to parse auth:", e)
          }
        } else {
          console.log("[TEST] ✗ No auth data found")
        }

        if (node.pub) {
          console.log("[TEST] ✓ Public key in node:", node.pub)
        }
        if (node.epub) {
          console.log("[TEST] ✓ Encryption public key exists")
        }
      }
    }
  }, 10000)

  test("retrieves auth field specifically", async () => {
    if (!pubkey) {
      console.warn("[TEST] No public key found, skipping")
      return
    }

    console.log(`[TEST] Looking up auth field for: ${pubkey}`)

    const authData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for auth field"))
      }, 5000)

      holster.wire.get({ "#": pubkey!, ".": "auth" }, (msg) => {
        console.log("[TEST] Auth field response:", JSON.stringify(msg, null, 2))
        clearTimeout(timeout)

        if (msg.err) {
          console.error(`[TEST] Error getting auth field: ${msg.err}`)
          resolve({ error: msg.err })
        } else {
          resolve(msg)
        }
      }, { wait: 1000 })
    })

    console.log("[TEST] Auth field data:", authData)

    // Verify auth field structure
    if (authData && typeof authData === 'object' && 'put' in authData) {
      const put = (authData as any).put
      if (put && put[pubkey!] && put[pubkey!].auth) {
        const authField = put[pubkey!].auth
        console.log("[TEST] Auth field is:", authField === null ? "null" : typeof authField)

        if (authField && typeof authField === 'string') {
          try {
            const parsed = JSON.parse(authField)
            console.log("[TEST] Parsed auth keys:", Object.keys(parsed))
            expect(parsed).toHaveProperty('enc')
            expect(parsed).toHaveProperty('salt')
          } catch (e) {
            console.error("[TEST] Failed to parse auth string:", e)
          }
        }
      } else {
        console.log("[TEST] Auth field is null or missing")
      }
    }
  }, 10000)

  test("attempts authentication with test password (manual step)", async () => {
    if (!pubkey) {
      console.warn("[TEST] No public key found, skipping")
      return
    }

    console.log("[TEST] Manual authentication steps:")
    console.log("[TEST] 1. Get user data from relay")
    console.log(`[TEST] 2. Use: holster.wire.get({ "#": "${pubkey}" }, callback, { wait: 1000 })`)
    console.log("[TEST] 3. Extract auth.enc and auth.salt")
    console.log("[TEST] 4. Use SEA.work(password, salt) to derive key")
    console.log("[TEST] 5. Use SEA.decrypt(auth.enc, work) to decrypt credentials")
    console.log("[TEST] 6. Check if decryption succeeds or returns null")

    // This test serves as documentation for manual debugging
    expect(pubkey).toBeDefined()
  })

  test("checks for potential signing issues", async () => {
    if (!pubkey) {
      console.warn("[TEST] No public key found, skipping")
      return
    }

    console.log("[TEST] Checking for signature verification issues:")

    const data = await new Promise((resolve) => {
      holster.wire.get({ "#": pubkey! }, (msg) => {
        resolve(msg)
      }, { wait: 1000 })
    })

    if (data && typeof data === 'object' && 'put' in data) {
      const put = (data as any).put
      if (put && put[pubkey!]) {
        const node = put[pubkey!]

        // Check for signatures
        if (node._ && node._['s']) {
          console.log("[TEST] ✓ Signatures found in node")
          console.log("[TEST] Signature keys:", Object.keys(node._['s']))
        } else {
          console.log("[TEST] ✗ No signatures found in node metadata")
        }

        // Check for state vector
        if (node._ && node._['>']) {
          console.log("[TEST] ✓ State vector exists")
          const stateKeys = Object.keys(node._['>'])
          console.log("[TEST] State vector keys:", stateKeys)
        } else {
          console.log("[TEST] ✗ No state vector found")
        }
      }
    }

    expect(data).toBeDefined()
  }, 10000)

  test("diagnostic: connection state", () => {
    console.log("[TEST] Diagnostic Information:")
    console.log(`[TEST] - Relay URL: ${RELAY_URL}`)
    console.log(`[TEST] - Username: ${USERNAME}`)
    console.log(`[TEST] - Alias: ${ALIAS}`)
    console.log(`[TEST] - Found pubkey: ${pubkey || "NOT FOUND"}`)
    console.log("[TEST]")
    console.log("[TEST] Next Steps:")
    console.log("[TEST] 1. If pubkey NOT FOUND: The alias may not exist on this relay")
    console.log("[TEST] 2. If pubkey exists but auth fails: Check password or decryption")
    console.log("[TEST] 3. If signatures missing: May indicate signing issue during account creation")
    console.log("[TEST] 4. Check relay logs for any rejection/validation errors")
  })
})

describe("Integration - Real relay write test", () => {
  const RELAY_URL = "wss://holster.haza.website"

  test("can write and read back test data", async () => {
    const holster = Holster({
      peers: [RELAY_URL],
      file: "test/integration/real-relay-write",
    })

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000))

    const testKey = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const testValue = { message: "Hello from test", timestamp: Date.now() }

    console.log(`[TEST] Writing test data to key: ${testKey}`)

    // Write data
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Write timeout")), 5000)

      holster.get(testKey).put(testValue, (ack) => {
        clearTimeout(timeout)
        console.log("[TEST] Write acknowledgment:", ack)
        if (ack && typeof ack === 'string' && ack.includes('error')) {
          reject(new Error(ack))
        } else {
          resolve()
        }
      })
    })

    // Wait for data to propagate
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Read back
    console.log(`[TEST] Reading back test data from key: ${testKey}`)

    const readData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Read timeout")), 5000)

      holster.get(testKey).on((data) => {
        clearTimeout(timeout)
        console.log("[TEST] Read data:", data)
        resolve(data)
      }, true)
    })

    expect(readData).toBeDefined()
    if (readData && typeof readData === 'object') {
      expect(readData).toHaveProperty('message')
      expect((readData as any).message).toBe(testValue.message)
    }
  }, 15000)
})
