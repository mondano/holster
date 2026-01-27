import Holster from "./src/holster"
import fs from "fs"

const db = Holster({ file: "test-check-root", port: 9994 })

await new Promise<void>(resolve => {
  db.get("mypost").put({ title: "Test", author: { "#": "myauthor" } }, () => resolve())
})

await new Promise(r => setTimeout(r, 500))

console.log("\n=== Contents of ! file ===")
const rootContent = fs.readFileSync("test-check-root/!", 'utf8')
console.log(rootContent)
console.log("\n=== EOF ===\n")

console.log("Now reading back via Holster:")
db.get("mypost", data => {
  console.log("Result:", JSON.stringify(data, null, 2))
  process.exit(0)
})
