// Preferred production path: serve public values through `api/runtime-config.js`
// using environment variables. This file is still useful as a static fallback for
// preview builds that do not expose runtime environment config.
window.SMARTSWING_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_PUBLIC_SUPABASE_ANON_KEY'
};

window.SMARTSWING_AUTH_CONFIG = {
  googleEnabled: true,
  appleEnabled: true,
  facebookEnabled: true
};

window.SMARTSWING_PAYMENT_CONFIG = {
  activeProvider: 'stripe',
  stripe: {
    apiBasePath: '/api',
    portalApiPath: '/api/create-billing-portal-session'
  }
};
