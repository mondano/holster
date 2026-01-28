/**
 * Integration test - Decrypt auth data from real relay
 * Attempts to authenticate with the @ruzgar account
 */

import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"
import SEA from "../../src/sea"

describe("Integration - Real relay decryption test", () => {
  const RELAY_URL = "wss://holster.haza.website"
  const USERNAME = "testUser" // Replace with actual username for testing

  // NOTE: Replace with actual password for testing
  const TEST_PASSWORD = "test_password_here" // REPLACE THIS

  test("attempts to authenticate and decrypt", async () => {
    const holster = Holster({
      peers: [RELAY_URL],
      file: "test/integration/real-relay-decrypt",
      port: 9950, // Use different port to avoid conflicts
    })

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log("[TEST] Attempting to authenticate...")
    console.log(`[TEST] Username: ${USERNAME}`)
    console.log(`[TEST] Password: ${TEST_PASSWORD === "test_password_here" ? "NOT SET - UPDATE TEST" : "SET"}`)

    if (TEST_PASSWORD === "test_password_here") {
      console.warn("[TEST] ⚠️  UPDATE THE TEST_PASSWORD CONSTANT TO TEST AUTHENTICATION")
      console.log("[TEST] The actual password needs to be provided to test decryption")
      return
    }

    const result = await new Promise<{ success: boolean; error?: string; user?: any }>((resolve) => {
      holster.user().auth(USERNAME, TEST_PASSWORD, (err) => {
        if (err) {
          console.error(`[TEST] ✗ Authentication failed: ${err}`)
          resolve({ success: false, error: err })
        } else {
          console.log("[TEST] ✓ Authentication succeeded!")
          const user = holster.user().is
          console.log("[TEST] User data:", {
            username: user?.username,
            pub: user?.pub,
            hasPriv: !!user?.priv,
            hasEpriv: !!user?.epriv,
          })
          resolve({ success: true, user })
        }
      })
    })

    if (result.success) {
      expect(result.user).toBeDefined()
      expect(result.user?.username).toBe(USERNAME)
    } else {
      console.log("[TEST] Authentication failed with error:", result.error)
      console.log("[TEST]")
      console.log("[TEST] Possible reasons:")
      console.log("[TEST] 1. Wrong password")
      console.log("[TEST] 2. Decryption failing (SEA.decrypt returns null)")
      console.log("[TEST] 3. Signature verification failing")
      console.log("[TEST] 4. Timing issue (data not received yet)")
    }
  }, 15000)

  test("manual decryption test with retrieved auth data", async () => {
    const holster = Holster({
      peers: [RELAY_URL],
      file: "test/integration/real-relay-manual-decrypt",
      port: 9951,
    })

    await new Promise(resolve => setTimeout(resolve, 2000))

    // Get auth data
    const pubkey = "~uS-ytluRW3AtvnnTvJ6VZ7sDwaTunNMzePUFXBIXbUo.-RW0Pa4Mdp3IVx0aPuXxo7DKqZ7h38UoZYINHWhonMs"

    console.log("[TEST] Retrieving auth data...")

    const authDataRaw = await new Promise((resolve) => {
      holster.wire.get({ "#": pubkey, ".": "auth" }, (msg) => {
        resolve(msg)
      }, { wait: 1000 })
    })

    if (!authDataRaw || typeof authDataRaw !== 'object' || !('put' in authDataRaw)) {
      console.error("[TEST] Failed to retrieve auth data")
      return
    }

    const put = (authDataRaw as any).put
    const node = put[pubkey]

    if (!node || !node.auth) {
      console.error("[TEST] No auth field in response")
      return
    }

    console.log("[TEST] Auth data retrieved")

    const auth = JSON.parse(node.auth)
    console.log("[TEST] Auth structure:", {
      hasEnc: !!auth.enc,
      hasSalt: !!auth.salt,
      saltLength: auth.salt?.length,
      encHasCt: !!auth.enc?.ct,
      encHasIv: !!auth.enc?.iv,
      encHasS: !!auth.enc?.s,
    })

    console.log("[TEST]")
    console.log("[TEST] To manually test decryption:")
    console.log("[TEST] 1. const work = await SEA.work(password, auth.salt)")
    console.log("[TEST] 2. const dec = await SEA.decrypt(auth.enc, work)")
    console.log("[TEST] 3. Check if dec is null (wrong password) or has priv/epriv")
    console.log("[TEST]")
    console.log("[TEST] Auth salt:", auth.salt)
    console.log("[TEST] Auth enc:", JSON.stringify(auth.enc))

    if (TEST_PASSWORD !== "test_password_here") {
      console.log("[TEST]")
      console.log("[TEST] Testing decryption with provided password...")

      try {
        const work = await SEA.work(TEST_PASSWORD, auth.salt)
        console.log("[TEST] ✓ SEA.work completed, derived key length:", work?.length)

        const dec = await SEA.decrypt(auth.enc, work)

        if (dec) {
          console.log("[TEST] ✓ Decryption succeeded!")
          console.log("[TEST] Decrypted data has:", {
            hasPriv: !!dec.priv,
            hasEpriv: !!dec.epriv,
          })
          expect(dec).toHaveProperty('priv')
          expect(dec).toHaveProperty('epriv')
        } else {
          console.log("[TEST] ✗ Decryption failed - SEA.decrypt returned null")
          console.log("[TEST] This means the password is incorrect")
        }
      } catch (error) {
        console.error("[TEST] ✗ Decryption threw error:", error)
      }
    }
  }, 15000)
})
