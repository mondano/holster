import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../src/holster"
import type { HolsterAPI } from "../src/holster"

describe("holster.user.get", () => {
  const wss: Server = new Server("ws://localhost:1234")
  const holster: HolsterAPI = Holster({
    file: "test/holster.user.get",
    wss: wss,
    maxAge: 100,
    wait: 500,
  })
  const user = holster.user()

  test("user is not authenticated", async () => {
    const data = await new Promise(resolve => user.get("test", resolve))
    expect(data).toBe(null)
  })

  test("user create", async () => {
    const err = await new Promise(resolve => user.create("alice", "password", resolve))
    expect(err).toBe(null)
  })

  test("user auth", async () => {
    const err = await new Promise(resolve => user.auth("alice", "password", resolve))
    expect(err).toBe(null)
  })

  test("empty key callback null", async () => {
    const data = await new Promise(resolve => user.get("", resolve))
    expect(data).toBe(null)
  })

  test("null key callback null", async () => {
    const data = await new Promise(resolve => user.get(null, resolve))
    expect(data).toBe(null)
  })

  test("underscore as key callback null", async () => {
    const data = await new Promise(resolve => user.get("_", resolve))
    expect(data).toBe(null)
  })

  test("get unknown key callback null", async () => {
    const data = await new Promise(resolve => user.get("unknown", resolve))
    expect(data).toBe(null)
  })

  test("get unknown keys in for loop callbacks null", async () => {
    const promises = []
    for (let i = 0; i < 5; i++) {
      promises.push(new Promise(resolve => user.get("unknown" + i, resolve)))
    }
    await new Promise(resolve => setTimeout(resolve, 200))
    const results = await Promise.all(promises)
    for (const data of results) {
      expect(data).toBe(null)
    }
  })

  test("nested get unknown key callback null", async () => {
    const data1 = await new Promise(resolve => user.get("unknown", resolve))
    expect(data1).toBe(null)

    const data2 = await new Promise(resolve => user.get("unknown", resolve))
    expect(data2).toBe(null)
  })

  test("next chained unknown keys callback null", async () => {
    const data = await new Promise(resolve => user.get("chained").next("unknown", resolve))
    expect(data).toBe(null)
  })

  test("nested next chained unknown keys callback null", async () => {
    const data1 = await new Promise(resolve => user.get("chained").next("unknown", resolve))
    expect(data1).toBe(null)

    const data2 = await new Promise(resolve => user.get("chained").next("unknown", resolve))
    expect(data2).toBe(null)
  })

  test("cleanup", async () => {
    await fs.promises.rm("test/holster.user.get", { recursive: true, force: true })
  })
})
