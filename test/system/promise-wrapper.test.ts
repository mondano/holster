import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("system - promise wrapped calls", () => {
  const wss: Server = new Server("ws://localhost:9004")
  const holster: HolsterAPI = Holster({ file: "test/system/promise-wrapper", wss: wss })

  test("promise wrapped get returns null for missing key", async () => {
    const data = await new Promise(res => {
      holster.get("missing", res)
    })
    expect(data).toBe(null)
  })

  test("promise wrapped get returns data for existing key", async () => {
    await new Promise(res => {
      holster.get("key").put({ value: "test" }, res)
    })

    const data = await new Promise(res => {
      holster.get("key", res)
    })
    expect(data).not.toBe(null)
    expect((data as { value: string }).value).toBe("test")
  })

  test("promise wrapped next returns null for missing nested key", async () => {
    const data = await new Promise(res => {
      holster.get("key1").next("missing", res)
    })
    expect(data).toBe(null)
  })

  test("cleanup", async () => {
    await fs.promises.rm("test/system/promise-wrapper", {
      recursive: true,
      force: true
    })
  })
})
