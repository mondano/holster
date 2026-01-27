import Holster from "./src/holster"
import fs from "fs"

const db = Holster({ file: "test-wait-longer", port: 9995 })

console.log("Storing data...")
await new Promise<void>(resolve => {
  db.get("mypost").put({
    title: "Test Post",
    author: { "#": "myauthor" },
  }, () => {
    console.log("Put callback fired")
    resolve()
  })
})

console.log("Waiting 2 seconds for batch flush...")
await new Promise(r => setTimeout(r, 2000))

console.log("\nListing files:")
const files = fs.readdirSync("test-wait-longer")
console.log("Files:", files.filter(f => !f.startsWith(".")))

console.log("\nReading back:")
db.get("mypost", data => {
  console.log("Data:", JSON.stringify(data, null, 2))
  process.exit(0)
})
