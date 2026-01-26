import { describe, test, expect } from "bun:test"
import Radisk from "../src/radisk"
import type { RadiskInterface, RadiskOptions, EncodedValue } from "../src/schemas"

describe("radisk", () => {
  const puts: Record<string, string> = {}
  const opt: RadiskOptions = {
    write: 1,
    batch: 2,
    size: 100,
    cache: false,
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
  const big =
    "file size is only 100 bytes so writing this value requires calling slice"

  test("write and read from memory", async () => {
    radisk("key", "value", () => {
      expect(puts).toEqual({ "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\x1F\n' })
    })

    // Reading after write means radisk.batch is still available.
    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("value")
  })

  test("read from store", async () => {
    // Waiting until after opt.write means radisk.batch has been reset, so a
    // call to radisk.read is required which means the file needs to be parsed.
    await new Promise(resolve => setTimeout(resolve, opt.write! + 1))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("value")
  })

  test("write and read value with state", async () => {
    radisk("key", ["value", 1234])
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\x031234\x1F\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(["value", 1234])
  })

  test("write and read a plain object is undefined", async () => {
    radisk("key", { object: true })
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!": '\x1F+0\x1F#\x1F"key\x1F=undefined\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(undefined)
  })

  test("write a plain object with state is also undefined", async () => {
    radisk("key", [{ object: true }, 1234])
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!": '\x1F+0\x1F#\x1F"key\x1F=undefined\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(undefined)
  })

  test("write and read a soul relation is ok", async () => {
    const rel = { "#": "soul" }
    radisk("key", rel)
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F#soul\x1F\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(rel)
  })

  test("write and read a soul relation with state is ok", async () => {
    const rel: [{ "#": string }, number] = [{ "#": "soul" }, 1234]
    radisk("key", rel)
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F#soul\x031234\x1F\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(rel)
  })

  test("write and read value with newline", async () => {
    radisk("key", "value\ncontinued")
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x1F\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("value\ncontinued")
  })

  test("write and read value with newline and state", async () => {
    radisk("key", ["value\ncontinued", 12345])
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(["value\ncontinued", 12345])
  })

  test("write more than batch size", async () => {
    radisk("keyA", "valueA")
    radisk("keyB", "valueB")
    radisk("keyC", "valueC")
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F"valueA\x1F\n' +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F"valueC\x1F\n',
    })

    const value = await new Promise((resolve, reject) => {
      radisk("keyA", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("valueA")
  })

  test("write and read value bigger than file size", async () => {
    radisk("newFile", big)

    const immediateValue = await new Promise((resolve, reject) => {
      radisk("newFile", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(immediateValue).toBe(big)

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F"valueA\x1F\n' +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F"valueC\x1F\n',
      newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"' + big + "\x1F\n",
    })

    const value = await new Promise((resolve, reject) => {
      radisk("newFile", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe(big)
  })

  // This tests trying to add to a file that is already too long, so needs to
  // split again. Previously wasn't able to do this and would loop.
  test("write and read a small value after split", async () => {
    radisk("small", "small value")

    const immediateValue = await new Promise((resolve, reject) => {
      radisk("small", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(immediateValue).toBe("small value")

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F"valueA\x1F\n' +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F"valueC\x1F\n',
      newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"' + big + "\x1F\n",
      small: '\x1F+0\x1F#\x1F"small\x1F=\x1F"small value\x1F\n',
    })
  })

  // This tests how existing files are handled when they are made smaller than
  // the maximum file size. (They should be kept as they are created so that
  // we don't have to deal with removing files.)
  test("write small value to newFile", async () => {
    radisk("newFile", "removed...")

    const immediateValue = await new Promise((resolve, reject) => {
      radisk("newFile", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(immediateValue).toBe("removed...")

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F"valueA\x1F\n' +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F"valueC\x1F\n',
      newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"removed...\x1F\n',
      small: '\x1F+0\x1F#\x1F"small\x1F=\x1F"small value\x1F\n',
    })
  })

  // This tests ignoring the maximum file size when writing sub-keys. Since
  // radisk.write has already been called for a key it would previously get
  // duplicated when trying to split due to reaching the max length.
  test("write big value to first file", async () => {
    radisk("keyA", big)

    const immediateValue = await new Promise((resolve, reject) => {
      radisk("keyA", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(immediateValue).toBe(big)

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F"' +
        big +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F"valueC\x1F\n',
      newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"removed...\x1F\n',
      small: '\x1F+0\x1F#\x1F"small\x1F=\x1F"small value\x1F\n',
    })
  })

  test("add to last file", async () => {
    radisk("smallContinued", "continued value")

    const immediateValue = await new Promise((resolve, reject) => {
      radisk("smallContinued", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(immediateValue).toBe("continued value")

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F"' +
        big +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F"valueC\x1F\n',
      newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"removed...\x1F\n',
      small:
        '\x1F+0\x1F#\x1F"small\x1F=\x1F"small value\x1F\n' +
        '\x1F+1\x1F#\x1F"Continued\x1F=\x1F"continued value\x1F\n',
    })
  })

  test("set a key to null and add a value to that file", async () => {
    radisk("keyC", null)

    const nullValue = await new Promise((resolve, reject) => {
      radisk("keyC", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(nullValue).toBe(null)

    radisk("keyD", "valueD")

    const dValue = await new Promise((resolve, reject) => {
      radisk("keyD", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(dValue).toBe("valueD")

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F"' +
        big +
        "\x1F\n" +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F \x1F\n' +
        '\x1F+1\x1F#\x1F"D\x1F=\x1F"valueD\x1F\n',
      newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"removed...\x1F\n',
      small:
        '\x1F+0\x1F#\x1F"small\x1F=\x1F"small value\x1F\n' +
        '\x1F+1\x1F#\x1F"Continued\x1F=\x1F"continued value\x1F\n',
    })
  })

  test("set first keys to null", async () => {
    radisk("key", null)

    const keyValue = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(keyValue).toBe(null)

    radisk("keyA", null)

    const keyAValue = await new Promise((resolve, reject) => {
      radisk("keyA", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(keyAValue).toBe(null)

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(puts).toEqual({
      "!":
        '\x1F+0\x1F#\x1F"key\x1F=\x1F \x1F\n' +
        '\x1F+1\x1F#\x1F"A\x1F=\x1F \x1F\n' +
        '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
        '\x1F+1\x1F#\x1F"C\x1F=\x1F \x1F\n' +
        '\x1F+1\x1F#\x1F"D\x1F=\x1F"valueD\x1F\n',
      newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"removed...\x1F\n',
      small:
        '\x1F+0\x1F#\x1F"small\x1F=\x1F"small value\x1F\n' +
        '\x1F+1\x1F#\x1F"Continued\x1F=\x1F"continued value\x1F\n',
    })
  })
})
