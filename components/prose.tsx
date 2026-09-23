import type { ReactNode } from "react"

/**
 * Prose, with anything in backticks set as code.
 *
 * The one piece of inline markup a post has, and it exists for a single job:
 * an icon's name is a name, not an English word, and a sentence that says the
 * chain is link now reads as a sentence with a word missing. `link` does not.
 * It also settles `link-2` against a numeral, and `10/9` against a date.
 *
 * A split on backticks rather than a markdown parser, because that is the
 * whole grammar: odd segments are code, even ones are text, an unclosed
 * backtick leaves its tail as prose, and nothing else in a post is markup. A
 * parser here would accept emphasis and headings that the block types already
 * carry and that nothing renders.
 *
 * The changelog reads the same grammar, so a package name in a release note is
 * set the way an icon name is in a post, and one convention covers both.
 *
 * The code ink is the foreground against the muted paragraph it sits in, which
 * is what makes a name legible as a name without a tinted box behind every one
 * of them: a paragraph naming six icons would otherwise read as a row of
 * buttons.
 */
export function prose(text: string): ReactNode {
  const parts = text.split("`")
  if (parts.length < 2) return text
  return parts.map((part, i) =>
    i % 2 === 0 ? (
      part
    ) : (
      <code
        key={`${i}-${part}`}
        className="font-mono text-[0.9em] text-foreground"
      >
        {part}
      </code>
    )
  )
}
