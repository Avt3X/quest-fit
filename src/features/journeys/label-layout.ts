// Places checkpoint labels on the journey map so each label reads as belonging to its own dot.
// Text width is estimated (SVG has no layout pass), so boxes carry a small margin.
//
// Candidate spots around a dot are scored; a label is placed at the first spot with no conflict.
// Important labels (start, finish, last reached, next) are placed first and are never dropped:
// when every spot conflicts they take the least bad one. Conflict weights, worst first: covering
// another label, covering another checkpoint, sitting as close to another checkpoint as to its own
// (ambiguous), covering the progress marker (labels are outlined and drawn on top, so that stays
// readable).

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type TextAnchor = 'start' | 'middle' | 'end';

export interface LabelInput {
  id: string;
  text: string;
  x: number;
  y: number;
  important: boolean;
}

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  anchor: TextAnchor;
  box: Box;
}

export interface LabelLayoutOptions {
  width: number;
  height: number;
  fontSize: number;
  /** Things labels should avoid besides the checkpoint dots, e.g. the progress marker. */
  obstacles?: readonly { x: number; y: number; r: number }[];
}

const DOT_R = 8;
const GAP = 10;
const AMBIGUITY_MARGIN = 4;
const WEIGHT = { label: 8, dot: 4, ambiguous: 3, obstacle: 1 };

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function distanceToBox(p: { x: number; y: number }, b: Box): number {
  const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1);
  const dy = Math.max(b.y0 - p.y, 0, p.y - b.y1);
  return Math.hypot(dx, dy);
}

function circleBox(x: number, y: number, r: number): Box {
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
}

function candidates(l: LabelInput, fontSize: number): PlacedLabel[] {
  const w = l.text.length * fontSize * 0.58 + 4;
  const ascent = fontSize * 0.8;
  const descent = fontSize * 0.25;
  const spot = (x: number, baseline: number, anchor: TextAnchor): PlacedLabel => {
    const x0 = anchor === 'start' ? x - 2 : anchor === 'end' ? x - w + 2 : x - w / 2;
    return { id: l.id, x, y: baseline, anchor, box: { x0, y0: baseline - ascent, x1: x0 + w, y1: baseline + descent } };
  };
  const midline = l.y + (ascent - descent) / 2;
  const above = l.y - DOT_R - descent;
  const below = l.y + DOT_R + ascent;
  return [
    spot(l.x + GAP, midline, 'start'),
    spot(l.x - GAP, midline, 'end'),
    spot(l.x, l.y - GAP - descent, 'middle'),
    spot(l.x, l.y + GAP + ascent, 'middle'),
    spot(l.x + DOT_R, below, 'start'),
    spot(l.x + DOT_R, above, 'start'),
    spot(l.x - DOT_R, below, 'end'),
    spot(l.x - DOT_R, above, 'end'),
  ];
}

export function layoutLabels(labels: readonly LabelInput[], options: LabelLayoutOptions): PlacedLabel[] {
  const { width, height, fontSize } = options;
  const obstacles = (options.obstacles ?? []).map((o) => circleBox(o.x, o.y, o.r));
  const inBounds = (b: Box) => b.x0 >= 2 && b.y0 >= 2 && b.x1 <= width - 2 && b.y1 <= height - 2;
  const order = labels
    .map((l, i) => ({ l, i }))
    .sort((a, b) => Number(b.l.important) - Number(a.l.important) || a.i - b.i);

  const placed: PlacedLabel[] = [];
  for (const { l } of order) {
    const others = labels.filter((o) => o.id !== l.id);
    let best: PlacedLabel | null = null;
    let bestScore = Infinity;
    for (const c of candidates(l, fontSize)) {
      if (!inBounds(c.box)) continue;
      const own = distanceToBox(l, c.box);
      const score =
        WEIGHT.label * placed.filter((p) => boxesOverlap(p.box, c.box)).length +
        WEIGHT.dot * others.filter((o) => boxesOverlap(circleBox(o.x, o.y, DOT_R), c.box)).length +
        WEIGHT.ambiguous * others.filter((o) => distanceToBox(o, c.box) <= own + AMBIGUITY_MARGIN).length +
        WEIGHT.obstacle * obstacles.filter((o) => boxesOverlap(o, c.box)).length;
      if (score < bestScore) {
        best = c;
        bestScore = score;
      }
      if (score === 0) break;
    }
    if (best && (bestScore === 0 || l.important)) placed.push(best);
  }
  return placed;
}
