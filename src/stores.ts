import { readFileSync } from "node:fs";
import type { Store } from "./parse.ts";

export function loadStores(path = new URL("../data/stores.json", import.meta.url)): Store[] {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type StoreMatch = Store & { distanceKm?: number };

export interface FindOptions { query?: string; lat?: number; lon?: number; limit?: number }

/** Match on id, name, suburb, postcode or state; sort by distance when lat/lon is given. */
export function findStores(stores: Store[], { query, lat, lon, limit = 5 }: FindOptions): StoreMatch[] {
  const hasPoint = lat != null && lon != null;
  const tokens = (query ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length && !hasPoint) throw new Error("find_stores needs a query, or lat and lon");
  const rank = (s: Store): number => {
    const name = s.name.toLowerCase(), suburb = s.suburb.toLowerCase();
    const q = tokens.join(" ");
    return s.id === q ? 0 : name === q || suburb === q ? 1 : name.startsWith(q) || suburb.startsWith(q) ? 2 : 3;
  };
  const hay = (s: Store) => `${s.id} ${s.name} ${s.suburb} ${s.postcode} ${s.state} ${s.address}`.toLowerCase();
  let out: StoreMatch[] = stores.filter((s) => tokens.every((t) => hay(s).includes(t)));
  if (hasPoint) {
    out = out.map((s) => ({ ...s, distanceKm: Math.round(distanceKm(lat, lon, s.lat, s.lon) * 10) / 10 }));
    out.sort((a, b) => a.distanceKm! - b.distanceKm!);
  } else {
    out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  return out.slice(0, limit);
}
