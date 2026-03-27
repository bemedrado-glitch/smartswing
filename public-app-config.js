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
