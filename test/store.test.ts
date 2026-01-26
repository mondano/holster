import { describe, test, expect } from "bun:test"
import Store from "../src/store"
import type { Graph, Lex, StoreInterface } from "../src/schemas"
import fs from "fs"

describe("store", () => {
  const kitty: StoreInterface = Store({ file: "test/kitty" })
  const multiple: StoreInterface = Store({ file: "test/multiple", size: 100 } as any)
  const special: StoreInterface = Store({ file: "test/special" })
  const newFileValue =
    "file size is only 100 bytes so writing this value requires calling slice"

  test("get graph", async () => {
    const { err, value } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      kitty.get({ "#": "FDSA" }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value).toEqual({
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
        slave: {
          "#": "ASDF",
        },
        species: "felis silvestris",
      },
    })
  })

  test("get item", async () => {
    const { err, value } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      kitty.get(
        { "#": "FDSA", ".": "species" },
        (err: string | null | undefined, value: Graph | undefined) => resolve({ err, value })
      )
    )
    expect(value).toEqual({
      FDSA: {
        _: {
          "#": "FDSA",
          ">": {
            species: 2,
          },
        },
        species: "felis silvestris",
      },
    })
  })

  test("put keys to multiple files", async () => {
    const err = await new Promise<string | null | undefined>(resolve =>
      multiple.put(
        {
          keyA: {
            _: { "#": "keyA", ">": { value: 1 } },
            value: "valueA",
          },
          keyB: {
            _: { "#": "keyB", ">": { value: 1 } },
            value: "valueB",
          },
          keyC: {
            _: { "#": "keyC", ">": { value: 1, extraField: 1 } },
            value: "valueC",
            extraField: true,
          },
          newFile: {
            _: { "#": "newFile", ">": { value: 1 } },
            value: newFileValue,
          },
        },
        resolve
      )
    )
    expect(err).toBe(null)

    await fs.promises.access("test/multiple/!")
    await fs.promises.access("test/multiple/newFile")
  })

  test("get key from first file", async () => {
    const { err, value } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      multiple.get({ "#": "keyA" }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value).toEqual({
      keyA: {
        _: {
          "#": "keyA",
          ">": {
            value: 1,
          },
        },
        value: "valueA",
      },
    })
  })

  test("get another key from first file", async () => {
    const { value: value1 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      multiple.get({ "#": "keyC" }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value1).toEqual({
      keyC: {
        _: {
          "#": "keyC",
          ">": {
            extraField: 1,
            value: 1,
          },
        },
        extraField: true,
        value: "valueC",
      },
    })

    const { value: value2 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      multiple.get(
        { "#": "keyC", ".": "value" },
        (err: string | null | undefined, value: Graph | undefined) => resolve({ err, value })
      )
    )
    expect(value2).toEqual({
      keyC: {
        _: {
          "#": "keyC",
          ">": {
            value: 1,
          },
        },
        value: "valueC",
      },
    })
  })

  test("get key from second file", async () => {
    const { value } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      multiple.get(
        { "#": "newFile" },
        (err: string | null | undefined, value: Graph | undefined) => resolve({ err, value })
      )
    )
    expect(value).toEqual({
      newFile: {
        _: {
          "#": "newFile",
          ">": {
            value: 1,
          },
        },
        value: newFileValue,
      },
    })

    await fs.promises.rm("test/multiple", { recursive: true, force: true })
  })

  test("put keys with special characters", async () => {
    const err = await new Promise<string | null | undefined>(resolve =>
      special.put(
        {
          "#": {
            _: { "#": "#", ">": { value: 1 } },
            value: "ok got #",
          },
          ">": {
            _: { "#": ">", ">": { value: 1, extraField: 1 } },
            value: "ok got >",
            extraField: true,
          },
          ".": {
            _: { "#": ".", ">": { value: 1, extraField: 1 } },
            value: "ok got .",
            extraField: true,
          },
          "+": {
            _: { "#": "+", ">": { value: 1 } },
            value: "ok got +",
          },
          "[": {
            _: { "#": "[", ">": { value: 1 } },
            value: "ok got [",
          },
          ",": {
            _: { "#": ",", ">": { value: 1 } },
            value: "ok got ,",
          },
          '"': {
            _: { "#": '"', ">": { value: 1 } },
            value: 'ok got "',
          },
          _: {
            _: { "#": "_", ">": { value: 1 } },
            value: "ok got _",
          },
        },
        resolve
      )
    )
    expect(err).toBe(null)
    await fs.promises.access("test/special/!")
  })

  test("get keys with special characters", async () => {
    const { value: value1 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get({ "#": "#" }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value1).toEqual({
      "#": {
        _: {
          "#": "#",
          ">": {
            value: 1,
          },
        },
        value: "ok got #",
      },
    })

    const { value: value2 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get(
        { "#": ">", ".": "value" },
        (err: string | null | undefined, value: Graph | undefined) => resolve({ err, value })
      )
    )
    expect(value2).toEqual({
      ">": {
        _: {
          "#": ">",
          ">": {
            value: 1,
          },
        },
        value: "ok got >",
      },
    })

    const { value: value3 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get(
        { "#": ".", ".": "value" },
        (err: string | null | undefined, value: Graph | undefined) => resolve({ err, value })
      )
    )
    expect(value3).toEqual({
      ".": {
        _: {
          "#": ".",
          ">": {
            value: 1,
          },
        },
        value: "ok got .",
      },
    })

    const { value: value4 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get({ "#": "+" }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value4).toEqual({
      "+": {
        _: {
          "#": "+",
          ">": {
            value: 1,
          },
        },
        value: "ok got +",
      },
    })

    const { value: value5 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get({ "#": "[" }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value5).toEqual({
      "[": {
        _: {
          "#": "[",
          ">": {
            value: 1,
          },
        },
        value: "ok got [",
      },
    })

    const { value: value6 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get({ "#": "," }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value6).toEqual({
      ",": {
        _: {
          "#": ",",
          ">": {
            value: 1,
          },
        },
        value: "ok got ,",
      },
    })

    const { value: value7 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get({ "#": '"' }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value7).toEqual({
      '"': {
        _: {
          "#": '"',
          ">": {
            value: 1,
          },
        },
        value: 'ok got "',
      },
    })

    const { value: value8 } = await new Promise<{
      err: string | null | undefined
      value: Graph | undefined
    }>(resolve =>
      special.get({ "#": "_" }, (err: string | null | undefined, value: Graph | undefined) =>
        resolve({ err, value })
      )
    )
    expect(value8).toEqual({
      _: {
        _: {
          "#": "_",
          ">": {
            value: 1,
          },
        },
        value: "ok got _",
      },
    })

    await fs.promises.rm("test/special", { recursive: true, force: true })
  })
})
