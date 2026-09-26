// node get-status.mjs <url> -> prints the HTTP status only (local scratch hubs; no key is sent)
const r = await fetch(process.argv[2]).catch((e) => ({ status: "error " + (e.cause?.code ?? e.message) }));
console.log(r.status);
