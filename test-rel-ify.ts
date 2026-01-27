import * as utils from "./src/utils"

const tests = [
  "myauthor",
  "author123",
  "testpost",
  "",
  null,
]

for (const test of tests) {
  const result = utils.rel.ify(test as any)
  console.log(`utils.rel.ify(${JSON.stringify(test)}):`, JSON.stringify(result))
}
