/**
 * The site's shelves, read by the pipeline scripts that cannot import them.
 *
 * `lib/icon-taxonomy.ts` holds the category table and `components/icon-browser.tsx`
 * holds the glyph each shelf is drawn with on the rail. Both are TypeScript, and
 * the Paper boards and the data bundles are built by plain node, so the two are
 * parsed here rather than copied. A second copy of forty patterns is a second
 * thing to keep in step, and the one that drifts is always the copy nobody
 * renders.
 *
 * One parser for every script. `build-paper.mjs` carried its own until the
 * Figma plugin needed the same table; two parsers of one block is the drift
 * this file exists to avoid, one level down.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

/** The catch-all label, which the table keys by constant rather than writes out. */
export const OTHER = "Other"

/**
 * The category table, in resolution order, as `{ label, match, blurb }`.
 *
 * The guard is the label count: every entry declares a `label`, so a `match`
 * this parse fails to pick up shows as a pair count short of the labels, and the
 * script stops. Without it a regex written across two lines would silently hand
 * its whole category to Other, which looks like a grouping decision rather than
 * a broken read.
 */
export async function categories(root) {
  const src = await readFile(join(root, "lib", "icon-taxonomy.ts"), "utf8")
  const start = src.indexOf("export const CATEGORIES")
  if (start < 0) throw new Error("lib/icon-taxonomy.ts: no CATEGORIES export")
  const block = src
    .slice(start, src.indexOf("\n]", start))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")

  const labels = [...block.matchAll(/label:\s*"([^"]+)"/g)].length
  const pairs = [
    ...block.matchAll(
      /label:\s*"([^"]+)",\s*match:\s*(\/(?:[^/\\\n]|\\.)+\/),\s*blurb:\s*"([^"]+)"/g
    ),
  ].map(([, label, re, blurb]) => ({ label, match: new RegExp(re.slice(1, -1)), blurb }))

  if (pairs.length !== labels) {
    throw new Error(
      `lib/icon-taxonomy.ts: read ${pairs.length} of ${labels} categories. ` +
        `A match pattern has moved off its label's line; fix this parse rather ` +
        `than letting the difference fall into Other.`
    )
  }
  return pairs
}

/**
 * The drawing each shelf is shown with on the site's rail, by label, as an icon
 * name.
 *
 * The rail writes them as components, `Finance: Wallet`, so each is turned back
 * into a name through the rule `build-react.mjs` names components by. That is
 * matched against the set rather than un-cased, because `BarChart2` could be
 * `bar-chart-2` or `bar-chart2` and only the set knows which exists.
 *
 * Throws on a row whose component is not in the set. A label with no row at all
 * is the caller's to catch, since only the caller knows which labels hold
 * anything: `build-data.mjs` fails on a shelf with names and no glyph, for the
 * reason `check-categories.mjs` gives, and on the plugin's side there is no
 * build to catch it, only an installed copy reading whatever the CDN hands it.
 */
export async function shelfGlyphs(root, names) {
  const src = await readFile(join(root, "components", "icon-browser.tsx"), "utf8")
  const start = src.indexOf("const CATEGORY_ICONS")
  const end = src.indexOf("const ALL_ICON")
  if (start < 0 || end < 0) {
    throw new Error("components/icon-browser.tsx: no CATEGORY_ICONS block")
  }
  const block = src.slice(start, end).replace(/\/\/[^\n]*/g, "")

  const pascal = (name) =>
    name
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("")
  const byComponent = new Map([...names].map((name) => [pascal(name), name]))

  const glyphs = {}
  for (const [, quoted, bare, component] of block.matchAll(
    /^ {2}(?:"([^"]+)"|\[OTHER_CATEGORY\]|([A-Za-z][A-Za-z0-9]*)):\s*([A-Za-z][A-Za-z0-9]*),/gm
  )) {
    const label = quoted ?? bare ?? OTHER
    const name = byComponent.get(component)
    if (!name) {
      throw new Error(
        `components/icon-browser.tsx: CATEGORY_ICONS draws ${label} with ` +
          `${component}, which is not a component the set exports.`
      )
    }
    glyphs[label] = name
  }
  return glyphs
}
