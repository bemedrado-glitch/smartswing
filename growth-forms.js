(function () {
  const STORAGE_KEY = 'smartswing_growth_leads_v1';

  function readLeads() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function writeLeads(leads) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  }

  async function submitLead(payload) {
    const createdAt = new Date().toISOString();
    const entry = {
      id: `lead_${Date.now()}`,
      source: payload.source || window.location.pathname || '/',
      offer: payload.offer || '',
      name: String(payload.name || '').trim(),
      email: String(payload.email || '').trim().toLowerCase(),
      topic: String(payload.topic || 'lead-capture').trim(),
      message: String(payload.message || '').trim(),
      createdAt
    };

    if (!entry.name || !entry.email) {
      return { ok: false, reason: 'missing_fields' };
    }

    const leads = readLeads();
    leads.unshift(entry);
    writeLeads(leads);

    let synced = false;
    const store = window.SmartSwingStore;
    if (store?.saveContactMessage) {
      try {
        const result = await store.saveContactMessage({
          name: entry.name,
          email: entry.email,
          topic: entry.topic,
          message: entry.message || `Lead capture from ${entry.source}. Offer: ${entry.offer || 'none supplied'}.`
        });
        synced = Boolean(result?.synced);
      } catch (_) {
        synced = false;
      }
    }

    return {
      ok: true,
      synced,
      count: leads.length,
      savedAt: createdAt
    };
  }

  window.SmartSwingGrowth = {
    readLeads,
    submitLead
  };
})();
