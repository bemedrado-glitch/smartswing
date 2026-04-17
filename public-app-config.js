window.SMARTSWING_SUPABASE_CONFIG = window.SMARTSWING_SUPABASE_CONFIG || {
  url: '',
  anonKey: ''
};

window.SMARTSWING_PAYMENT_CONFIG = window.SMARTSWING_PAYMENT_CONFIG || {
  activeProvider: 'stripe',
  stripe: {
    apiBasePath: '/api',
    portalApiPath: '/api/create-billing-portal-session'
  }
};

// Meta Pixel ID — runtime override. Set via META_PIXEL_ID env var in Vercel
// (surfaced by api/runtime-config.js). Leaving this empty falls back to the
// hardcoded id baked into analytics.js.
window.SMARTSWING_META_PIXEL_ID = window.SMARTSWING_META_PIXEL_ID || '';
