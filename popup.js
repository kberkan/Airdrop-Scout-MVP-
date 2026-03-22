import { classifyAirdrop, classifyRisk } from './scoring.js';

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  $('status').textContent = text;
}

function badge(label, css) {
  const el = document.createElement('span');
  el.className = `badge ${css}`;
  el.textContent = label;
  return el;
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('tr-TR');
  } catch {
    return iso;
  }
}

function renderResults(data) {
  const root = $('results');
  root.innerHTML = '';

  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    root.innerHTML = '<div class="small">Sonuç yok. (Farklı gün/star değerleri dene)</div>';
    return;
  }

  for (const r of data.results) {
    const item = document.createElement('div');
    item.className = 'item';

    const top = document.createElement('div');
    top.className = 'itemTop';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = r.name;

    const badges = document.createElement('div');
    badges.className = 'badges';

    const a = classifyAirdrop(r.airdropScore);
    const k = classifyRisk(r.riskScore);

    badges.appendChild(badge(`Airdrop ${a.label} (${r.airdropScore})`, a.css));
    badges.appendChild(badge(`Risk ${k.label} (${r.riskScore})`, k.css));

    top.appendChild(name);
    top.appendChild(badges);

    const meta = document.createElement('div');
    meta.className = 'meta';

    const link = document.createElement('a');
    link.href = r.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'GitHub';

    meta.appendChild(link);

    const parts = [
      `★ ${r.stars ?? 0}`,
      r.language ? `${r.language}` : null,
      `Created: ${fmtDate(r.created_at)}`,
      `Updated: ${fmtDate(r.updated_at)}`,
    ].filter(Boolean);

    for (const p of parts) {
      const s = document.createElement('span');
      s.textContent = p;
      meta.appendChild(s);
    }

    const reasons = document.createElement('div');
    reasons.className = 'reasons';

    const desc = (r.description || '').trim();
    if (desc) {
      const d = document.createElement('div');
      d.textContent = desc;
      reasons.appendChild(d);
    }

    if (Array.isArray(r.reasons) && r.reasons.length) {
      const ul = document.createElement('div');
      ul.style.marginTop = '6px';
      ul.textContent = r.reasons.slice(0, 6).join(' · ');
      reasons.appendChild(ul);
    }

    item.appendChild(top);
    item.appendChild(meta);
    item.appendChild(reasons);

    root.appendChild(item);
  }
}

async function bg(msg) {
  return await chrome.runtime.sendMessage(msg);
}

async function loadSettings() {
  const res = await bg({ type: 'SETTINGS_LOAD' });
  if (!res.ok) throw new Error(res.error || 'load settings failed');
  const s = res.settings;
  $('token').value = s.token || '';
  $('days').value = s.days;
  $('stars').value = s.minStars;
}

async function saveSettings() {
  const token = $('token').value;
  const days = $('days').value;
  const minStars = $('stars').value;

  const res = await bg({ type: 'SETTINGS_SAVE', token, days, minStars });
  if (!res.ok) throw new Error(res.error || 'save failed');
}

async function doScan() {
  setStatus('GitHub taranıyor...');
  $('rateInfo').textContent = '';

  const res = await bg({ type: 'SCAN_GITHUB' });
  if (!res.ok) throw new Error(res.error || 'scan failed');

  const data = res.data;
  renderResults(data);

  if (data?.rateLimit?.remaining != null) {
    const rem = data.rateLimit.remaining;
    const lim = data.rateLimit.limit;
    $('rateInfo').textContent = `RateLimit: ${rem}/${lim}`;
  }

  setStatus(`Bitti. ${data.results.length} sonuç. (cutoff: ${data.cutoff})`);
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function checkCurrentSite() {
  $('siteResult').textContent = 'Site kontrol ediliyor...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = getDomainFromUrl(tab?.url || '');
  if (!domain) {
    $('siteResult').textContent = 'Bu sekmenin domaini alınamadı.';
    return;
  }

  const res = await bg({ type: 'RDAP_CHECK', domain });
  if (!res.ok) {
    $('siteResult').textContent = `RDAP hata: ${res.error}`;
    return;
  }

  const d = res.data;
  const line1 = `Domain: ${d.domain}`;
  const line2 = d.created ? `Kayıt: ${fmtDate(d.created)} (${d.oldDays} gün önce)` : 'Kayıt: bulunamadı';
  let line3 = `Risk: ${d.risk}`;
  if (Array.isArray(d.reasons) && d.reasons.length) {
    line3 += ` (${d.reasons.join(', ')})`;
  }

  $('siteResult').innerHTML = `${line1}<br/>${line2}<br/>${line3}`;
}

async function loadLastScanIfAny() {
  const res = await bg({ type: 'GET_LAST_SCAN' });
  if (!res.ok) return;
  if (res.data) {
    renderResults(res.data);
    setStatus(`Son tarama yüklendi. (cutoff: ${res.data.cutoff || '?'})`);
    if (res.data?.rateLimit?.remaining != null) {
      $('rateInfo').textContent = `RateLimit: ${res.data.rateLimit.remaining}/${res.data.rateLimit.limit}`;
    }
  }
}

$('save').addEventListener('click', async () => {
  try {
    await saveSettings();
    setStatus('Ayarlar kaydedildi.');
  } catch (e) {
    setStatus(`Hata: ${e.message}`);
  }
});

$('scan').addEventListener('click', async () => {
  try {
    await saveSettings();
    await doScan();
  } catch (e) {
    setStatus(`Hata: ${e.message}`);
  }
});

$('checkSite').addEventListener('click', async () => {
  try {
    await checkCurrentSite();
  } catch (e) {
    $('siteResult').textContent = `Hata: ${e.message}`;
  }
});

(async () => {
  try {
    await loadSettings();
    await loadLastScanIfAny();
  } catch (e) {
    setStatus(`Başlatma hatası: ${e.message}`);
  }
})();
