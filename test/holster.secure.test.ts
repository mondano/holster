import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../src/holster"
import type { HolsterAPI } from "../src/holster"

describe("holster.secure", () => {
  const wss: Server = new Server("ws://localhost:9006")
  const holster: HolsterAPI = Holster({
    file: "test/holster.secure",
    wss: wss,
    maxAge: 100,
    secure: true,
    wait: 500,
  } as any)
  const user = holster.user()
  const expectedError = "error putting data on root: user required in secure mode"

  test("empty key callback null", async () => {
    const data = await new Promise(resolve => {
      holster.get("", resolve)
    })
    expect(data).toBe(null)
  })

  test("null key callback null", async () => {
    const data = await new Promise(resolve => {
      holster.get(null, resolve)
    })
    expect(data).toBe(null)
  })

  test("underscore as key callback null", async () => {
    const data = await new Promise(resolve => {
      holster.get("_", resolve)
    })
    expect(data).toBe(null)
  })

  test("get unknown key callback null", async () => {
    const data = await new Promise(resolve => {
      holster.get("unknown", resolve)
    })
    expect(data).toBe(null)
  })

  test("next chained unknown keys callback null", async () => {
    const data = await new Promise(resolve => {
      holster.get("chained").next("unknown", resolve)
    })
    expect(data).toBe(null)
  })

  test("put string on root error", async () => {
    const err = await new Promise(resolve => {
      holster.get("key").put("value", resolve)
    })
    expect(err).toBe(expectedError)
  })

  test("chained get before put", async () => {
    const err = await new Promise(resolve => {
      holster
        .get("hello")
        .next("world!")
        .put("ok", resolve)
    })
    expect(err).toBe(expectedError)
  })

  test("chained get before put object in graph format", async () => {
    const plain = {
      key: "hello plain value",
    }
    const err = await new Promise(resolve => {
      holster
        .get("hello")
        .next("plain")
        .put(plain, resolve)
    })
    expect(err).toBe(expectedError)
  })

  test("user create", async () => {
    const err = await new Promise(resolve => {
      user.create("alice", "password", resolve)
    })
    expect(err).toBe(null)
    // Wait for user creation to fully complete
    await new Promise(resolve => setTimeout(resolve, 100))
  }, 10000)

  test("user auth", async () => {
    const err = await new Promise(resolve => {
      user.auth("alice", "password", resolve)
    })
    expect(err).toBe(null)
    // Wait for authentication to fully complete
    await new Promise(resolve => setTimeout(resolve, 100))
  }, 10000)

  test("user put and get string", async () => {
    const err = await new Promise(resolve => {
      user.get("key").put("value", resolve)
    })
    expect(err).toBe(null)

    const data = await new Promise(resolve => {
      user.get("key", resolve)
    })
    expect(data).toBe("value")
  })

  test("user chained get before put", async () => {
    const err = await new Promise(resolve => {
      user
        .get("hello")
        .next("world!")
        .put("ok", resolve)
    })
    expect(err).toBe(null)

    const data = await new Promise(resolve => {
      user.get("hello").next("world!", resolve)
    })
    expect(data).toBe("ok")
  })

  test("user put and get object in graph format", async () => {
    const plain = {
      key: "plain value",
      true: true,
      false: false,
      number: 42,
    }
    const err = await new Promise(resolve => {
      user.get("plain").put(plain, resolve)
    })
    expect(err).toBe(null)

    const data = await new Promise(resolve => {
      user.get("plain", resolve)
    })
    expect(data).toEqual(plain)
  })

  test("user put object to null", async () => {
    const err = await new Promise(resolve => {
      user.get("plain").put(null, resolve)
    })
    expect(err).toBe(null)

    const data = await new Promise(resolve => {
      user.get("plain", resolve)
    })
    expect(data).toBe(null)
  })

  test("user chained get before put object in graph format", async () => {
    const plain = {
      key: "hello plain value",
    }
    const err = await new Promise(resolve => {
      user
        .get("hello")
        .next("plain")
        .put(plain, resolve)
    })
    expect(err).toBe(null)

    const data = await new Promise(resolve => {
      user.get("hello").next("plain", resolve)
    })
    expect(data).toEqual(plain)
  })

  test("user put and get nested object", async () => {
    const nested = {
      key: "nested value",
      child: {
        has: "child value",
      },
    }
    const err = await new Promise(resolve => {
      user.get("nested").put(nested, resolve)
    })
    expect(err).toBe(null)

    // Getting a nested object requires waiting for radisk to write to disk,
    // as it will batch the writes. (Default wait is 1 millisecond.)
    await new Promise(resolve => setTimeout(resolve, 2))

    const data = await new Promise(resolve => {
      user.get("nested", resolve)
    })
    expect(data).toEqual(nested)

    const keyData = await new Promise(resolve => {
      user.get("nested").next("key", resolve)
    })
    expect(keyData).toBe("nested value")

    const childData = await new Promise(resolve => {
      user.get("nested").next("child", resolve)
    })
    expect(childData).toEqual({ has: "child value" })
  })

  test("cleanup", async () => {
    await fs.promises.rm("test/holster.secure", { recursive: true, force: true })
  })
})
