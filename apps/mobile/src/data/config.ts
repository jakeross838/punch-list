// Project settings, filled in at setup through EXPO_PUBLIC_ variables (apps/mobile/.env, not in git).
// These are public by design: the access rules in the database protect the data, not these values.

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  powersyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '',
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey && config.powersyncUrl);
