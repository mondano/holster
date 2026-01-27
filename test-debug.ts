/**
 * Debug test to understand why .on() doesn't work for objects
 */

import Holster from "./src/holster"

console.log("\n=== Test 1: Primitive value (should work) ===")
const db1 = Holster({ file: "test-debug-1", port: 9990 })

// Set up listener FIRST
db1.get("key").on(data => {
  console.log("✓ Listener fired with:", data)
})

setTimeout(async () => {
  console.log("Putting primitive value...")
  await new Promise<void>(resolve => {
    db1.get("key").put("hello", () => {
      console.log("Put callback fired")
      resolve()
    })
  })

  console.log("\n=== Test 2: Object value (failing?) ===")
  const db2 = Holster({ file: "test-debug-2", port: 9991 })

  // Set up listener FIRST
  db2.get("user").on(data => {
    console.log("✓ Listener fired with:", data)
  })

  setTimeout(async () => {
    console.log("Putting object value...")
    await new Promise<void>(resolve => {
      db2.get("user").put({ name: "Alice" }, () => {
        console.log("Put callback fired")
        resolve()
      })
    })

    console.log("\n=== Test 3: Reading existing object (main issue) ===")
    const db3 = Holster({ file: "test-debug-3", port: 9992 })

    // Put FIRST
    console.log("Putting data first...")
    await new Promise<void>(resolve => {
      db3.get("item").put({ value: 42 }, () => {
        console.log("Put callback fired")
        resolve()
      })
    })

    console.log("Now setting up listener for existing data...")
    setTimeout(() => {
      db3.get("item").on(data => {
        console.log("✓ Listener fired with:", data)
      })

      console.log("Waiting 2 seconds for callback...")
      setTimeout(() => {
        console.log("❌ Listener never fired!")
        process.exit(1)
      }, 2000)
    }, 100)
  }, 300)
}, 300)
