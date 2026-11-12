# H&Z Finans

Aile bütçesi uygulaması. Kredi kartı ekstrelerini elle girilen harcamalarla eşleştirir; aynı işlem iki kez yazılmaz. Kart harcamasını ekstre ayına, nakit harcamayı takvim ayına yazar. Taksitleri ve düzenli ödemeleri (kira, aidat, fatura) takip eder.

Uygulama **GitHub Pages**'ten yayınlanır. Giriş ve veri için **Firebase** kullanılır. Kullanıcı adı ve şifreyle ya da Google hesabıyla giriş yapılır. İkiniz aynı veriyi görürsünüz ve bir kişinin girdiği kayıt diğerinin ekranına kendiliğinden gelir.

> **Depo herkese açık olabilir, verin açık olmaz.** Kartların, harcamaların ve ayarların bu depoda değil, Firebase'de durur. Onları yalnızca senin onayladığın kişiler görebilir (`firebase/firestore.rules`).

---

## İlk kurulum (bir kez, yaklaşık 30 dakika)

### 1. GitHub: depoyu aç ve dosyaları yükle

1. github.com → sağ üstte **+** → **New repository**
2. Repository name: `hz-finans` → **Public** seç → **Create repository**
   (Ücretsiz GitHub hesabında yayın yalnızca açık depodan yapılabilir.)
3. Açılan sayfada **uploading an existing file** bağlantısına tıkla.
4. Bilgisayarındaki `hz-finans` klasörünün **içindekileri** sürükleyip bırak.
5. Aşağıda **Commit changes**'e bas.

### 2. GitHub Pages: yayını aç

1. Depoda **Settings** → soldan **Pages**
2. *Build and deployment* → Source: **Deploy from a branch**
3. Branch: **main**, klasör: **/ (root)** → **Save**
4. 1–2 dakika sonra sayfanın üstünde adres çıkar: `https://KULLANICIADIN.github.io/hz-finans/`

Bu adreste şu an **"Kurulum tamamlanmadı"** yazar. Normal; 4. adımda düzelecek.

### 3. Firebase: proje, giriş ve veritabanı

[console.firebase.google.com](https://console.firebase.google.com) adresine Google hesabınla gir.

1. **Proje oluştur** → ad: `hz-finans` → Google Analytics'i **kapat** → Proje oluştur.
2. **Authentication** (Kimlik doğrulama) → **Başlayın** → *Sign-in method* sekmesi:
   - **E-posta/Şifre** → Etkinleştir → Kaydet
   - **Google** → Etkinleştir → destek e-postası olarak kendi adresini seç → Kaydet
3. Authentication → **Settings** → **Authorized domains** → **Add domain** → `KULLANICIADIN.github.io`
4. **Firestore Database** → **Veritabanı oluştur** → konum: **eur3 (europe-west)** → **Production mode** → Oluştur.
5. Firestore → **Rules** sekmesi → içindekileri sil → bu depodaki `firebase/firestore.rules` dosyasının **tamamını** yapıştır → **Publish**.
6. Sol üstte ⚙ → **Proje ayarları** → aşağıda *Uygulamalarınız* → **`</>`** (Web) simgesi → takma ad: `hz-finans` → *Firebase Hosting'i kurma* → **Uygulamayı kaydet**.
   Çıkan kodda `const firebaseConfig = { ... }` bloğu var; o ekranı açık tut.

### 4. Bağlantı bilgilerini yaz

1. GitHub'da depoda `firebase-config.js` dosyasını aç → sağ üstte **kalem** (Edit).
2. `BURAYA_...` yazan altı değerin yerine Firebase'in verdiği değerleri yapıştır (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
3. **Commit changes**. 1–2 dakika bekle.

### 5. İlk giriş: yönetici sen ol

Adresi aç → **Hesabın yok mu? Kayıt ol** → adın, e-postan, şifren. Ya da **Google ile giriş yap**.

**Uygulamaya ilk giren kişi yönetici olur.** Bu yüzden 4. adımdan hemen sonra ilk sen gir.

### 6. Verini taşı

1. Şu an kullandığın Claude sayfasında: **Ayarlar → JSON yedek indir**
2. Yeni uygulamada: **Ayarlar → Yedekten yükle → Yedek dosyası** → indirdiğin dosyayı seç → **Yükle**

Kartların, kayıtların ve 12.11.2026 borç kapanışın aynen gelir.

### 7. Telefona ekle, Zeynep'i davet et

- Adresi telefonda aç. Android'de menü (⋮) → **Ana ekrana ekle**; iPhone'da Paylaş → **Ana Ekrana Ekle**.
- Zeynep aynı adresten **Kayıt ol** der ve "Onay bekleniyor" ekranında bekler.
- Sen **Ayarlar → Hesap ve kullanıcılar → Onayla**'ya basınca onun ekranı kendiliğinden açılır.
- Erişimi kaldırmak da aynı yerden yapılır.

---

## VS Code ile çalışmak

```
hz-finans/
├─ index.html           ← YAYINLANAN SAYFA (npm run build üretir; GitHub Pages bunu açar)
├─ firebase-config.js   ← senin Firebase bilgilerin — derleme bu dosyaya dokunmaz
├─ manifest.webmanifest, ikon-*.png   telefonda "ana ekrana ekle" için
├─ src/                 ← KAYNAK KOD — değişiklikler burada yapılır
│  ├─ engine.js           hesap motoru: ekstre dönemleri, ay kuralı, taksit, mutabakat, kapanış
│  ├─ ekstre.js           ekstre okuyucu: Ziraat, İş Bankası, Garanti PDF; Excel/CSV
│  ├─ app.js              ekranlar ve işlemler
│  ├─ charts.js           grafikler
│  ├─ firebase-giris.js   giriş ekranı, kullanıcı onayı, Firebase veri bağlantısı
│  └─ shell.html          tasarım (CSS) ve sayfa iskeleti
├─ firebase/firestore.rules   güvenlik kuralları
├─ tests/               ← testler
└─ tools/               ← derleme, yerel sunucu, simge üretici
```

PDF, Excel ve Firebase kitaplıkları yayında CDN'den (cdnjs, gstatic) gelir. `npm install` sonrası
`vendor/` klasörüne yerel kopyaları da konur; testler ve çevrimdışı çalışma bunları kullanır.
`npm run build` ayrıca `dist/claude-sayfa.html` üretir: aynı uygulamanın Claude sayfası sürümü.

Gerekenler: [Node.js](https://nodejs.org) (LTS) ve VS Code. Klasörü VS Code'da aç, **Terminal → New Terminal**:

| Komut | Ne yapar |
|---|---|
| `npm test` | hesap motoru ve ekstre okuyucu testleri (kurulum gerekmez) |
| `npm run build` | `src/shell.html` → `index.html` derler |
| `npm run serve` | derler ve `http://localhost:5173` adresinde açar (Firebase `localhost`'a varsayılan olarak izin verir) |
| `npm install` sonra `npx playwright install chromium` | kitaplıkları ve test tarayıcısını kurar (bir kez) |
| `npm run test:e2e` | uygulamayı tarayıcıda baştan sona dener: ekstre yükleme, mükerrer engeli, geri alma, borç kapatma |
| `npm run test:firebase` | giriş ekranı, ilk yönetici, onay akışı, iki kişi senkronu (sahte Firebase ile) |

**Değişiklik akışı:** `src/` içinde düzenle → `npm run build` → `npm test` → değişen dosyaları GitHub'a gönder. En kolayı [GitHub Desktop](https://desktop.github.com): depoyu bir kez "Clone" et, sonra her değişiklikte "Commit" ve "Push".

---

## Nasıl çalışır

**Ay kuralı.** Kart harcaması, ait olduğu ekstrenin ayına yazılır. Ekstrenin ayı, o ekstreyi hangi ayın maaşının ödediğidir. Nakit, banka ve gelir kayıtları takvim ayına yazılır.

**Ekstre yükleme (mutabakat).** Her ekstre satırı şu sırayla kontrol edilir:

1. Daha önce yüklendi mi → **zaten var**.
2. Aynı numaralı bir taksit kaydı var mı → **eşleşti**.
3. Aynı kart, aynı tutar, en çok 3 gün farkla elle girilmiş bir kayıt var mı → **eşleşti**.
4. Tutarı çok yakın (±5 ₺ ya da %2) bir kayıt var mı → **benzer**; kararı sen verirsin.
5. Hiçbiri değilse → **yeni**.

Her yükleme geri alınabilir. Ekstredeki gerçek kesim tarihi karta yazılır.

**Borçları kapat.** Seçilen tarihe kadarki her şey ödenmiş sayılır ve kart borcu sıfırdan başlar. Geçmiş kayıtlar silinmez.

**Para** kuruş cinsinden tam sayı olarak tutulur; yuvarlama hatası olmaz.

## Ücret

Firebase ücretsiz (Spark) planı ve GitHub Pages iki kişilik kullanım için ücretsizdir. Kredi kartı istemez.
