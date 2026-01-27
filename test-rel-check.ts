import * as utils from "./src/utils"

const testCases = [
  { "#": "author123" },
  { "#": "author123", extra: "field" },
  { title: "Test" },
  "just a string",
  42,
  null,
]

for (const test of testCases) {
  const isRel = utils.rel.is(test as any)
  const isObj = utils.obj.is(test)
  console.log("Value:", JSON.stringify(test))
  console.log("  utils.rel.is():", isRel)
  console.log("  utils.obj.is():", isObj)
  console.log("  Condition (isObj && !isRel):", isObj && !isRel)
  console.log()
}
