/**
 * One product-colour palette for the whole app (3D totes, replay legend).
 * Colour carries meaning, as in Visual Components / FlexSim layouts: each
 * product type is a strong, distinct colour; equipment stays neutral.
 * A product's colour is fixed by its position in the model's product list,
 * so the legend and the 3D view always agree.
 */
// Order validated for colour-vision deficiency (adjacent pairs ΔE ≥ 9 deutan,
// dataviz validate_palette.js). Orange and ochre are under 3:1 contrast on
// white, so charts using them always carry a legend + table.
export const PRODUCT_PALETTE = [
  '#E07A10', // orange
  '#2F62D0', // blue
  '#D93A2B', // red
  '#1F9E9A', // teal
  '#B8930A', // ochre
  '#7B4FC9', // purple
  '#3E8E2E', // green
  '#C2397E', // magenta
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface ProductRef { id: string; name: string }

/** Hex string ('#RRGGBB') for a product, looked up by name or id. */
export function productColor(product: string, products: ProductRef[]): string {
  const i = products.findIndex((p) => p.name === product || p.id === product);
  return PRODUCT_PALETTE[(i >= 0 ? i : hash(product)) % PRODUCT_PALETTE.length];
}

/** Same as productColor but as a number for three.js. */
export function productColorNum(product: string, products: ProductRef[]): number {
  return parseInt(productColor(product, products).slice(1), 16);
}
