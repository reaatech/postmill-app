// Scale (natW × natH) down to fit inside (maxW × maxH) using a single uniform
// factor, so the image's real aspect ratio (and orientation) is preserved.
// Independent per-axis clamping flips a portrait image to landscape in a
// non-square doc — this keeps it portrait.
export const fitWithin = (
  natW: number,
  natH: number,
  maxW: number,
  maxH: number
) => {
  const scale = Math.min(maxW / natW, maxH / natH, 1);
  return { width: Math.round(natW * scale), height: Math.round(natH * scale) };
};
