import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect } from "bun:test"
import User from "../src/user"
import type { UserInterface } from "../src/schemas"

describe("user", () => {
  const wss: Server = new Server("ws://localhost:9013")
  const user: UserInterface = User({ file: "test/user", wss: wss, maxAge: 100, wait: 500 } as any)

  test("create", async () => {
    const err = await new Promise(resolve => user.create("alice", "password", resolve))
    expect(err).toBe(null)
  })

  test("create no username", async () => {
    const err = await new Promise(resolve => user.create("", "password", resolve))
    expect(err).toBe("Please provide a username")
  })

  test("create no password", async () => {
    const err = await new Promise(resolve => user.create("alice", "", resolve))
    expect(err).toBe("Please provide a password")
  })

  test("username already exists", async () => {
    const err = await new Promise(resolve => user.create("alice", "password", resolve))
    expect(err).toBe("Username already exists")
  })

  test("user is already being created", async () => {
    const promise1 = new Promise(resolve => user.create("bob", "password", resolve))
    const promise2 = new Promise(resolve => user.create("bob", "password", resolve))

    const [err1, err2] = await Promise.all([promise1, promise2])
    expect(err1).toBe(null)
    expect(err2).toBe("User is already being created")
  })

  test("auth", async () => {
    const err = await new Promise(resolve => user.auth("alice", "password", resolve))
    expect(err).toBe(null)
    expect(user.is?.username).toBe("alice")
  })

  test("auth no username", async () => {
    const err = await new Promise(resolve => user.auth("", "password", resolve))
    expect(err).toBe("Please provide a username")
    expect(user.is).toBe(null)
  })

  test("auth no password", async () => {
    const err = await new Promise(resolve => user.auth("alice", "", resolve))
    expect(err).toBe("Please provide a password")
    expect(user.is).toBe(null)
  })

  test("auth wrong username", async () => {
    const err = await new Promise(resolve => user.auth("wrong", "password", resolve))
    expect(err).toBe("Wrong username or password")
    expect(user.is).toBe(null)
  }, 15000)

  test("auth wrong password", async () => {
    const err = await new Promise(resolve => user.auth("alice", "wrong", resolve))
    expect(err).toBe("Wrong username or password")
    expect(user.is).toBe(null)
  })

  test("user is already authenticating", async () => {
    const promise1 = new Promise(resolve => user.auth("bob", "password", resolve))
    const promise2 = new Promise(resolve => user.auth("bob", "password", resolve))

    const [err1, err2] = await Promise.all([promise1, promise2])
    expect(err1).toBe(null)
    expect(user.is?.username).toBe("bob")
    expect(err2).toBe("User is already authenticating")
  })

  test("change", async () => {
    const err = await new Promise(resolve =>
      user.change("alice", "password", "new password", resolve)
    )
    expect(err).toBe(null)
    expect(user.is?.username).toBe("alice")
  })

  test("change no username", async () => {
    const err = await new Promise(resolve => user.change("", "password", "new password", resolve))
    expect(err).toBe("Please provide a username")
    expect(user.is).toBe(null)
  })

  test("change no password", async () => {
    const err = await new Promise(resolve =>
      user.change("alice", "", "new password", resolve)
    )
    expect(err).toBe("Please provide a password")
    expect(user.is).toBe(null)
  })

  test("change no new password", async () => {
    const err = await new Promise(resolve => user.change("alice", "password", "", resolve))
    expect(err).toBe("Please provide a new password")
    expect(user.is).toBe(null)
  })

  test("check password change and leave", async () => {
    const err = await new Promise(resolve => user.auth("alice", "new password", resolve))
    expect(err).toBe(null)
    expect(user.is?.username).toBe("alice")
    user.leave()
    expect(user.is).toBe(null)
  })

  test("delete wrong password", async () => {
    const err = await new Promise(resolve => user.delete("alice", "password", resolve))
    expect(err).toBe("Wrong username or password")
    expect(user.is).toBe(null)
  })

  test("delete", async () => {
    const err = await new Promise(resolve => user.delete("alice", "new password", resolve))
    expect(err).toBe(null)
    expect(user.is).toBe(null)
  })

  test("auth after delete", async () => {
    const err = await new Promise(resolve => user.auth("alice", "new password", resolve))
    expect(err).toBe("Wrong username or password")
    expect(user.is).toBe(null)
  })

  test("cleanup", async () => {
    await fs.promises.rm("test/user", { recursive: true, force: true })
  })
})
