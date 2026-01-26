import { describe, test, expect } from "bun:test"
import Radix from "../src/radix"
import type { RadixFunction, EncodedValue } from "../src/schemas"
import Names from "./names"

const names: string[] = Names()

// ASCII character for group separator.
const group = String.fromCharCode(29)
// ASCII character for record separator.
const record = String.fromCharCode(30)

describe("radix", () => {
  const radix: RadixFunction = Radix()

  test("unit", () => {
    radix("asdf.pub", "yum")
    radix("ablah", "cool")
    radix("abc", { yes: 1 })
    radix("node/circle.bob", "awesome")

    expect(radix("asdf.")).toEqual({ pub: { [record]: "yum" } })
    expect(radix("nv/foo.bar")).toBe(undefined)
    expect(radix("ablah")).toBe("cool")
    expect(radix("abc")).toEqual({ yes: 1 })
    expect(radix("abcd")).toBe(undefined)
    expect(radix()).toEqual({
      a: {
        [group]: {
          "sdf.pub": { [record]: "yum" },
          b: {
            [group]: {
              c: {
                [record]: {
                  yes: 1,
                },
              },
              lah: {
                [record]: "cool",
              },
            },
          },
        },
      },
      "node/circle.bob": { [record]: "awesome" },
    })
  })

  test("replace", () => {
    radix("asdf.pub", "yuck")
    radix("ablah", "cool!")
    radix("abc", { yes: 2 })
    radix("node/circle.bob", "awe")
    radix("abcd", true)

    expect(radix("asdf.")).toEqual({ pub: { [record]: "yuck" } })
    expect(radix("ablah")).toBe("cool!")
    expect(radix("nv/foo.bar")).toBe(undefined)
    expect(radix("abc")).toEqual({ yes: 2 })
    expect(radix("abcd")).toBe(true)
    expect(radix()).toEqual({
      a: {
        [group]: {
          "sdf.pub": { [record]: "yuck" },
          b: {
            [group]: {
              c: {
                [group]: {
                  d: {
                    [record]: true,
                  },
                },
                [record]: {
                  yes: 2,
                },
              },
              lah: {
                [record]: "cool!",
              },
            },
          },
        },
      },
      "node/circle.bob": { [record]: "awe" },
    })
  })

  test("radix write read", () => {
    // Add some shorter values to also force group matching in Radix.map.
    radix("A", 1)
    radix("Be", 2)
    radix("Bo", 3)
    radix("L", 4)
    radix("Mi", 5)
    const all: Record<string, number> = {}
    names.forEach((value: string, index: number) => {
      all[value] = index
      radix(value, index)
    })
    expect(Object.keys(all)).toHaveLength(names.length)
    Radix.map(radix, (value: EncodedValue, key: string) => {
      delete all[key]
    })
    expect(Object.keys(all)).toHaveLength(0)
  })

  test("radix read again", () => {
    const all: Record<string, number> = {}
    names.forEach((value: string, index: number) => {
      all[value] = index
    })
    expect(Object.keys(all)).toHaveLength(names.length)
    Radix.map(radix, (value: EncodedValue, key: string) => {
      delete all[key]
    })
    expect(Object.keys(all)).toHaveLength(0)
  })
})

