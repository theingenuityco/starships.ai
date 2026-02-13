/**
 * Dynamic import helper that stays a real dynamic import even when TypeScript
 * compiles to CommonJS (avoids TS rewriting to require()).
 */
export function dynamicImport<T = unknown>(modulePath: string): Promise<T> {
   
  const importer = new Function('m', 'return import(m)') as (m: string) => Promise<T>;
  return importer(modulePath);
}

