// scoring.js
// Heuristik (tahmini) scoring: airdrop potansiyeli + risk.
// NOT: Bu bir yatırım tavsiyesi değildir.

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function daysBetween(isoDate) {
  const d = new Date(isoDate);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

export function scoreRepo(repo) {
  // repo: GitHub Search API item
  // https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-repositories

  const reasons = [];

  const text = `${repo.name || ''} ${repo.full_name || ''} ${repo.description || ''}`.toLowerCase();

  // Airdrop potential score (0-100)
  let airdrop = 0;

  // Positive keywords
  const pos = [
    { re: /\bairdrop\b/, w: 18, r: 'airdrop kelimesi' },
    { re: /\bpoints?\b/, w: 14, r: 'points kelimesi' },
    { re: /\btestnet\b/, w: 14, r: 'testnet kelimesi' },
    { re: /\bincentiv(iz|is)ed\b/, w: 12, r: 'incentivized kelimesi' },
    { re: /\bquest(s)?\b/, w: 8, r: 'quest kelimesi' },
    { re: /\bfaucet\b/, w: 6, r: 'faucet kelimesi' },
    { re: /\bbridge\b/, w: 6, r: 'bridge kelimesi' },
    { re: /\bzk\b|\bzero[- ]knowledge\b/, w: 6, r: 'zk kelimesi' },
    { re: /\brollup\b|\bl2\b|\blayer ?2\b/, w: 6, r: 'L2/rollup kelimesi' },
  ];

  for (const p of pos) {
    if (p.re.test(text)) {
      airdrop += p.w;
      reasons.push(`+${p.w} airdrop: ${p.r}`);
    }
  }

  // Freshness: newer repo -> higher potential (heuristic)
  const ageDays = daysBetween(repo.created_at);
  if (Number.isFinite(ageDays)) {
    if (ageDays <= 7) { airdrop += 12; reasons.push('+12 airdrop: çok yeni (<=7g)'); }
    else if (ageDays <= 30) { airdrop += 8; reasons.push('+8 airdrop: yeni (<=30g)'); }
    else if (ageDays <= 90) { airdrop += 4; reasons.push('+4 airdrop: nispeten yeni (<=90g)'); }
  }

  // Stars: some traction helps, but too many stars may imply it's not "early"
  const stars = repo.stargazers_count || 0;
  if (stars >= 10) { airdrop += 4; reasons.push('+4 airdrop: >=10 stars'); }
  if (stars >= 100) { airdrop += 6; reasons.push('+6 airdrop: >=100 stars'); }
  if (stars >= 1000) { airdrop -= 6; reasons.push('-6 airdrop: çok popüler (>=1000 stars), "early" olmayabilir'); }

  airdrop = clamp(airdrop, 0, 100);

  // Risk score (0-100) higher = riskier
  let risk = 0;

  // Risk keywords
  const neg = [
    { re: /\bdrain(er)?\b|\bwallet\s*drain\b/, w: 40, r: 'drainer ifadesi' },
    { re: /\bseed\s*phrase\b|\bmnemonic\b/, w: 30, r: 'seed phrase/mnemonic' },
    { re: /\bconnect\s*wallet\b/, w: 10, r: 'connect wallet (tek başına scam değil)' },
    { re: /\bfree\s*money\b|\bguaranteed\b/, w: 18, r: 'abartılı vaat' },
    { re: /\btelegram\s*airdrops?\b/, w: 8, r: 'telegram airdrop vurgusu' },
    { re: /\bairdrop\s*claimer\b|\bclaim\s*now\b/, w: 12, r: 'claim now vurgusu' },
  ];

  for (const n of neg) {
    if (n.re.test(text)) {
      risk += n.w;
      reasons.push(`+${n.w} risk: ${n.r}`);
    }
  }

  // Missing description is a mild risk
  if (!repo.description || repo.description.trim().length < 8) {
    risk += 6;
    reasons.push('+6 risk: açıklama çok kısa/boş');
  }

  // Very new + low stars can be either early or junk; slight risk
  if (ageDays <= 14 && stars < 5) {
    risk += 6;
    reasons.push('+6 risk: çok yeni ama traction düşük');
  }

  // Archived / disabled issues signals low maintenance
  if (repo.archived) {
    risk += 20;
    reasons.push('+20 risk: archived');
  }

  risk = clamp(risk, 0, 100);

  return {
    airdropScore: airdrop,
    riskScore: risk,
    reasons,
    meta: {
      ageDays,
      stars,
      language: repo.language || null,
    }
  };
}

export function classifyRisk(riskScore) {
  if (riskScore >= 60) return { label: 'HIGH', css: 'danger' };
  if (riskScore >= 30) return { label: 'MED', css: 'warn' };
  return { label: 'LOW', css: 'ok' };
}

export function classifyAirdrop(airdropScore) {
  if (airdropScore >= 60) return { label: 'HIGH', css: 'ok' };
  if (airdropScore >= 35) return { label: 'MED', css: 'warn' };
  return { label: 'LOW', css: 'danger' };
}
