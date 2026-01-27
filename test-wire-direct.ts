import Holster from "./src/holster"

const db = Holster({ file: "test-wire-direct", port: 9998 })

console.log("Storing post with author reference...")
await new Promise<void>(resolve => {
  db.get("testpost").put({
    title: "Test",
    author: { "#": "testauthor" },
  }, () => {
    console.log("Put completed")
    resolve()
  })
})

// Wait for storage
await new Promise(r => setTimeout(r, 200))

console.log("\nChecking what's in wire.get...")
db.wire.get({ "#": "root", ".": "testpost" }, msg => {
  console.log("Wire message:", JSON.stringify(msg, null, 2))
  
  if (msg.put) {
    for (const [soul, node] of Object.entries(msg.put)) {
      console.log(`\nSoul: ${soul}`)
      console.log("Node:", JSON.stringify(node, null, 2))
    }
  }
  process.exit(0)
})
