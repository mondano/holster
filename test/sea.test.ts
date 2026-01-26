import { describe, test, expect } from "bun:test"
import SEA from "../src/sea"
import type { UserPair, EncryptedData, SignedData } from "../src/schemas"

// The JWK format uses "base64url" encoding, which means "+" replaced with "-"
// and "/" with "_" and removing "=" padding. So public and private keys here
// are strings of alphanumeric characters and underscores (regex: \w), as well
// as dashes. The x and y values of public keys are joined by a full stop, so
// these conditions match the following two regular expressions:
const pubRegex = /^(\w|-)+\.(\w|-)+$/
const privRegex = /^(\w|-)+$/

describe("SEA", () => {
  test("pair await", async () => {
    const pair: UserPair = await SEA.pair()
    expect(pair.pub).toMatch(pubRegex)
    expect(pair.priv).toMatch(privRegex)
    expect(pair.epub).toMatch(pubRegex)
    expect(pair.epriv).toMatch(privRegex)
  })

  test("pair callback", async () => {
    const pair = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    expect(pair.pub).toMatch(pubRegex)
    expect(pair.priv).toMatch(privRegex)
    expect(pair.epub).toMatch(pubRegex)
    expect(pair.epriv).toMatch(privRegex)
  })

  test("encrypt and decrypt string await", async () => {
    const pair: UserPair = await SEA.pair()
    const enc = await SEA.encrypt("hello self", pair)
    expect(enc).not.toBe(null)
    const dec = await SEA.decrypt(enc!, pair)
    expect(dec).toBe("hello self")
  })

  test("encrypt and decrypt with wrong key", async () => {
    const alice: UserPair = await SEA.pair()
    const bob: UserPair = await SEA.pair()
    const enc = await SEA.encrypt("alice secret", alice)
    const dec = await SEA.decrypt(enc!, bob)
    expect(dec).toBe(null)
  })

  test("encrypt and decrypt string callback", async () => {
    const pair = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt("hello self", pair, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, pair, resolve)
    })
    expect(dec).toBe("hello self")
  })

  test("encrypt and decrypt object await", async () => {
    const pair: UserPair = await SEA.pair()
    const enc = await SEA.encrypt({ test: "hello self" }, pair)
    const dec = await SEA.decrypt(enc!, pair)
    expect(dec).toEqual({ test: "hello self" })
  })

  test("encrypt and decrypt object callback", async () => {
    const pair = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt({ test: "hello self" }, pair, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, pair, resolve)
    })
    expect(dec).toEqual({ test: "hello self" })
  })

  test("sign and verify string await", async () => {
    const pair: UserPair = await SEA.pair()
    const signed = await SEA.sign("hello self", pair)
    expect(signed).not.toBe(null)
    const verified = await SEA.verify(signed!, pair)
    expect(verified).toBe("hello self")
  })

  test("sign and verify with wrong key", async () => {
    const alice: UserPair = await SEA.pair()
    const bob: UserPair = await SEA.pair()
    const signed = await SEA.sign("signed by alice", alice)
    const verified = await SEA.verify(signed!, bob)
    expect(verified).toBe(null)
  })

  test("sign and verify string callback", async () => {
    const pair = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const signed = await new Promise<SignedData | null>(resolve => {
      SEA.sign("hello self", pair, resolve)
    })
    const verified = await new Promise<unknown>(resolve => {
      SEA.verify(signed!, pair, resolve)
    })
    expect(verified).toBe("hello self")
  })

  test("sign and verify object await", async () => {
    const pair: UserPair = await SEA.pair()
    const signed = await SEA.sign({ test: "hello self" }, pair)
    const verified = await SEA.verify(signed!, pair)
    expect(verified).toEqual({ test: "hello self" })
  })

  test("sign and verify object callback", async () => {
    const pair = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const signed = await new Promise<SignedData | null>(resolve => {
      SEA.sign({ test: "hello self" }, pair, resolve)
    })
    const verified = await new Promise<unknown>(resolve => {
      SEA.verify(signed!, pair, resolve)
    })
    expect(verified).toEqual({ test: "hello self" })
  })

  test("work with salt encrypt string callback", async () => {
    const work = await new Promise<string>(resolve => {
      SEA.work("hello", "salt", resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt("hello work", work, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, work, resolve)
    })
    expect(dec).toBe("hello work")
  })

  test("work with salt encrypt string await", async () => {
    const work = await SEA.work("hello", "salt")
    const enc = await SEA.encrypt("hello work", work)
    const dec = await SEA.decrypt(enc!, work)
    expect(dec).toBe("hello work")
  })

  test("work with salt encrypt object callback", async () => {
    const work = await new Promise<string>(resolve => {
      SEA.work("hello", "salt", resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt({ test: "hello work" }, work, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, work, resolve)
    })
    expect(dec).toEqual({ test: "hello work" })
  })

  test("work with salt encrypt object await", async () => {
    const work = await SEA.work("hello", "salt")
    const enc = await SEA.encrypt({ test: "hello work" }, work)
    const dec = await SEA.decrypt(enc!, work)
    expect(dec).toEqual({ test: "hello work" })
  })

  test("work no salt encrypt string callback", async () => {
    const work = await new Promise<string>(resolve => {
      SEA.work("hello", resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt("hello work", work, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, work, resolve)
    })
    expect(dec).toBe("hello work")
  })

  test("work no salt encrypt string await", async () => {
    const work = await SEA.work("hello")
    const enc = await SEA.encrypt("hello work", work)
    const dec = await SEA.decrypt(enc!, work)
    expect(dec).toBe("hello work")
  })

  test("work no salt encrypt object callback", async () => {
    const work = await new Promise<string>(resolve => {
      SEA.work("hello", resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt({ test: "hello work" }, work, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, work, resolve)
    })
    expect(dec).toEqual({ test: "hello work" })
  })

  test("work no salt encrypt object await", async () => {
    const work = await SEA.work("hello")
    const enc = await SEA.encrypt({ test: "hello work" }, work)
    const dec = await SEA.decrypt(enc!, work)
    expect(dec).toEqual({ test: "hello work" })
  })

  test("secret string callback", async () => {
    const alice = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const bob = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const to = await new Promise<string>(resolve => {
      SEA.secret(bob, alice, resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt("shared data", to, resolve)
    })
    const from = await new Promise<string>(resolve => {
      SEA.secret(alice, bob, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, from, resolve)
    })
    expect(dec).toBe("shared data")
  })

  test("secret string await", async () => {
    const alice: UserPair = await SEA.pair()
    const bob: UserPair = await SEA.pair()
    const to = await SEA.secret(bob, alice)
    const enc = await SEA.encrypt("shared data", to)
    const from = await SEA.secret(alice, bob)
    const dec = await SEA.decrypt(enc!, from)
    expect(dec).toBe("shared data")
  })

  test("secret object callback", async () => {
    const alice = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const bob = await new Promise<UserPair>(resolve => {
      SEA.pair(resolve)
    })
    const to = await new Promise<string>(resolve => {
      SEA.secret(bob, alice, resolve)
    })
    const enc = await new Promise<EncryptedData | null>(resolve => {
      SEA.encrypt({ test: "shared data" }, to, resolve)
    })
    const from = await new Promise<string>(resolve => {
      SEA.secret(alice, bob, resolve)
    })
    const dec = await new Promise<unknown>(resolve => {
      SEA.decrypt(enc, from, resolve)
    })
    expect(dec).toEqual({ test: "shared data" })
  })

  test("secret object await", async () => {
    const alice: UserPair = await SEA.pair()
    const bob: UserPair = await SEA.pair()
    const to = await SEA.secret(bob, alice)
    const enc = await SEA.encrypt({ test: "shared data" }, to)
    const from = await SEA.secret(alice, bob)
    const dec = await SEA.decrypt(enc!, from)
    expect(dec).toEqual({ test: "shared data" })
  })
})
