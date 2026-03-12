export type Gender = "M" | "F" | "U";

export type SetTypeInfo = {
  type: string;
  paletteId: number | null;
  mandatory: boolean;
};

export type SetInfo = {
  id: number;
  gender: Gender;
  club: number;
  selectable: boolean;
  colorsCount: number;
};

export type PaletteColor = {
  id: number;
  index?: number;
  club?: number;
  selectable?: boolean;
  hexCode?: string;
};
