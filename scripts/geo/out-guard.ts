import path from "node:path";

/**
 * The generator may write anywhere except the shipped `public/world` of the
 * checkout, which is only replaced after a staged run is compared and approved.
 * Returns the reason it refuses, or null when writing is allowed.
 */
export function worldOutRefusal(
  out: string,
  root: string,
  env: Record<string, string | undefined>,
): string | null {
  const shipped = path.resolve(root, "public/world");
  const target = path.resolve(out);
  const inside = target === shipped || target.startsWith(shipped + path.sep);
  if (!inside || env.WORLD_WRITE_PUBLIC === "1") return null;
  return `Refusing to write into ${target}. Set WORLD_OUT to a staging folder; replacing shipped data needs approval and WORLD_WRITE_PUBLIC=1.`;
}
