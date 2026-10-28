// deno-lint-ignore-file no-explicit-any
// Testattrapp för npm:@supabase/supabase-js – inget nätverk. Svaren styrs av globalThis.__rpc.
type H = (fn: string, args: Record<string, unknown>) => unknown;
export function createClient(_u: string, _k: string, _o?: unknown) {
  return {
    from(..._a: any[]): any { throw new Error("from() används inte i testet"); },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      const g = globalThis as unknown as { __calls: unknown[]; __rpc: H };
      g.__calls.push({ fn, args });
      return Promise.resolve({ data: g.__rpc(fn, args) ?? null, error: null });
    },
  };
}
