import Holster from "./src/holster"
import fs from "fs"

const db = Holster({ file: "test-disk-check", port: 9996 })

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

// Wait for disk write
await new Promise(r => setTimeout(r, 300))

console.log("\nListing files:")
const files = fs.readdirSync("test-disk-check")
files.forEach(f => {
  console.log("  " + f)
  if (!f.startsWith(".") && f !== "!") {
    const content = fs.readFileSync(`test-disk-check/${f}`, 'utf8')
    console.log("    Preview:", content.substring(0, 200).replace(/\n/g, "\\n"))
  }
})

console.log("\nReading back via Holster:")
db.get("mypost", data => {
  console.log("Data:", JSON.stringify(data, null, 2))
  process.exit(0)
})
