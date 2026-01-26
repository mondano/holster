import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import Wire from "../src/wire"
import type { WireInterface } from "../src/schemas"

describe("wire", () => {
  // Need different websocket servers otherwise data on file will sync up.
  const wss1: Server = new Server("ws://localhost:1234")
  const kitty: WireInterface = Wire({ file: "test/kitty", wss: wss1, maxAge: 10 })

  const wss2: Server = new Server("ws://localhost:1235")
  const wire: WireInterface = Wire({ file: "test/wire", wss: wss2, maxAge: 10 })

  const ws: WebSocket = new WebSocket("ws://localhost:1235")
  ws.onmessage = (m: MessageEvent) => {
    const msg = JSON.parse(m.data as string)
    if (msg.get) {
      const soul = msg.get["#"]
      const put = {
        [soul]: {
          _: { "#": soul, ">": { test: 1 } },
          test: "property",
        },
      }
      let track = "item"
      if (!msg.get!["."]) {
        const node = put[soul]! as any
        node._[">"].other = 2
        node.other = "value"
        track = "node"
      }
      ws.send(
        JSON.stringify({
          "#": track,
          "@": msg["#"],
          put: put,
        }),
      )
    }
  }

  test("get node", async () => {
    // Wait for wire to initialize and load data from disk
    await new Promise(resolve => setTimeout(resolve, 100))
    const msg = await new Promise(resolve => {
      kitty.get({ "#": "FDSA" }, resolve)
    })
    expect(msg).toEqual({
      err: undefined,
      put: {
        FDSA: {
          _: {
            "#": "FDSA",
            ">": {
              color: 3,
              name: 2,
              slave: 2,
              species: 2,
            },
          },
          color: "ginger",
          name: "Fluffy",
          slave: { "#": "ASDF" },
          species: "felis silvestris",
        },
      },
    })
  })

  test("get item", async () => {
    // Wait for wire to initialize and load data from disk
    await new Promise(resolve => setTimeout(resolve, 100))
    const msg = await new Promise(resolve => {
      kitty.get({ "#": "FDSA", ".": "species" }, resolve)
    })
    expect(msg).toEqual({
      err: undefined,
      put: {
        FDSA: {
          _: {
            "#": "FDSA",
            ">": { species: 2 },
          },
          species: "felis silvestris",
        },
      },
    })
  })

  test("get node from wire", async () => {
    const msg = await new Promise(resolve => {
      wire.get({ "#": "not on disk" }, resolve)
    })
    expect(msg).toEqual({
      put: {
        "not on disk": {
          _: {
            "#": "not on disk",
            ">": { test: 1, other: 2 },
          },
          test: "property",
          other: "value",
        },
      },
    })
  })

  test("get item from wire", async () => {
    const msg = await new Promise(resolve => {
      wire.get({ "#": "not on disk", ".": "test" }, resolve)
    })
    expect(msg).toEqual({
      put: {
        "not on disk": {
          _: {
            "#": "not on disk",
            ">": { test: 1 },
          },
          test: "property",
        },
      },
    })
  })

  test("put and get new node", async () => {
    const update = {
      key: {
        _: { "#": "key", ">": { value: 1, otherValue: 1 } },
        value: "wire test",
        otherValue: false,
      },
    }
    const err = await new Promise(resolve => {
      wire.put(update, resolve)
    })
    expect(err).toBe(null)

    const msg = await new Promise(resolve => {
      wire.get({ "#": "key", ".": "value" }, resolve)
    })
    expect(msg).toEqual({
      put: {
        key: {
          _: {
            "#": "key",
            ">": { value: 1 },
          },
          value: "wire test",
        },
      },
    })
  })

  test("cleanup", async () => {
    // Timeout to let extra wire sends finish before tests end.
    await new Promise(resolve => setTimeout(resolve, 100))
    await fs.promises.rm("test/wire", { recursive: true, force: true })
  })
})
