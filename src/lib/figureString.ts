export type FigurePart = {
  type: string;     // e.g. "hd"
  setId: number;    // e.g. 180
  colors: number[]; // e.g. [1359] or [62,62]
};

export function buildFigureString(parts: FigurePart[]): string {
  const clean = parts
    .filter(p => p.type && p.setId)
    .map(p => ({
      ...p,
      colors: (p.colors ?? []).filter(n => Number.isFinite(n) && n > 0),
    }))
    .sort((a, b) => a.type.localeCompare(b.type));

  return clean
    .map(p => {
      const cols = p.colors.length ? p.colors : [0];
      return [p.type, p.setId, ...cols].join("-");
    })
    .join(".");
}
