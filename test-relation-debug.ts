import Holster from "./src/holster"

const db = Holster({ file: "test-relation-debug", port: 9999 })

console.log("Step 1: Store author")
await new Promise<void>(resolve => {
  db.get("author123").put({ name: "Charlie" }, () => {
    console.log("✓ Author stored")
    resolve()
  })
})

console.log("\nStep 2: Store post with reference")
await new Promise<void>(resolve => {
  db.get("post456").put(
    {
      title: "Hello World",
      author: { "#": "author123" },
    },
    () => {
      console.log("✓ Post stored")
      resolve()
    }
  )
})

console.log("\nStep 3: Read post back using .get() with callback")
const postViaGet = await new Promise(resolve => {
  db.get("post456", data => {
    console.log("Get callback received:", JSON.stringify(data, null, 2))
    resolve(data)
  })
})

await new Promise(r => setTimeout(r, 100))

console.log("\nStep 4: Read post back using .on()")
const postViaOn = await new Promise(resolve => {
  db.get("post456").on(data => {
    console.log("On callback received:", JSON.stringify(data, null, 2))
    resolve(data)
  })
})

console.log("\n=== COMPARISON ===")
console.log("Via .get():", JSON.stringify(postViaGet))
console.log("Via .on():", JSON.stringify(postViaOn))

process.exit(0)
