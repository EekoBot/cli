/**
 * Auth Configuration
 *
 * Supabase credentials and auth settings for the CLI.
 */

export const AUTH_CONFIG = {
  supabase: {
    url: 'https://anhqzhxhtjqtzgkyaosw.supabase.co',
    anonKey: 'sb_publishable_u-Bjm5ph-8KQHr0n7590UA_-PRB7dBY',
  },
  auth: {
    redirectPortStart: 3000,
    redirectPortEnd: 3010,
  },
  storage: {
    dir: '.eeko',
    file: 'auth.json',
  },
}
