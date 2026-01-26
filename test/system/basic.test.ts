import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("system - basic setup", () => {
  const wss: Server = new Server("ws://localhost:9101")
  const holster: HolsterAPI = Holster({ file: "test/system/basic", wss: wss })

  test("put and get data", async () => {
    const err = await new Promise(resolve => {
      holster.get("test").put({ message: "hello" }, resolve)
    })
    expect(err).toBe(null)

    const data = await new Promise(resolve => {
      holster.get("test", resolve)
    })
    expect(data).not.toBe(null)
    expect((data as { message: string }).message).toBe("hello")
  })

  test("cleanup", async () => {
    await fs.promises.rm("test/system/basic", { recursive: true, force: true })
  })
})
