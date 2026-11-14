// Scores the two arms against eval/queries.json. Usage: npm run eval [-- --site=eval/results/site-X.json --web=eval/results/web-X.json]
import { classify, metrics, type Hit } from "./metrics.ts";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./results/", import.meta.url);
const latest = (prefix: string) => readdirSync(dir).filter((f) => f.startsWith(prefix)).sort().at(-1)!;
const arg = (k: string, def: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? def;
const load = (p: string) => JSON.parse(readFileSync(p.includes("/") ? p : new URL(p, dir), "utf8"));

const spec = load(new URL("./queries.json", import.meta.url).pathname);
const site = load(arg("site", latest("site-")));
const web = load(arg("web", latest("web-")));

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const f = (n: number) => n.toFixed(2);

const rows = spec.queries.map((q: any) => {
  const relevant = new Set<string>(q.relevant);
  const s = site.rows.find((r: any) => r.id === q.id);
  const w = web.rows.find((r: any) => r.id === q.id);
  const siteRanked: string[] = s.results.slice(0, 10).map((r: any) => r.itemNumber);
  const hits = w.urls.slice(0, 10).map(classify);
  return {
    id: q.id, kind: q.kind, query: q.query, relevant: relevant.size,
    site: { ...metrics(siteRanked, relevant), results: siteRanked.length, withPrice: s.results.filter((r: any) => r.price != null).length, latencyMs: s.latencyMs },
    web: { ...metrics(hits.map((h: Hit) => h.kind === "product" ? h.item : null), relevant), results: hits.length, product: hits.filter((h: Hit) => h.kind === "product").length, wrongSite: hits.filter((h: Hit) => h.kind === "other-site-product").length, nonProduct: hits.filter((h: Hit) => h.kind === "non-product").length, offsite: hits.filter((h: Hit) => h.kind === "offsite").length },
  };
});

const agg = (arm: "site" | "web") => ({
  p5: mean(rows.map((r: any) => r[arm].p5)), r10: mean(rows.map((r: any) => r[arm].r10)), mrr: mean(rows.map((r: any) => r[arm].mrr)),
});
const S = agg("site"), W = agg("web");
const webTotal = rows.reduce((a: number, r: any) => a + r.web.results, 0);
const sum = (k: string) => rows.reduce((a: number, r: any) => a + r.web[k], 0);
const lat = rows.map((r: any) => r.site.latencyMs);

console.log(`queries: ${rows.length}   site: ${site.date}   web: ${web.date}\n`);
console.log("arm   P@5   R@10  MRR   product-page share  store price/stock  latency (ms, median/mean)");
console.log(`site  ${f(S.p5)}  ${f(S.r10)}  ${f(S.mrr)}  100%                ${Math.round(mean(rows.map((r: any) => r.site.withPrice / r.site.results)) * 100)}% priced, store-scoped  ${median(lat)}/${Math.round(mean(lat))}`);
console.log(`web   ${f(W.p5)}  ${f(W.r10)}  ${f(W.mrr)}  ${f((sum("product") / webTotal) * 100)}%               none                not measured`);
console.log(`\nweb results: ${webTotal}; warehouse product pages ${sum("product")}, other-site product pages (.co.nz/trade) ${sum("wrongSite")}, non-product bunnings pages ${sum("nonProduct")}, off-site ${sum("offsite")}`);
console.log("\nper query (P@5 / MRR)   site        web");
for (const r of rows) console.log(`${r.id} ${r.kind.padEnd(6)} ${r.query.padEnd(34)} ${f(r.site.p5)}/${f(r.site.mrr)}   ${f(r.web.p5)}/${f(r.web.mrr)}`);
const byKind: Record<string, any[]> = {};
for (const r of rows) (byKind[r.kind] ??= []).push(r);
console.log("\nby kind (P@5 site vs web, MRR site vs web)");
for (const [k, rs] of Object.entries(byKind)) console.log(`${k.padEnd(6)} n=${rs.length}  P@5 ${f(mean(rs.map((r) => r.site.p5)))} vs ${f(mean(rs.map((r) => r.web.p5)))}   MRR ${f(mean(rs.map((r) => r.site.mrr)))} vs ${f(mean(rs.map((r) => r.web.mrr)))}`);

writeFileSync(new URL(`./scores-${site.date}.json`, dir), JSON.stringify({ site: S, web: W, rows }, null, 1) + "\n");
