import { describe, test, expect } from "bun:test"
import Radisk from "../src/radisk"
import type { RadiskInterface, RadiskOptions, EncodedValue } from "../src/schemas"

// ASCII character for enquiry.
const enq = String.fromCharCode(5)

describe("split", () => {
  const puts: Record<string, string> = {}
  const opt: RadiskOptions = {
    size: 100,
    store: {
      get: (file: string, cb: (err?: string, data?: EncodedValue) => void) => {
        cb(undefined, puts[file] as unknown as EncodedValue | undefined)
      },
      put: (file: string, data: string | EncodedValue | Record<string, unknown>, cb: (err?: string) => void) => {
        puts[file] = data as unknown as string
        cb(undefined)
      },
      list: (cb: (file?: string) => void) => {
        Object.keys(puts).sort().forEach(cb)
        cb()
      },
    },
  }
  const radisk: RadiskInterface = Radisk(opt)
  const now: number = Date.now()
  const lorem =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
  const parent = (): string => {
    return (
      '\x1F+0\x1F#\x1F"parent\x05\x1F\n' +
      '\x1F+1\x1F#\x1F"boolean\x1F=\x1F+\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"number\x1F=\x1F+42\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"rel\x1F=\x1F#child\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"string\x1F=\x1F"parent value\x03' +
      now +
      "\x1F\n"
    )
  }
  const child = (): string => {
    return (
      '\x1F+0\x1F#\x1F"child\x05\x1F\n' +
      '\x1F+1\x1F#\x1F"boolean\x1F=\x1F+\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"number\x1F=\x1F+43\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"rel\x1F=\x1F#grandchild\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"string\x1F=\x1F"child value\x03' +
      now +
      "\x1F\n"
    )
  }
  const grandchild = (): string => {
    return (
      '\x1F+0\x1F#\x1F"grandchild\x05\x1F\n' +
      '\x1F+1\x1F#\x1F"boolean\x1F=\x1F-\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"number\x1F=\x1F+44\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"rel\x1F=\x1F#toys\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"string\x1F=\x1F"grandchild value\x03' +
      now +
      "\x1F\n"
    )
  }
  const toys = (): string => {
    return (
      '\x1F+0\x1F#\x1F"toys\x05\x1F\n' +
      '\x1F+1\x1F#\x1F"b\x1F\n' +
      '\x1F+2\x1F#\x1F"all\x1F=\x1F"green\x03' +
      now +
      "\x1F\n" +
      '\x1F+2\x1F#\x1F"ook\x1F=\x1F"' +
      lorem +
      "\x03" +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"car\x1F=\x1F"red\x03' +
      now +
      "\x1F\n"
    )
  }
  const alpha = (): string => {
    return (
      '\x1F+0\x1F#\x1F"alpha\x05\x1F\n' +
      '\x1F+1\x1F#\x1F"boolean\x1F=\x1F+\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"number\x1F=\x1F+1\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"rel\x1F=\x1F#beta\x03' +
      now +
      "\x1F\n" +
      '\x1F+1\x1F#\x1F"string\x1F=\x1F"alpha value\x03' +
      now +
      "\x1F\n"
    )
  }

  test("write a parent node", async () => {
    radisk("parent" + enq + "string", ["parent value", now])
    radisk("parent" + enq + "number", [42, now])
    radisk("parent" + enq + "boolean", [true, now])
    radisk("parent" + enq + "rel", [{ "#": "child" }, now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": parent(),
    })
  })

  test("write a child node", async () => {
    radisk("child" + enq + "string", ["child value", now])
    radisk("child" + enq + "number", [43, now])
    radisk("child" + enq + "boolean", [true, now])
    radisk("child" + enq + "rel", [{ "#": "grandchild" }, now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": child(),
      parent: parent(),
    })
  })

  test("write a grandchild node", async () => {
    radisk("grandchild" + enq + "string", ["grandchild value", now])
    radisk("grandchild" + enq + "number", [44, now])
    radisk("grandchild" + enq + "boolean", [false, now])
    radisk("grandchild" + enq + "rel", [{ "#": "toys" }, now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": child(),
      parent: parent(),
      grandchild: grandchild(),
    })
  })

  test("write grandchild toys", async () => {
    radisk("toys" + enq + "car", ["red", now])
    radisk("toys" + enq + "ball", ["green", now])
    radisk("toys" + enq + "book", [lorem, now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": child(),
      parent: parent(),
      grandchild: grandchild(),
      toys: toys(),
    })
  })

  test("write new first node", async () => {
    radisk("alpha" + enq + "string", ["alpha value", now])
    radisk("alpha" + enq + "number", [1, now])
    radisk("alpha" + enq + "boolean", [true, now])
    radisk("alpha" + enq + "rel", [{ "#": "beta" }, now])
    radisk("beta" + enq + "string", ["beta value", now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": alpha(),
      beta:
        '\x1F+0\x1F#\x1F"beta\x05string\x1F=\x1F"beta value\x03' +
        now +
        "\x1F\n" +
        child(),
      parent: parent(),
      grandchild: grandchild(),
      toys: toys(),
    })
  })

  // Note that "beta" remains a separate file here (nodes aren't combined).
  test("write new second node", async () => {
    radisk("be" + enq + "string", ["be value", now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": alpha(),
      be:
        '\x1F+0\x1F#\x1F"be\x05string\x1F=\x1F"be value\x03' + now + "\x1F\n",
      beta:
        '\x1F+0\x1F#\x1F"beta\x05string\x1F=\x1F"beta value\x03' +
        now +
        "\x1F\n" +
        child(),
      parent: parent(),
      grandchild: grandchild(),
      toys: toys(),
    })
  })

  test("add a parent item", async () => {
    radisk("parent" + enq + "after", ["this was added after", now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": alpha(),
      be:
        '\x1F+0\x1F#\x1F"be\x05string\x1F=\x1F"be value\x03' + now + "\x1F\n",
      beta:
        '\x1F+0\x1F#\x1F"beta\x05string\x1F=\x1F"beta value\x03' +
        now +
        "\x1F\n" +
        child(),
      grandchild: grandchild(),
      parent:
        '\x1F+0\x1F#\x1F"parent\x05\x1F\n' +
        '\x1F+1\x1F#\x1F"after\x1F=\x1F"this was added after\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"boolean\x1F=\x1F+\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"number\x1F=\x1F+42\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"rel\x1F=\x1F#child\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"string\x1F=\x1F"parent value\x03' +
        now +
        "\x1F\n",
      toys: toys(),
    })
  })

  test("add two child items", async () => {
    radisk("child" + enq + "book", [lorem, now])
    radisk("child" + enq + "pi", [3.14159, now])

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(puts).toEqual({
      "!": alpha(),
      be:
        '\x1F+0\x1F#\x1F"be\x05string\x1F=\x1F"be value\x03' + now + "\x1F\n",
      beta:
        '\x1F+0\x1F#\x1F"beta\x05string\x1F=\x1F"beta value\x03' +
        now +
        "\x1F\n" +
        '\x1F+0\x1F#\x1F"child\x05\x1F\n' +
        '\x1F+1\x1F#\x1F"boo\x1F\n' +
        '\x1F+2\x1F#\x1F"k\x1F=\x1F"' +
        lorem +
        "\x03" +
        now +
        "\x1F\n" +
        '\x1F+2\x1F#\x1F"lean\x1F=\x1F+\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"number\x1F=\x1F+43\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"pi\x1F=\x1F+3.14159\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"rel\x1F=\x1F#grandchild\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"string\x1F=\x1F"child value\x03' +
        now +
        "\x1F\n",
      grandchild: grandchild(),
      parent:
        '\x1F+0\x1F#\x1F"parent\x05\x1F\n' +
        '\x1F+1\x1F#\x1F"after\x1F=\x1F"this was added after\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"boolean\x1F=\x1F+\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"number\x1F=\x1F+42\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"rel\x1F=\x1F#child\x03' +
        now +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"string\x1F=\x1F"parent value\x03' +
        now +
        "\x1F\n",
      toys: toys(),
    })
  })
})

