// deno-lint-ignore-file no-explicit-any
// Testattrapp för npm:web-push – sparar det som "skickas".
const g = globalThis as unknown as { __sent: { endpoint: string; payload: string }[] };
export default {
  setVapidDetails(..._a: any[]) {},
  generateVAPIDKeys() { return { publicKey: "pub", privateKey: "priv" }; },
  sendNotification(sub: { endpoint: string; keys?: unknown }, payload: string, ..._o: any[]) { g.__sent.push({ endpoint: sub.endpoint, payload }); return Promise.resolve({ statusCode: 201 }); },
};
