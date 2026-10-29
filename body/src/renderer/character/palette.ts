/**
 * Colours sampled from the official frames listed in reference/SOURCES.md (#1–#3).
 * Source frames are compressed web screencaps → treat values as ±5% approximations.
 */
export const PALETTE = {
  hair: '#fb2f6c', // pink-crimson hair slabs (a touch pinker than the screencaps, as the owner asked)
  hairDeep: '#d11a52', // slightly darker slab variant (depth)
  violet: '#8a3dff', // offset outline / chromatic shadow
  violetDeep: '#5a24c4',
  ink: '#0a0710', // head, body, spikes
  inkSoft: '#1a1230', // subtle body facet
  mask: '#22f27a', // neon green face mask & body panels
  maskBright: '#7dffb4',
  iris: '#1d6cff',
  irisCore: '#0b1a4a',
  white: '#ffffff',
  sparkle: '#ffe6ee',
  mouthInner: '#2a0f3a',
} as const;
