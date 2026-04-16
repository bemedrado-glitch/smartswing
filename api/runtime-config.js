module.exports = async (_req, res) => {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const oauthGoogleEnabled = String(process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED || '').trim().toLowerCase() === 'true';
  const oauthAppleEnabled = String(process.env.NEXT_PUBLIC_OAUTH_APPLE_ENABLED || '').trim().toLowerCase() === 'true';
  const oauthFacebookEnabled = String(process.env.NEXT_PUBLIC_OAUTH_FACEBOOK_ENABLED || '').trim().toLowerCase() === 'true';

  const posthogKey = String(process.env.POSTHOG_KEY || '').trim();
  const metaPixelId = String(process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '').trim();

  const payload = `
window.SMARTSWING_SUPABASE_CONFIG = Object.assign({}, window.SMARTSWING_SUPABASE_CONFIG || {}, {
  url: ${JSON.stringify(supabaseUrl)},
  anonKey: ${JSON.stringify(supabaseAnonKey)}
});
window.SMARTSWING_PAYMENT_CONFIG = Object.assign({}, window.SMARTSWING_PAYMENT_CONFIG || {}, {
  activeProvider: 'stripe',
  stripe: Object.assign({}, (window.SMARTSWING_PAYMENT_CONFIG || {}).stripe || {}, {
    apiBasePath: '/api',
    portalApiPath: '/api/create-billing-portal-session'
  })
});
window.SMARTSWING_AUTH_CONFIG = Object.assign({}, window.SMARTSWING_AUTH_CONFIG || {}, {
  googleEnabled: ${oauthGoogleEnabled},
  appleEnabled: ${oauthAppleEnabled},
  facebookEnabled: ${oauthFacebookEnabled}
});
window.SMARTSWING_ANALYTICS_CONFIG = Object.assign({}, window.SMARTSWING_ANALYTICS_CONFIG || {}, {
  posthogKey: ${JSON.stringify(posthogKey)},
  metaPixelId: ${JSON.stringify(metaPixelId)}
});
if (${JSON.stringify(metaPixelId)}) {
  window.SMARTSWING_META_PIXEL_ID = ${JSON.stringify(metaPixelId)};
}
`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
};
