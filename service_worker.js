// service_worker.js (MV3) - module
import { scoreRepo } from './scoring.js';

const DEFAULTS = {
  token: '',
  days: 45,
  minStars: 10,
};

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(Object.keys(DEFAULTS));
  await chrome.storage.local.set({ ...DEFAULTS, ...cur });
});

async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...s };
}

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function buildGitHubQuery({ days, minStars }) {
  const cutoff = isoDateDaysAgo(days);
  // GitHub search query
  // We keep it simple and keyword-based. Users can tune later.
  // GitHub Search API, boolean operator limiti var (max ~5 adet AND/OR/NOT).
  // O yüzden OR sayısını düşük tutuyoruz.
  const q = [
    '(airdrop OR points OR testnet OR incentivized)', // 3x OR
    '(evm OR ethereum OR layer2)',                    // 2x OR  => toplam 5
    `in:name,description,readme`,
    `created:>=${cutoff}`,
    `stars:>=${minStars}`,
    'fork:false',
    'archived:false'
  ].join(' ');

  return { q, cutoff };
}

async function ghFetch(url, token) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const res = await fetch(url, { headers });
  const rateLimit = {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    reset: res.headers.get('x-ratelimit-reset'),
  };

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API hata: ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return { json, rateLimit };
}

async function scanGitHub() {
  const settings = await getSettings();
  const { q, cutoff } = buildGitHubQuery(settings);

  // Sort by "updated" catches active dev; "stars" catches popular.
  // We'll do updated desc.
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=20`;

  const { json, rateLimit } = await ghFetch(url, settings.token);

  const items = Array.isArray(json.items) ? json.items : [];

  const scored = items.map((repo) => {
    const s = scoreRepo(repo);
    return {
      id: repo.id,
      name: repo.full_name,
      url: repo.html_url,
      description: repo.description || '',
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      stars: repo.stargazers_count,
      language: repo.language,
      airdropScore: s.airdropScore,
      riskScore: s.riskScore,
      reasons: s.reasons,
      meta: s.meta,
    };
  }).sort((a, b) => {
    // Primary: airdropScore desc; Secondary: risk asc
    if (b.airdropScore !== a.airdropScore) return b.airdropScore - a.airdropScore;
    return a.riskScore - b.riskScore;
  });

  return {
    query: q,
    cutoff,
    rateLimit,
    results: scored,
    fetchedAt: new Date().toISOString(),
  };
}

async function rdapLookupDomain(domain) {
  const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/rdap+json' } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`RDAP hata: ${res.status} ${res.statusText} :: ${t.slice(0, 120)}`);
  }
  return await res.json();
}

function extractRdapCreatedDate(rdapJson) {
  // RDAP events array contains eventAction: "registration" with eventDate
  const events = Array.isArray(rdapJson.events) ? rdapJson.events : [];
  const reg = events.find(e => (e.eventAction || '').toLowerCase() === 'registration');
  const date = reg?.eventDate || null;
  return date;
}

function daysOld(iso) {
  const d = new Date(iso);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'SETTINGS_SAVE') {
        await chrome.storage.local.set({
          token: msg.token || '',
          days: Number(msg.days) || DEFAULTS.days,
          minStars: Number(msg.minStars) || DEFAULTS.minStars,
        });
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'SETTINGS_LOAD') {
        const s = await getSettings();
        sendResponse({ ok: true, settings: s });
        return;
      }

      if (msg?.type === 'SCAN_GITHUB') {
        const out = await scanGitHub();
        // cache last scan
        await chrome.storage.local.set({ lastScan: out });
        sendResponse({ ok: true, data: out });
        return;
      }

      if (msg?.type === 'GET_LAST_SCAN') {
        const { lastScan } = await chrome.storage.local.get(['lastScan']);
        sendResponse({ ok: true, data: lastScan || null });
        return;
      }

      if (msg?.type === 'RDAP_CHECK') {
        const domain = String(msg.domain || '').trim();
        if (!domain) throw new Error('domain boş');

        const rdap = await rdapLookupDomain(domain);
        const created = extractRdapCreatedDate(rdap);
        const oldDays = created ? daysOld(created) : null;

        // Simple risk based on domain age
        let risk = 0;
        const reasons = [];
        if (oldDays === null) {
          risk += 15;
          reasons.push('domain kayıt tarihi bulunamadı');
        } else if (oldDays < 30) {
          risk += 40;
          reasons.push('domain çok yeni (<30g)');
        } else if (oldDays < 120) {
          risk += 20;
          reasons.push('domain yeni (<120g)');
        } else {
          reasons.push('domain yaşı fena değil');
        }

        sendResponse({ ok: true, data: { domain, created, oldDays, risk, reasons } });
        return;
      }

      sendResponse({ ok: false, error: 'unknown message type' });
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true; // async
});
