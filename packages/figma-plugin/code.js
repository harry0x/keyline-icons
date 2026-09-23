// The plugin's main thread. It owns the document and nothing else.
//
// Search, ranking and the grid all live in ui.html, because the iframe is the
// only side with a DOM and the only side that can reach the network: this
// sandbox has no `fetch`. So the set never passes through here. The UI hands
// over one assembled SVG per insert and this side decides where it lands.

figma.showUI(__html__, { width: 400, height: 560, themeColors: true })

/**
 * Figma's SVG importer does not resolve `currentColor`. It is a CSS keyword with
 * no cascade to resolve against once the markup leaves a page, so every path
 * arrives unpainted and the insert looks empty. The exports carry it on purpose,
 * it is what makes an icon take the colour of the text around it, so it is
 * swapped for real ink on the way onto the canvas.
 */
const INK = "#000000"

/**
 * The panel's own settings, under one key: style, corners, insert size and the
 * names inserted most recently.
 *
 * Nothing in here is read from the document. It is what the panel was set to
 * and which of the set's own names were picked, kept on this machine by Figma
 * so the next run opens where the last one left off.
 */
const PREFS = "prefs"

/**
 * The sizes the panel offers. Anything else in a message is ignored rather than
 * trusted, and a drawing arrives at its own 24.
 */
const SIZES = [16, 20, 24, 32]

/**
 * Every node this plugin has inserted this session, by id.
 *
 * A plain object rather than a Set because the ids are only ever read back by
 * `parentFor`, and it needs one lookup per insert. Stale entries from deleted
 * nodes cost nothing: an id that no longer resolves is never the current
 * selection.
 */
const OURS = Object.create(null)

/**
 * Whether a node is an icon rather than a place to put one.
 *
 * `OURS` knows this session's inserts and nothing older, and a drop picks its
 * parent by whatever is under the pointer, so yesterday's icons became easy
 * targets: let go over one and the new icon went inside it. So an icon is also
 * recognised by its shape. A frame with no fill of its own, square, no bigger
 * than the largest insert, holding nothing but vector ink, is what an SVG
 * import produces, ours or any other set's, and nobody means to put an icon
 * inside another one.
 *
 * Frames only. A component that size is someone's own icon component, and
 * building one by dropping a drawing into it is a thing people do.
 */
const INK_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "GROUP", "ELLIPSE", "RECTANGLE", "LINE", "POLYGON", "STAR"])

function isIcon(node) {
  if (OURS[node.id]) return true
  return (
    node.type === "FRAME" &&
    node.width === node.height &&
    node.width <= 48 &&
    Array.isArray(node.fills) &&
    node.fills.every((paint) => paint.visible === false) &&
    node.children.length > 0 &&
    node.children.every((child) => INK_TYPES.has(child.type))
  )
}

/**
 * Where an icon may go, starting from what the user pointed at.
 *
 * Only FRAME and COMPONENT are accepted as parents. Both establish a coordinate
 * space, so `x`/`y` mean what they look like they mean. A section's children
 * keep absolute page coordinates and an instance refuses `appendChild`
 * altogether, so those fall through to the page rather than landing somewhere
 * surprising.
 *
 * Step out of our own icons first.
 *
 * An inserted icon is a 24x24 frame and it stays selected, so clicking two icons
 * in a row put the second one inside the first, centred at 0,0, where it sat
 * exactly on top and showed up only in the layer tree. Twenty in a row nested
 * twenty deep. Its parent is what the user actually meant: a second icon lands
 * beside the first, in the same frame, or on the page if the first was on the
 * page. An icon is never a useful container, so this applies however the node
 * got there, this session or an earlier one (see `isIcon`), and to a drop on
 * one as much as to a click with one selected.
 *
 * FigJam never had this. An insert becomes a group there, and a group is not an
 * accepted parent, so the second icon already fell through.
 */
function parentFor(node) {
  while (node && node.type !== "PAGE" && isIcon(node)) node = node.parent
  return node && (node.type === "FRAME" || node.type === "COMPONENT") ? node : null
}

/**
 * Put `node` in `box` with its centre at `x`, `y` in the box's own coordinates,
 * or on the page at page coordinates when there is no box.
 *
 * A frame that is part of an instance still reads as FRAME and still refuses a
 * child, so the append is tried rather than predicted, and a refusal lands the
 * icon on the page at the same point instead of failing the insert.
 */
function putAt(node, box, x, y) {
  if (box) {
    try {
      box.appendChild(node)
      node.x = Math.round(x - node.width / 2)
      node.y = Math.round(y - node.height / 2)
      return
    } catch (refused) {
      const [[, , left], [, , top]] = box.absoluteTransform
      x += left
      y += top
    }
  }
  figma.currentPage.appendChild(node)
  node.x = Math.round(x - node.width / 2)
  node.y = Math.round(y - node.height / 2)
}

/**
 * Centre the node in the selected frame, or in the viewport when nothing usable
 * is selected.
 */
function place(node) {
  const box = parentFor(figma.currentPage.selection[0])
  if (box) putAt(node, box, box.width / 2, box.height / 2)
  else putAt(node, null, figma.viewport.center.x, figma.viewport.center.y)
}

/**
 * Put a dragged icon where the pointer let go of it.
 *
 * Figma hands over the node the drop landed on, the point in that node's own
 * coordinates, and the point on the canvas. When the landing node is the parent
 * it keeps Figma's own `x`/`y`, which already account for rotation. When the
 * parent had to be walked up to, the canvas point is taken back into it by its
 * translation alone: a rotated frame holding a dropped icon is rare enough that
 * a small offset beats the matrix algebra. An auto-layout parent takes the drop
 * in the slot under the pointer instead, see `slotAt`.
 */
function drop(node, event) {
  const box = parentFor(event.node)
  if (!box) return putAt(node, null, event.absoluteX, event.absoluteY)
  let x = event.x
  let y = event.y
  if (box !== event.node) {
    const [[, , left], [, , top]] = box.absoluteTransform
    x = event.absoluteX - left
    y = event.absoluteY - top
  }
  if (box.layoutMode === "HORIZONTAL" || box.layoutMode === "VERTICAL") {
    return slotAt(node, box, x, y) || putAt(node, null, event.absoluteX, event.absoluteY)
  }
  putAt(node, box, x, y)
}

/**
 * An auto-layout frame places its children itself and ignores `x` and `y`, so
 * "where it was let go" there means between which two children. Appended, a
 * drop between the first two items of a toolbar landed after the last.
 *
 * The slot is the first child whose middle lies past the pointer along the
 * layout's axis, or on a later row when the layout wraps. Children positioned
 * absolutely are out of the flow and are skipped. Returns false when the frame
 * refuses the child, so the caller can put it on the page instead.
 */
function slotAt(node, box, x, y) {
  const across = box.layoutMode === "HORIZONTAL"
  const wraps = box.layoutWrap === "WRAP"
  const index = box.children.findIndex((child) => {
    if (child.layoutPositioning === "ABSOLUTE") return false
    if (across && wraps && y < child.y) return true
    if (across && wraps && y > child.y + child.height) return false
    return across ? x < child.x + child.width / 2 : y < child.y + child.height / 2
  })
  try {
    if (index === -1) box.appendChild(node)
    else box.insertChild(index, node)
    return true
  } catch (refused) {
    return false
  }
}

/**
 * Dissolve the wrapper frame into a group, which is what FigJam needs.
 *
 * The frame is why colour did not work there. Picking a colour with a frame
 * selected paints the frame's own background, so the drawing never changed and
 * a coloured square appeared around it instead. Duotone read as "not editable
 * at all", because every attempt landed on the wrapper. One cause, both
 * symptoms.
 *
 * A group has no fill of its own, so the colour reaches the paths, and duotone
 * keeps both tones because each path carries its own opacity.
 *
 * Flattening was the other option and is wrong: it merges every path into one
 * shape, so duotone's 40% plate and the line above it become a single tone. The
 * style would not survive its own insert.
 */
function toGroup(frame, name) {
  const parent = frame.parent
  const index = parent.children.indexOf(frame)
  const group = figma.group([...frame.children], parent, index)
  group.name = name
  frame.remove()
  return group
}

/**
 * One icon, from the SVG the panel assembled, at the size it was set to.
 *
 * Scaled after import with `rescale`, which is Figma's scale tool: the stroke
 * scales with the drawing, so a 16 is the 24 made smaller, 1.33 wide, exactly
 * what the React component draws at `size={16}`. Resizing the frame instead
 * would keep a 2px line on a 16px icon, which is a heavier drawing, not a
 * smaller one.
 */
function build(msg) {
  const frame = figma.createNodeFromSvg(String(msg.svg).replace(/currentColor/g, INK))
  // Figma names the import `svg`. The icon name is the only useful label, and it
  // is what a later export or a Code Connect mapping reads back.
  frame.name = String(msg.name)

  /**
   * The wrapper arrives with a white fill, which the drawing does not carry:
   * the SVG root says `fill="none"`. Invisible on a white canvas and a white
   * square everywhere else, so it survives every test done on a default page.
   */
  if ("fills" in frame) frame.fills = []

  const size = Number(msg.size)
  if (SIZES.includes(size) && size !== 24) frame.rescale(size / 24)
  return frame
}

/**
 * The frame survives in a design file and is dissolved in FigJam, which is not
 * a hedge: the two editors want different things and only one of them has a
 * problem.
 *
 * A design file wants the box. It is what makes a row of inserted icons line
 * up, and dropping it would hand back a group sized to the ink instead, so
 * `check` would arrive as roughly 14×10 and align with nothing. Colour is
 * already fine there, because the design panel lists every distinct colour in
 * the selection and edits each one, which is how duotone's two tones showed as
 * 100% and 40% and stayed editable.
 *
 * FigJam has neither the alignment discipline that makes the box worth keeping
 * nor the panel that makes the frame survivable. Its colour control is one
 * swatch, and one swatch aimed at a frame paints the frame.
 */
function finish(frame) {
  const node = figma.editorType === "figjam" ? toGroup(frame, frame.name) : frame

  // After toGroup, so FigJam registers the group rather than the frame it
  // dissolved. Registering the wrong one would leave the real node unrecognised.
  OURS[node.id] = true

  figma.currentPage.selection = [node]
  figma.notify(`Inserted ${node.name}`)
}

figma.ui.onmessage = (msg) => {
  if (!msg) return

  // The panel asks once it is listening, so the answer cannot arrive before it
  // can be heard. Always answered, even with nothing stored, because the panel
  // holds its first render until it knows.
  if (msg.type === "ready") {
    figma.clientStorage
      .getAsync(PREFS)
      .then((value) => figma.ui.postMessage({ type: "prefs", value: value || null }))
      .catch(() => figma.ui.postMessage({ type: "prefs", value: null }))
    return
  }

  if (msg.type === "prefs") {
    figma.clientStorage.setAsync(PREFS, msg.value).catch(() => {})
    return
  }

  if (msg.type !== "insert") return
  const frame = build(msg)
  place(frame)
  finish(frame)
}

/**
 * A tile dragged out of the panel.
 *
 * Only drops the panel started carry this plugin's metadata, and anything else
 * is left to Figma: returning nothing lets its own handling run, which is what
 * someone dropping a file on the canvas while the panel is open expects.
 */
figma.on("drop", (event) => {
  const meta = event.dropMetadata
  if (!meta || meta.type !== "keyline-icon" || typeof meta.svg !== "string") return

  const frame = build(meta)
  drop(frame, event)
  finish(frame)
  return false
})
