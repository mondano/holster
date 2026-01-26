import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../src/holster"
import type { HolsterAPI } from "../src/holster"

describe("holster.user.put", () => {
  const wss: Server = new Server("ws://localhost:9009")
  const holster: HolsterAPI = Holster({
    file: "test/holster.user.put",
    wss: wss,
    maxAge: 100,
    wait: 500,
  })
  const user = holster.user()
  let alice = ""

  test("user create", async () => {
    const err = await new Promise(resolve => user.create("alice", "password", resolve))
    expect(err).toBe(null)
  })

  test("user auth", async () => {
    const err = await new Promise(resolve => user.auth("alice", "password", resolve))
    expect(err).toBe(null)
    expect(user.is?.username).toBe("alice")
    alice = user.is!.pub
  })

  test("put and get string", async () => {
    const err = await new Promise(resolve => user.get("key").put("value", resolve))
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("key", resolve))
    expect(data).toBe("value")
  })

  test("put value to null", async () => {
    const err = await new Promise(resolve => user.get("key").put(null, resolve))
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("key", resolve))
    expect(data).toBe(null)
  })

  test("put and get true", async () => {
    const err = await new Promise(resolve => user.get("true").put(true, resolve))
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("true", resolve))
    expect(data).toBe(true)
  })

  test("put and get false", async () => {
    const err = await new Promise(resolve => user.get("false").put(false, resolve))
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("false", resolve))
    expect(data).toBe(false)
  })

  test("put and get number", async () => {
    const err = await new Promise(resolve => user.get("pi").put(3.14159, resolve))
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("pi", resolve))
    expect(data).toBe(3.14159)
  })

  test("put and get values in for loop", async () => {
    for (let i = 0; i < 5; i++) {
      const err = await new Promise(resolve => user.get("for" + i).put(i, resolve))
      expect(err).toBe(null)
    }

    await new Promise(resolve => setTimeout(resolve, 500))

    for (let i = 0; i < 5; i++) {
      const data = await new Promise(resolve => user.get("for" + i, resolve))
      expect(data).toBe(i)
    }
  })

  test("chained get before put", async () => {
    const err = await new Promise(resolve =>
      user
        .get("hello")
        .next("world!")
        .put("ok", resolve)
    )
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("hello").next("world!", resolve))
    expect(data).toBe("ok")
  })

  test("more chained gets before put", async () => {
    const err = await new Promise(resolve =>
      user
        .get("1")
        .next("2")
        .next("3")
        .put("4", resolve)
    )
    expect(err).toBe(null)

    const data = await new Promise(resolve =>
      user
        .get("1")
        .next("2")
        .next("3", resolve)
    )
    expect(data).toBe("4")
  })

  test("put and get object in graph format", async () => {
    const plain = {
      key: "plain value",
      true: true,
      false: false,
      number: 42,
    }
    const err = await new Promise(resolve => user.get("plain").put(plain, resolve))
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("plain", resolve))
    expect(data).toEqual(plain)
  })

  test("put object to null", async () => {
    const err = await new Promise(resolve => user.get("plain").put(null, resolve))
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("plain", resolve))
    expect(data).toBe(null)
  })

  test("chained get before put object in graph format", async () => {
    const plain = {
      key: "hello plain value",
    }
    const err = await new Promise(resolve =>
      user
        .get("hello")
        .next("plain")
        .put(plain, resolve)
    )
    expect(err).toBe(null)

    const data = await new Promise(resolve => user.get("hello").next("plain", resolve))
    expect(data).toEqual(plain)
  })

  test("put and get nested object", async () => {
    const nested = {
      key: "nested value",
      child: {
        has: "child value",
      },
    }
    const err = await new Promise(resolve => user.get("nested").put(nested, resolve))
    expect(err).toBe(null)

    // Getting a nested object requires waiting for radisk to write to disk,
    // as it will batch the writes. (Default wait is 1 millisecond.)
    await new Promise(resolve => setTimeout(resolve, 2))

    const data = await new Promise(resolve => user.get("nested", resolve))
    expect(data).toEqual(nested)

    const keyData = await new Promise(resolve => user.get("nested").next("key", resolve))
    expect(keyData).toBe("nested value")

    const childData = await new Promise(resolve => user.get("nested").next("child", resolve))
    expect(childData).toEqual({ has: "child value" })
  })

  test("chained get before put nested object", async () => {
    const nested = {
      key: "hello nested value",
      child: {
        has: "hello child value",
      },
    }
    const err = await new Promise(resolve =>
      user
        .get("hello")
        .next("nested")
        .put(nested, resolve)
    )
    expect(err).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 2))

    const data = await new Promise(resolve => user.get("hello").next("nested", resolve))
    expect(data).toEqual(nested)

    const keyData = await new Promise(resolve =>
      user
        .get("hello")
        .next("nested")
        .next("key", resolve)
    )
    expect(keyData).toBe("hello nested value")

    const childData = await new Promise(resolve =>
      user
        .get("hello")
        .next("nested")
        .next("child", resolve)
    )
    expect(childData).toEqual({ has: "hello child value" })
  })

  test("put and get two nested objects", async () => {
    const two = {
      key: "two nested values",
      child1: {
        has: "child value 1",
      },
      child2: {
        has: "child value 2",
      },
    }
    const err = await new Promise(resolve => user.get("two").put(two, resolve))
    expect(err).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 2))

    const data = await new Promise(resolve => user.get("two", resolve))
    expect(data).toEqual(two)

    const child1Data = await new Promise(resolve => user.get("two").next("child1", resolve))
    expect(child1Data).toEqual({ has: "child value 1" })

    const child2Data = await new Promise(resolve => user.get("two").next("child2", resolve))
    expect(child2Data).toEqual({ has: "child value 2" })
  })

  test("put and get multiple nested object", async () => {
    const multiple = {
      key: "multiple nested values",
      child: {
        has: "child value",
        grandchild: {
          has: "grandchild value",
          other: "(not returned in lex query)",
        },
      },
    }
    const err = await new Promise(resolve => user.get("multiple").put(multiple, resolve))
    expect(err).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 2))

    const data = await new Promise(resolve => user.get("multiple", resolve))
    expect(data).toEqual(multiple)

    const childData = await new Promise(resolve =>
      user.get("multiple").next("child", { ".": "has" }, resolve)
    )
    expect(childData).toEqual({ has: "child value" })

    const grandchildData = await new Promise(resolve =>
      user
        .get("multiple")
        .next("child")
        .next("grandchild", { ".": "has" }, resolve)
    )
    expect(grandchildData).toEqual({ has: "grandchild value" })
  })

  test("put string with set", async () => {
    const err1 = await new Promise(resolve => user.get("set").put("first", true, resolve))
    expect(err1).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 2))

    const data1 = await new Promise(resolve => user.get("set", resolve))
    expect(Object.values(data1 as Record<string, unknown>)[0]).toBe("first")

    const err2 = await new Promise(resolve => user.get("set").put("second", true, resolve))
    expect(err2).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 2))

    const data2 = await new Promise(resolve => user.get("set", resolve))
    for (const value of Object.values(data2 as Record<string, unknown>)) {
      expect(value === "first" || value === "second").toBe(true)
    }
  })

  test("put object with set", async () => {
    const set1 = {
      key: "value 1",
      child: "child value 1",
    }
    const set2 = {
      key: "value 2",
      child: "child value 2",
    }
    const err1 = await new Promise(resolve => user.get("set2").put(set1, true, resolve))
    expect(err1).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 100))

    const data1 = await new Promise(resolve => user.get("set2", resolve))
    expect(Object.values(data1 as Record<string, unknown>)[0]).toEqual(set1)

    const err2 = await new Promise(resolve => user.get("set2").put(set2, true, resolve))
    expect(err2).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 100))

    const data2 = await new Promise(resolve => user.get("set2", resolve))
    for (const value of Object.values(data2 as Record<string, unknown>)) {
      if ((value as { key: string }).key === "value 1") {
        expect(value).toEqual(set1)
      }
      if ((value as { key: string }).key === "value 2") {
        expect(value).toEqual(set2)
      }
    }
  })

  test("get number using public key - logged in", async () => {
    const data = await new Promise(resolve => user.get([alice, "pi"], resolve))
    expect(data).toBe(3.14159)
  })

  test("get number using public key - logged out", async () => {
    user.leave()

    const data = await new Promise(resolve => user.get([alice, "pi"], resolve))
    expect(data).toBe(3.14159)
  })

  test("chained get in graph format using public key", async () => {
    const plain = {
      key: "hello plain value",
    }
    const data = await new Promise(resolve => user.get([alice, "hello"]).next("plain", resolve))
    expect(data).toEqual(plain)
  })

  test("get nested object using public key", async () => {
    const nested = {
      key: "nested value",
      child: {
        has: "child value",
      },
    }
    const data = await new Promise(resolve => user.get([alice, "nested"], resolve))
    expect(data).toEqual(nested)

    const keyData = await new Promise(resolve => user.get([alice, "nested"]).next("key", resolve))
    expect(keyData).toBe("nested value")

    const childData = await new Promise(resolve =>
      user.get([alice, "nested"]).next("child", resolve)
    )
    expect(childData).toEqual({ has: "child value" })
  })

  test("chained get nested object using public key", async () => {
    const nested = {
      key: "hello nested value",
      child: {
        has: "hello child value",
      },
    }
    const data = await new Promise(resolve =>
      user.get([alice, "hello"]).next("nested", resolve)
    )
    expect(data).toEqual(nested)

    const keyData = await new Promise(resolve =>
      user
        .get([alice, "hello"])
        .next("nested")
        .next("key", resolve)
    )
    expect(keyData).toBe("hello nested value")

    const childData = await new Promise(resolve =>
      user
        .get([alice, "hello"])
        .next("nested")
        .next("child", resolve)
    )
    expect(childData).toEqual({ has: "hello child value" })
  })

  test("cleanup", async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    await fs.promises.rm("test/holster.user.put", { recursive: true, force: true })
  })
})
