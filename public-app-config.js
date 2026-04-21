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

// Cal.com booking slug for B2B club demos. Overridable via CAL_BOOKING_SLUG
// env var (surfaced by api/runtime-config.js). Example values:
//   'smartswing/club-demo'   — default 15-min slot
//   'bernardo/30min'         — your personal Cal.com account
//   'smartswing-sales/clubs' — shared team scheduler
// Change this to rebrand or reroute the 'Book a 15-min club demo' buttons on
// for-clubs.html without touching HTML.
window.PUBLIC_APP_CONFIG = window.PUBLIC_APP_CONFIG || {};
window.PUBLIC_APP_CONFIG.calBookingSlug = window.PUBLIC_APP_CONFIG.calBookingSlug || 'smartswing/club-demo';
