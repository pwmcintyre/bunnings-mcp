// Usage: npm run find:store -- <name, suburb, postcode or state>
import { findStores, loadStores } from "../src/stores.ts";

const query = process.argv.slice(2).join(" ");
for (const s of findStores(loadStores(), { query, limit: 10 })) console.log(`${s.id}\t${s.name}\t${s.address}, ${s.suburb} ${s.state} ${s.postcode}`);
