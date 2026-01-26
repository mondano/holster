import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Holster from "../../src/holster"
import type { HolsterAPI } from "../../src/holster"

describe("system - immediate read after write", () => {
  const wss: Server = new Server("ws://localhost:9008")
  const holster: HolsterAPI = Holster({ file: "test/system/immediate-read", wss: wss })

  test("get immediately after put returns data despite queue delays", async () => {
    const err = await new Promise(resolve => {
      holster.get("testkey").put({ value: "test" }, resolve)
    })
    expect(err).toBe(null)

    // Immediate get after put - validates retry logic handles queued writes
    const data = await new Promise(resolve => {
      holster.get("testkey", resolve)
    })
    expect(data).not.toBe(null)
    expect((data as { value: string }).value).toBe("test")
  })

  test("cleanup", async () => {
    await fs.promises.rm("test/system/immediate-read", {
      recursive: true,
      force: true
    })
  })
})
