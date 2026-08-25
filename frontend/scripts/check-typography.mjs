import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const sourceRoot = path.resolve("frontend/src")
const violations = []

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await visit(filePath)
      continue
    }
    if (!/\.(css|tsx|ts)$/.test(entry.name)) continue
    const source = await readFile(filePath, "utf8")
    const lines = source.split("\n")
    lines.forEach((line, index) => {
      const numericWeights = [...line.matchAll(/font(?:-weight)?\s*:\s*(\d{3})\b/g)]
      for (const match of numericWeights) {
        if (Number(match[1]) > 500) violations.push(`${path.relative(process.cwd(), filePath)}:${index + 1}: ${match[0]}`)
      }
      const inlineWeights = [...line.matchAll(/fontWeight\s*:\s*["']?(\d{3})\b/g)]
      for (const match of inlineWeights) {
        if (Number(match[1]) > 500) violations.push(`${path.relative(process.cwd(), filePath)}:${index + 1}: ${match[0]}`)
      }
      if (/font-weight\s*:\s*(?:bold|bolder)\b/.test(line)) {
        violations.push(`${path.relative(process.cwd(), filePath)}:${index + 1}: keyword weight exceeds the typography contract`)
      }
      if (/\bfont-(?:semibold|bold|extrabold|black)\b/.test(line)) {
        violations.push(`${path.relative(process.cwd(), filePath)}:${index + 1}: Tailwind weight exceeds font-medium`)
      }
    })
  }
}

await visit(sourceRoot)

if (violations.length) {
  console.error("Auvi Studio typography must use semantic weights no heavier than 500:\n")
  console.error(violations.join("\n"))
  process.exit(1)
}

console.log("Typography contract: all interface weights are 500 or lighter.")
