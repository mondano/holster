import { describe, test, expect } from "bun:test"
import Radisk from "../src/radisk"
import type { RadiskInterface, RadiskOptions, EncodedValue } from "../src/schemas"

describe("radisk with cache", () => {
  const puts: Record<string, string> = {}
  const opt: RadiskOptions = {
    write: 1,
    batch: 2,
    size: 100,
    cache: true,
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

  test("write and read from memory with cache", async () => {
    radisk("key", "value", () => { })

    // Reading after write means radisk.batch is still available.
    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("value")
  })

  test("read from store with cache", async () => {
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

  test("write and read value with state and cache", async () => {
    radisk("key", ["value", 1234])
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(["value", 1234])
  })

  test("write and read a plain object with cache", async () => {
    radisk("key", { object: true })
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    // With cache enabled, we get the actual object back from memory
    expect(value).toEqual({ object: true })
  })

  test("write a plain object with state and cache", async () => {
    radisk("key", [{ object: true }, 1234])
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    // With cache enabled, we get the actual object back from memory
    expect(value).toEqual([{ object: true }, 1234])
  })

  test("write and read a soul relation with cache", async () => {
    const rel = { "#": "soul" }
    radisk("key", rel)
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(rel)
  })

  test("write and read a soul relation with state and cache", async () => {
    const rel: [{ "#": string }, number] = [{ "#": "soul" }, 1234]
    radisk("key", rel)
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(rel)
  })

  test("write and read value with newline and cache", async () => {
    radisk("key", "value\ncontinued")
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("value\ncontinued")
  })

  test("write and read value with newline and state and cache", async () => {
    radisk("key", ["value\ncontinued", 12345])
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("key", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toEqual(["value\ncontinued", 12345])
  })

  test("write more than batch size with cache", async () => {
    radisk("keyA", "valueA")
    radisk("keyB", "valueB")
    radisk("keyC", "valueC")
    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("keyA", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("valueA")
  })

  test("write and read value bigger than file size with cache", async () => {
    radisk("newFile", big)

    const immediateValue = await new Promise((resolve, reject) => {
      radisk("newFile", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(immediateValue).toBe(big)

    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("newFile", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe(big)
  })

  test("write and read a small value after split with cache", async () => {
    radisk("small", "small value")

    const value = await new Promise((resolve, reject) => {
      radisk("small", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("small value")

    await new Promise(resolve => setTimeout(resolve, 10))
  })

  test("write small value to newFile with cache", async () => {
    radisk("newFile", "removed...")

    const value = await new Promise((resolve, reject) => {
      radisk("newFile", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("removed...")

    await new Promise(resolve => setTimeout(resolve, 10))
  })

  test("write big value to first file with cache", async () => {
    radisk("keyA", big)

    const value = await new Promise((resolve, reject) => {
      radisk("keyA", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe(big)
  })

  test("add to last file with cache", async () => {
    await new Promise<void>((resolve) => {
      radisk("smallContinued", "continued value", () => resolve())
    })

    const immediateValue = await new Promise((resolve, reject) => {
      radisk("smallContinued", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(immediateValue).toBe("continued value")

    await new Promise(resolve => setTimeout(resolve, 10))

    const value = await new Promise((resolve, reject) => {
      radisk("smallContinued", (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
    expect(value).toBe("continued value")
  })

  test("set a key to null and add a value to that file with cache", async () => {
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
  })

  test("set first keys to null with cache", async () => {
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
  })
})
