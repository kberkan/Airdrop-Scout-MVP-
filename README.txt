Airdrop Scout (MVP)

Bu Chrome eklentisi, yeni/erken aşama kripto projelerini (özellikle airdrop/points/testnet sinyali olanları) GitHub üzerinden keşfetmeye yardım eden basit bir MVP'dir.

ÖZELLİKLER
- Popup'tan "Scan" diyerek GitHub'da yeni repo araması yapar.
- Her repo için "Airdrop potential" ve "Scam/Risk" puanı üretir.
- Repo linklerini listeler.
- Gezdiğin sayfanın domainini RDAP ile kontrol edip (domain yaşı) yüksek risk uyarısı verebilir.

NOT
- Bu eklenti yatırım tavsiyesi değildir. Skorlar heuristik (tahmini) kurallarla hesaplanır.
- Veri kaynağı olarak GitHub Search API ve RDAP kullanır.

KURULUM (Developer Mode)
1) Chrome -> chrome://extensions
2) Developer mode'ı aç
3) Load unpacked -> bu klasörü seç: airdrop-scout-extension
4) Eklenti ikonuna tıkla -> Scan

GITHUB TOKEN (opsiyonel ama önerilir)
- GitHub rate limit düşük olmasın diye bir "Fine-grained" veya classic token kullan.
- Popup içinde ayarlayabilirsin.

DOSYALAR
- manifest.json
- popup.html / popup.js / popup.css
- service_worker.js
- scoring.js
- icons/
