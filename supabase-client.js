(() => {
  const config = window.JEAZY_SUPABASE;

  if (!config || !window.supabase) {
    document.documentElement.dataset.supabaseReady = 'false';
    console.warn('Jeazy Club: Supabase todavía no está disponible.');
    return;
  }

  window.jeazySupabase = window.supabase.createClient(
    config.url,
    config.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
  document.documentElement.dataset.supabaseReady = 'true';
})();
