// Pure scoring helpers for the search benchmark.
export type Hit = { item: string | null; kind: "product" | "other-site-product" | "non-product" | "offsite" };

/** Classify one web result URL. Only a www.bunnings.com.au product page counts as a hit. */
export function classify(url: string): Hit {
  const u = new URL(url);
  const m = u.pathname.match(/_?p(\d{5,9})$/);
  const warehouse = /^(www\.)?bunnings\.com\.au$/.test(u.hostname);
  if (!/(^|\.)bunnings\.(com\.au|co\.nz)$/.test(u.hostname)) return { item: null, kind: "offsite" };
  if (m && warehouse) return { item: m[1], kind: "product" };
  if (m) return { item: m[1], kind: "other-site-product" }; // .co.nz or trade.bunnings.com.au
  return { item: null, kind: "non-product" };
}

export function metrics(ranked: (string | null)[], relevant: Set<string>) {
  const seen = new Set<string>();
  const rel = ranked.map((it) => { if (!it || seen.has(it)) return false; seen.add(it); return relevant.has(it); });
  const first = rel.indexOf(true);
  return {
    p5: rel.slice(0, 5).filter(Boolean).length / 5,
    r10: rel.filter(Boolean).length / relevant.size,
    mrr: first < 0 ? 0 : 1 / (first + 1),
  };
}

