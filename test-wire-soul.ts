import Holster from "./src/holster"

const db = Holster({ file: "test-wire-soul", port: 9997 })

console.log("Storing post with author reference...")
let postSoul: string | null = null

db.wire.put({
  "testpost-soul": {
    _: { "#": "testpost-soul", ">": { title: Date.now(), author: Date.now() } },
    title: "Test Post",
    author: { "#": "testauthor-soul" },
  }
}, err => {
  console.log("Wire.put result:", err || "success")
})

await new Promise(r => setTimeout(r, 200))

console.log("\nReading back...")
db.wire.get({ "#": "testpost-soul" }, msg => {
  console.log("Wire.get result:", JSON.stringify(msg, null, 2))
  process.exit(0)
})
