/* ═══════════════════════════════════════════════════════════════════
   FIREBASE BAĞLANTI BİLGİLERİ — kurulumda yalnızca BU dosyayı düzenle.

   Firebase konsolu → Proje ayarları (⚙) → Genel → "Uygulamalarınız" →
   Web uygulaması → "SDK kurulumu ve yapılandırması" → "Yapılandırma" seç →
   çıkan firebaseConfig bloğundaki değerleri aşağıya yapıştır.

   Bu bilgiler gizli değildir; Firebase bunları herkese açık olacak şekilde
   tasarlar. Verini koruyan şey firebase/firestore.rules kurallarıdır.
   ═══════════════════════════════════════════════════════════════════ */
window.HZ_FIREBASE = {
  apiKey: "BURAYA_API_KEY",
  authDomain: "BURAYA_PROJE.firebaseapp.com",
  projectId: "BURAYA_PROJE",
  storageBucket: "BURAYA_PROJE.appspot.com",
  messagingSenderId: "BURAYA",
  appId: "BURAYA"
};
