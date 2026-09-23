import * as React from "react"

/**
 * Marks which ends of a scroller have more behind them, for `.edge-fade`.
 *
 * Written straight onto the element as `data-fade-top` and `data-fade-bottom`
 * rather than kept in state: it runs on every scroll frame, and a re-render of
 * the whole browser per frame is a poor price for two booleans.
 *
 * The children are observed as well as the scroller, because the scroller's
 * own box does not change when a row is added or dropped inside it, only its
 * `scrollHeight` does, and nothing fires for that.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      el.toggleAttribute("data-fade-top", el.scrollTop > 1)
      el.toggleAttribute(
        "data-fade-bottom",
        el.scrollTop + el.clientHeight < el.scrollHeight - 1
      )
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(el)
    for (const child of el.children) resize.observe(child)
    return () => {
      el.removeEventListener("scroll", update)
      resize.disconnect()
    }
  }, [])

  return ref
}
