/** OSM shop / amenity names for signs. Geometry chunks are not modified.
 * Provenance for the whole set (source, date, ODbL, verification) is public/world/signs/index.json.
 * Each row keeps the OSM id and type. Names are copied, never translated.
 */

export type ShopRec = {
  /** OSM element id. Unique per `t`, not globally. */
  id: number;
  t: "node" | "way";
  /** OSM `name` tag, unchanged. Empty string when the element only has name:bn / name:en. */
  name: string;
  /** OSM `name:bn` when present. */
  bn?: string;
  /** OSM `name:en` when present. */
  en?: string;
  shop?: string;
  amenity?: string;
  craft?: string;
  /** OSM `brand` tag, if any. Not a partnership. */
  brand?: string;
  x: number;
  z: number;
};

/**
 * Commercial tags worth a storefront sign.
 * Worship, hospitals, universities, and government stay on the landmark path.
 */
export const RETAIL_AMENITIES = new Set([
  "cafe",
  "restaurant",
  "fast_food",
  "pharmacy",
  "bank",
  "fuel",
  "marketplace",
  "cinema",
  "theatre",
  "clinic",
  "dentist",
  "doctors",
  "bureau_de_change",
  "money_transfer",
  "post_office",
  "food_court",
  "ice_cream",
  "bar",
  "pub",
  "nightclub",
  "car_wash",
  "car_rental",
  "bicycle_rental",
  "taxi",
  "charging_station",
  "community_centre",
  "ferry_terminal",
  "bus_station",
  "arts_centre",
  "library",
  "veterinary",
  "internet_cafe",
  "payment_centre",
  "atm",
  "bicycle_repair_station",
  "car_repair",
  "mobile_money_agent",
  "studio",
  "language_school",
  "driving_school",
  "training",
  "coworking_space",
]);

export function shopTags(tags: Record<string, string>): { shop?: string; amenity?: string; craft?: string } | null {
  const shop = tags.shop && tags.shop !== "no" ? tags.shop : undefined;
  const craft = tags.craft && tags.craft !== "no" ? tags.craft : undefined;
  const amenity = tags.amenity && RETAIL_AMENITIES.has(tags.amenity) ? tags.amenity : undefined;
  if (!shop && !craft && !amenity) return null;
  return { shop, amenity, craft };
}

export function isNamedShop(tags: Record<string, string>): boolean {
  if (!shopTags(tags)) return false;
  const named = (tags["name:bn"] || tags.name || tags["name:en"] || "").trim();
  return named.length > 0;
}

export type ShopName = { text: string; script: "bn" | "src" | "en" };

/** Prefer the Bengali tag. Never translate or invent a name. */
export function displayShopName(shop: { name?: string | null; bn?: string | null; en?: string | null }): ShopName | null {
  const bn = shop.bn?.trim();
  if (bn) return { text: bn, script: "bn" };
  const name = shop.name?.trim();
  if (name) return { text: name, script: /[\u0980-\u09FF]/.test(name) ? "bn" : "src" };
  const en = shop.en?.trim();
  if (en) return { text: en, script: "en" };
  return null;
}

export function shopCategory(shop: { shop?: string; amenity?: string; craft?: string }): string {
  return shop.shop || shop.amenity || shop.craft || "place";
}
