import { type Box, type LabelInput, boxesOverlap, layoutLabels } from '../label-layout';

const options = { width: 360, height: 300, fontSize: 11 };

function distanceToBox(p: { x: number; y: number }, b: Box) {
  return Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));
}

const dotBox = (p: { x: number; y: number }): Box => ({ x0: p.x - 8, y0: p.y - 8, x1: p.x + 8, y1: p.y + 8 });

// Checkpoint positions of "The Road to the Ashen Peak", including the cramped start where the
// first checkpoint and the marker sit right next to the start.
const ashenPeak: LabelInput[] = [
  { id: 'hearthmeadow', text: 'Hearthmeadow', x: 35, y: 269, important: true },
  { id: 'bramblewood', text: 'The Bramblewood Inn', x: 59, y: 253, important: true },
  { id: 'elderglade', text: 'Elderglade', x: 85, y: 195, important: true },
  { id: 'frostspine', text: 'Frostspine Pass', x: 141, y: 150, important: false },
  { id: 'windswept', text: 'The Windswept Plains', x: 223, y: 157, important: false },
  { id: 'iron-gate', text: 'The Iron Gate', x: 271, y: 80, important: false },
  { id: 'ashen-peak', text: 'The Ashen Peak', x: 316, y: 30, important: true },
];

describe('journey map label layout', () => {
  it('labels every checkpoint of a real map without overlaps or ambiguity', () => {
    const placed = layoutLabels(ashenPeak, { ...options, obstacles: [{ x: 76, y: 241, r: 11 }] });
    expect(placed.map((p) => p.id).sort()).toEqual(ashenPeak.map((l) => l.id).sort());

    for (const p of placed) {
      const own = ashenPeak.find((l) => l.id === p.id)!;
      for (const q of placed) if (q !== p) expect(boxesOverlap(p.box, q.box)).toBe(false);
      for (const other of ashenPeak) {
        if (other === own) continue;
        expect(boxesOverlap(p.box, dotBox(other))).toBe(false);
        expect(distanceToBox(own, p.box)).toBeLessThan(distanceToBox(other, p.box));
      }
      expect(p.box.x0).toBeGreaterThanOrEqual(2);
      expect(p.box.x1).toBeLessThanOrEqual(options.width - 2);
      expect(p.box.y0).toBeGreaterThanOrEqual(2);
      expect(p.box.y1).toBeLessThanOrEqual(options.height - 2);
    }
  });

  it('moves a label off the progress marker when there is room', () => {
    const [label] = layoutLabels([{ id: 'a', text: 'Alpha', x: 100, y: 150, important: true }], {
      ...options,
      obstacles: [{ x: 122, y: 150, r: 11 }],
    });
    expect(boxesOverlap(label.box, { x0: 111, y0: 139, x1: 133, y1: 161 })).toBe(false);
  });

  it('flips near the edge and drops unimportant labels it cannot place unambiguously', () => {
    const [edge] = layoutLabels([{ id: 'e', text: 'Edge of the World', x: 350, y: 150, important: true }], options);
    expect(edge.anchor).not.toBe('start');
    expect(edge.box.x1).toBeLessThanOrEqual(options.width - 2);

    const crowded: LabelInput[] = [
      { id: 'keep', text: 'Main Camp', x: 180, y: 150, important: true },
      ...[0, 1, 2, 3].map((i) => ({ id: `n${i}`, text: 'Twin Pines', x: 180 + (i % 2 ? 6 : -6), y: 150 + (i < 2 ? 6 : -6), important: false })),
    ];
    const placed = layoutLabels(crowded, options);
    expect(placed.some((p) => p.id === 'keep')).toBe(true);
    expect(placed.length).toBeLessThan(crowded.length);
  });
});
