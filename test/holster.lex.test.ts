import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../src/holster"
import type { HolsterAPI } from "../src/holster"

describe("holster.lex", () => {
  const wss: Server = new Server("ws://localhost:9005")
  const holster: HolsterAPI = Holster({ file: "test/holster.lex", wss: wss, maxAge: 100 })

  test("object on root in graph format", async () => {
    const plain = {
      key: "plain value",
      true: true,
      false: false,
      number: 42,
    }
    const err = await new Promise(resolve => holster.get("plain").put(plain, resolve))
    expect(err).toBe(null)

    // Prefix tests. (Need to be sequential to match return values.)
    const data1 = await new Promise(resolve => holster.get("plain", { ".": { "*": "k" } }, resolve))
    expect(data1).toEqual({ key: "plain value" })

    const data2 = await new Promise(resolve => holster.get("plain", { ".": { "*": "t" } }, resolve))
    expect(data2).toEqual({ true: true })

    const data3 = await new Promise(resolve => holster.get("plain", { ".": { "*": "f" } }, resolve))
    expect(data3).toEqual({ false: false })

    const data4 = await new Promise(resolve => holster.get("plain", { ".": { "*": "n" } }, resolve))
    expect(data4).toEqual({ number: 42 })

    // Both less than and greater than.
    const data5 = await new Promise(resolve =>
      holster.get("plain", { ".": { "<": "n", ">": "falsy" } }, resolve)
    )
    expect(data5).toEqual({ key: "plain value" })

    // Only less than.
    const data6 = await new Promise(resolve => holster.get("plain", { ".": { "<": "k" } }, resolve))
    expect(data6).toEqual({ false: false })

    // Only greater than.
    const data7 = await new Promise(resolve =>
      holster.get("plain", { ".": { ">": "numbers" } }, resolve)
    )
    expect(data7).toEqual({ true: true })
  })

  test("put and get nested object", async () => {
    const nested = {
      key: "nested value",
      other: "other value",
      child: {
        has: "child value",
        other: "other child value",
      },
    }
    const err = await new Promise(resolve => holster.get("nested").put(nested, resolve))
    expect(err).toBe(null)

    // Getting a nested object requires waiting for radisk to write to disk,
    // as it will batch the writes. (Default wait is 1 millisecond.)
    await new Promise(resolve => setTimeout(resolve, 2))

    const data1 = await new Promise(resolve =>
      holster.get("nested", { ".": { "*": "k" } }, resolve)
    )
    expect(data1).toEqual({ key: "nested value" })

    const data2 = await new Promise(resolve =>
      holster.get("nested").next("child", { ".": { "*": "h" } }, resolve)
    )
    expect(data2).toEqual({ has: "child value" })

    const data3 = await new Promise(resolve =>
      holster.get("nested").next("child", { ".": { "<": "has" } }, resolve)
    )
    // Less than means less than or equal to in lex.
    expect(data3).toEqual({ has: "child value" })
  })

  test("chained get before put nested object", async () => {
    const nested = {
      key: "hello nested value",
      other: "other value",
      child: {
        has: "hello child value",
        other: "other child value",
      },
    }
    const err = await new Promise(resolve =>
      holster
        .get("hello")
        .next("nested")
        .put(nested, resolve)
    )
    expect(err).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 2))

    const data1 = await new Promise(resolve =>
      holster.get("hello").next("nested", { ".": { "*": "k" } }, resolve)
    )
    expect(data1).toEqual({ key: "hello nested value" })

    const data2 = await new Promise(resolve =>
      holster
        .get("hello")
        .next("nested")
        .next("child", { ".": { "*": "h" } }, resolve)
    )
    expect(data2).toEqual({ has: "hello child value" })

    const data3 = await new Promise(resolve =>
      holster
        .get("hello")
        .next("nested")
        .next("child", { ".": { ">": "other" } }, resolve)
    )
    // Greater than means greater than or equal to in lex.
    expect(data3).toEqual({ other: "other child value" })
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
    const err = await new Promise(resolve => holster.get("two").put(two, resolve))
    expect(err).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 2))

    const data1 = await new Promise(resolve =>
      holster.get("two", { ".": { "*": "child" } }, resolve)
    )
    expect(data1).toEqual({
      child1: two.child1,
      child2: two.child2,
    })

    const data2 = await new Promise(resolve =>
      holster
        .get("two")
        .next("child1", { ".": { ">": "g", "<": "i" } }, resolve)
    )
    expect(data2).toEqual({ has: "child value 1" })
  })

  test("on and put nested object", async () => {
    const nested = {
      key: "nested key",
      child: {
        has: "child key",
      },
    }
    // The node needs to exist before it can be listend to for updates.
    const err = await new Promise(resolve => holster.get("on-nested").put(nested, resolve))
    expect(err).toBe(null)

    const update = {
      child: {
        has: "child update",
      },
    }

    const dataPromise = new Promise(resolve =>
      holster
        .get("on-nested")
        .next("child")
        .on({ ".": { ">": "h" } }, resolve)
    )

    await new Promise(resolve => setTimeout(resolve, 10))

    const err2 = await new Promise(resolve => holster.get("on-nested").put(update, resolve))
    expect(err2).toBe(null)

    const data = await dataPromise
    expect(data).toEqual(update.child)
  })

  test("cleanup", async () => {
    await fs.promises.rm("test/holster.lex", { recursive: true, force: true })
  })
})
