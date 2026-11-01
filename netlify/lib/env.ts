function read(name: string): string {
  return String(process.env[name] || "").trim();
}

// Supabase renombró las claves: `SUPABASE_SECRET_KEY` (sb_secret_...)
// sustituye a la antigua `service_role`. Aceptamos ambas durante la transición.
const secretKey = read("SUPABASE_SECRET_KEY") || read("SUPABASE_SERVICE_ROLE_KEY");

export const env = {
  SUPABASE_URL: read("SUPABASE_URL"),
  SUPABASE_ANON_KEY: read("SUPABASE_ANON_KEY"),
  SUPABASE_SECRET_KEY: secretKey,
  // Alias heredado: el resto del código sigue leyendo este nombre.
  SUPABASE_SERVICE_ROLE_KEY: secretKey,
  SESSION_SECRET: read("SESSION_SECRET"),
  ALLOWED_ORIGIN: read("ALLOWED_ORIGIN"),
  NETLIFY_BUILD_HOOK: read("NETLIFY_BUILD_HOOK"),
  CONTEXT: read("CONTEXT") || "dev",
  get isProduction(): boolean {
    return this.CONTEXT === "production" || this.CONTEXT === "deploy-preview";
  },
  get configured(): boolean {
    return Boolean(
      this.SUPABASE_URL && this.SUPABASE_SECRET_KEY && this.SESSION_SECRET
    );
  }
};

export function missingEnv(): string[] {
  const missing: string[] = [];
  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SECRET_KEY) missing.push("SUPABASE_SECRET_KEY");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET");
  return missing;
}
