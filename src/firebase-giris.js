/* ═══════════════════════════════════════════════════════════════════
   H&Z Finans — GitHub sürümü: giriş ekranı + Firebase veri katmanı
   ───────────────────────────────────────────────────────────────────
   · Giriş: e-posta + şifre, Google ile giriş, şifremi unuttum, kayıt ol.
   · Uygulamaya ilk giren kişi YÖNETİCİ olur (meta/kurulum). Sonra kaydolanlar
     "onay bekliyor" ekranında kalır; yönetici Ayarlar → Hesap ve kullanıcılar
     bölümünden onaylar. Onaysız kişi hiçbir veriyi okuyamaz (firestore.rules).
   · Uygulamanın geri kalanı (app.js) Firestore'u Claude veritabanıyla aynı
     biçimde kullanır: doc().onSnapshot / set / delete, collection().onSnapshot.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
var cfg = window.HZ_FIREBASE || {};
var kurulu = !!(cfg.apiKey && cfg.projectId && !/BURAYA|YOUR_/i.test(cfg.apiKey + cfg.projectId));
var EMU = window.HZ_EMU || null;   /* testler için: { auth: 'http://127.0.0.1:9099', host: '127.0.0.1', port: 8080 } */

var CSS = '' +
  '#giris{position:fixed;inset:0;z-index:200;background:var(--ground);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}' +
  '#giris .kutu{width:100%;max-width:380px;background:var(--surf);border:1px solid var(--brd);border-radius:16px;box-shadow:var(--shadow-lift);padding:26px 22px}' +
  '#giris .logo{display:flex;align-items:center;gap:10px;margin-bottom:6px}' +
  '#giris .logo i{width:34px;height:34px;border-radius:9px;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:18px}' +
  '#giris h1{font-family:var(--display,inherit);font-size:21px;margin:0}' +
  '#giris .alt{color:var(--ink3);font-size:13px;margin:0 0 18px}' +
  '#giris form{display:flex;flex-direction:column;gap:11px}' +
  '#giris .btn{justify-content:center;padding:11px;width:100%}' +
  '#giris .ayrac{display:flex;align-items:center;gap:10px;color:var(--ink3);font-size:12px;margin:14px 0}' +
  '#giris .ayrac:before,#giris .ayrac:after{content:"";flex:1;border-top:1px solid var(--brd)}' +
  '#giris .bag{display:flex;justify-content:space-between;gap:10px;margin-top:14px;font-size:13px;flex-wrap:wrap}' +
  '#giris .bag button{background:none;border:0;color:var(--acc-ink,var(--acc));font-weight:600;cursor:pointer;padding:0}' +
  '#giris .msj{font-size:13px;border-radius:9px;padding:9px 11px;display:none}' +
  '#giris .msj.on{display:block}' +
  '#giris .msj.hata{background:var(--crit-soft);color:var(--crit)}' +
  '#giris .msj.ok{background:var(--ok-soft);color:var(--ok)}' +
  '#giris .bekle{text-align:center;font-size:14px;color:var(--ink2);line-height:1.5}' +
  '#giris .bekle b{display:block;font-size:16px;color:var(--ink);margin-bottom:6px}';

function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var HATA = {
  'auth/invalid-email': 'E-posta adresi geçerli değil.',
  'auth/missing-password': 'Şifreni yaz.',
  'auth/invalid-credential': 'E-posta ya da şifre yanlış.',
  'auth/wrong-password': 'E-posta ya da şifre yanlış.',
  'auth/user-not-found': 'Bu e-postayla bir hesap yok. "Kayıt ol" ile hesap açabilirsin.',
  'auth/email-already-in-use': 'Bu e-postayla zaten bir hesap var. Giriş yap ya da "Şifremi unuttum"u kullan.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
  'auth/network-request-failed': 'İnternet bağlantısı yok gibi görünüyor.',
  'auth/popup-closed-by-user': 'Google penceresi kapatıldı.',
  'auth/unauthorized-domain': 'Bu adres Firebase\'de yetkili değil (Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'Bu giriş yöntemi Firebase\'de açık değil (Authentication → Sign-in method).'
};
function hataMetni(e) { return HATA[e && e.code] || ('Bir sorun oldu: ' + ((e && (e.code || e.message)) || e)); }

var kok = null, auth = null, db = null, kullanici = null, profil = null, yonetici = false, cozuldu = false, coz = null;

function ekran(html) {
  if (!kok) {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    kok = document.createElement('div'); kok.id = 'giris'; document.body.appendChild(kok);
  }
  kok.style.display = '';
  kok.innerHTML = '<div class="kutu"><div class="logo"><i>₺</i><h1>H&amp;Z Finans</h1></div>' + html + '</div>';
}
function gizle() { if (kok) kok.style.display = 'none'; }
function msj(t, tur) { var m = kok && kok.querySelector('.msj'); if (!m) return; m.textContent = t || ''; m.className = 'msj' + (t ? ' on ' + (tur || 'hata') : ''); }
function mesgul(form, evet) { form.querySelectorAll('button,input').forEach(function (b) { b.disabled = evet; }); }

function girisEkrani(kip) {
  kip = kip || 'giris';
  var kayit = kip === 'kayit', unut = kip === 'unut';
  ekran('<p class="alt">' + (kayit ? 'Yeni hesap aç. Yönetici onayladığında uygulama açılır.' : unut ? 'E-postana şifre sıfırlama bağlantısı gönderelim.' : 'Devam etmek için giriş yap.') + '</p>' +
    '<form id="gForm" novalidate>' +
      (kayit ? '<label class="f"><span>Adın</span><input id="gAd" autocomplete="name" placeholder="ör. Zeynep"></label>' : '') +
      '<label class="f"><span>E-posta</span><input id="gEposta" type="email" autocomplete="email" inputmode="email"></label>' +
      (unut ? '' : '<label class="f"><span>Şifre</span><input id="gSifre" type="password" autocomplete="' + (kayit ? 'new-password' : 'current-password') + '"></label>') +
      '<div class="msj"></div>' +
      '<button class="btn pri" type="submit">' + (kayit ? 'Kayıt ol' : unut ? 'Sıfırlama bağlantısı gönder' : 'Giriş yap') + '</button>' +
    '</form>' +
    (unut ? '' : '<div class="ayrac">ya da</div><button class="btn" id="gGoogle" type="button">Google ile giriş yap</button>') +
    '<div class="bag">' +
      (kip !== 'giris' ? '<button data-k="giris">← Girişe dön</button>' : '<button data-k="unut">Şifremi unuttum</button><button data-k="kayit">Hesabın yok mu? Kayıt ol</button>') +
    '</div>');
  kok.querySelectorAll('.bag button').forEach(function (b) { b.onclick = function () { girisEkrani(b.dataset.k); }; });
  var g = kok.querySelector('#gGoogle');
  if (g) g.onclick = function () {
    var p = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(p).catch(function (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(p);
      msj(hataMetni(e));
    });
  };
  var f = kok.querySelector('#gForm');
  f.onsubmit = function (ev) {
    ev.preventDefault();
    var ep = (kok.querySelector('#gEposta').value || '').trim();
    var sf = kok.querySelector('#gSifre') ? kok.querySelector('#gSifre').value : '';
    msj(''); mesgul(f, true);
    var is;
    if (unut) is = auth.sendPasswordResetEmail(ep).then(function () {
      msj('Bağlantı gönderildi. E-postanı (gereksiz klasörü dahil) kontrol et.', 'ok');
    });
    else if (kayit) {
      var ad = (kok.querySelector('#gAd').value || '').trim();
      if (!ad) { msj('Adını yaz.'); mesgul(f, false); return; }
      is = auth.createUserWithEmailAndPassword(ep, sf).then(function (r) {
        sessionStorage.setItem('hz_ad', ad);
        return r.user.updateProfile({ displayName: ad });
      });
    } else is = auth.signInWithEmailAndPassword(ep, sf);
    is.catch(function (e) { msj(hataMetni(e)); }).then(function () { mesgul(f, false); });
  };
}

function bekleEkrani(not) {
  ekran('<div class="bekle"><b>Onay bekleniyor</b>' +
    'Hesabın açıldı: <b style="display:inline;font-size:14px">' + esc(kullanici.email) + '</b><br>' +
    'Uygulamanın yöneticisi seni onayladığında bu ekran kendiliğinden açılır.' +
    (not ? '<div class="msj on hata" style="margin-top:12px">' + esc(not) + '</div>' : '') +
    '</div><div class="bag" style="justify-content:center;margin-top:18px"><button id="gCikis">Çıkış yap</button></div>');
  kok.querySelector('#gCikis').onclick = cikis;
}
function kurulumEksik() {
  ekran('<div class="bekle"><b>Kurulum tamamlanmadı</b>' +
    '<code>firebase-config.js</code> dosyasına Firebase projenin bilgileri yazılmamış. ' +
    'Kurulum rehberindeki 2. adımı tamamla.</div>');
}
function cikis() { auth.signOut().then(function () { location.reload(); }); }

/* ── yetki: profil, ilk yönetici, onay ─────────────────────────── */
async function yetkiKontrol(u) {
  kullanici = u;
  ekran('<div class="bekle">Bağlanıyor…</div>');
  var ref = db.doc('kullanicilar/' + u.uid);
  var snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      ad: u.displayName || sessionStorage.getItem('hz_ad') || (u.email || '').split('@')[0],
      email: u.email || '', onay: false, rol: 'uye', at: new Date().toISOString()
    });
  }
  /* ilk giren yönetici olur */
  var kur = await db.doc('meta/kurulum').get();
  if (!kur.exists) {
    try { await db.doc('meta/kurulum').set({ yonetici: u.uid, at: new Date().toISOString() }); } catch (e) { }
    kur = await db.doc('meta/kurulum').get();
  }
  yonetici = kur.exists && kur.data().yonetici === u.uid;
  if (yonetici) {
    var p = (await ref.get()).data();
    if (!p.onay || p.rol !== 'yonetici') await ref.update({ onay: true, rol: 'yonetici' });
  }
  /* onay gelene kadar bekle — yönetici onaylayınca ekran kendiliğinden açılır */
  ref.onSnapshot(function (s) {
    profil = s.data() || {};
    if (yonetici || profil.onay === true) {
      if (!cozuldu) { cozuldu = true; gizle(); coz(db); }
    } else if (cozuldu) {
      location.reload();                  /* erişimi kaldırıldı */
    } else bekleEkrani();
  }, function (e) { bekleEkrani(hataMetni(e)); });
}

/* ── Ayarlar → Hesap ve kullanıcılar ───────────────────────────── */
var kullaniciAboneligi = null, kullaniciListesi = [];
function hesapCiz(host) {
  function ciz() {
    host.innerHTML =
      '<div class="rowline"><div class="grow"><b>' + esc((profil && profil.ad) || kullanici.displayName || '') + '</b>' +
        '<div class="muted">' + esc(kullanici.email) + (yonetici ? ' · yönetici' : '') + '</div></div>' +
        '<div class="acts"><button class="btn sm" id="hCikis">Çıkış yap</button></div></div>' +
      (yonetici ? '<div class="lbl" style="margin:14px 0 4px">Kullanıcılar</div>' +
        (kullaniciListesi.length ? kullaniciListesi.map(function (k) {
          var ben = k.id === kullanici.uid;
          return '<div class="rowline"><div class="grow"><b>' + esc(k.ad || '—') + '</b>' +
            (k.onay ? ' <span class="pill PAID">onaylı</span>' : ' <span class="pill SOON">onay bekliyor</span>') +
            '<div class="muted">' + esc(k.email || '') + (k.rol === 'yonetici' ? ' · yönetici' : '') + '</div></div>' +
            (ben ? '' : '<div class="acts">' + (k.onay
              ? '<button class="btn sm dang" data-hk="kaldir" data-id="' + esc(k.id) + '">Erişimi kaldır</button>'
              : '<button class="btn sm pri" data-hk="onayla" data-id="' + esc(k.id) + '">Onayla</button>' +
                '<button class="btn sm dang" data-hk="sil" data-id="' + esc(k.id) + '">Reddet</button>') + '</div>') +
            '</div>';
        }).join('') : '<div class="muted">Yükleniyor…</div>') +
        '<div class="muted" style="margin-top:10px">Zeynep ya da başka biri uygulamanın adresinden "Kayıt ol" dediğinde burada görünür; sen onaylayınca girebilir.</div>'
      : '');
    host.querySelector('#hCikis').onclick = cikis;
    host.querySelectorAll('[data-hk]').forEach(function (b) {
      b.onclick = function () {
        var r = db.doc('kullanicilar/' + b.dataset.id);
        var is = b.dataset.hk === 'onayla' ? r.update({ onay: true })
          : b.dataset.hk === 'kaldir' ? r.update({ onay: false }) : r.delete();
        b.disabled = true;
        is.catch(function (e) { alert(hataMetni(e)); });
      };
    });
  }
  if (yonetici && !kullaniciAboneligi) {
    kullaniciAboneligi = db.collection('kullanicilar').onSnapshot(function (s) {
      kullaniciListesi = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .sort(function (a, b) { return (a.onay === b.onay ? 0 : a.onay ? 1 : -1) || (a.at < b.at ? -1 : 1); });
      var h = document.getElementById('hesapPanel'); if (h) { host = h; ciz(); }
    });
  }
  ciz();
}

/* ── app.js bunu çağırır: girişten ve onaydan sonra veritabanını verir ── */
window.HZ_VERI = function () {
  return new Promise(function (resolve) {
    coz = resolve;
    if (!kurulu || typeof firebase === 'undefined') { kurulumEksik(); return; }
    var app = firebase.initializeApp(cfg);
    auth = app.auth(); db = app.firestore();
    auth.languageCode = 'tr';
    db.settings({ ignoreUndefinedProperties: true, merge: true });
    if (EMU) { auth.useEmulator(EMU.auth, { disableWarnings: true }); db.useEmulator(EMU.host, EMU.port); }
    else db.enablePersistence({ synchronizeTabs: true }).catch(function () { });  /* çevrimdışı açılış */
    window.HZ_HESAP = { ciz: hesapCiz };
    auth.onAuthStateChanged(function (u) {
      if (u) yetkiKontrol(u).catch(function (e) { bekleEkrani(hataMetni(e)); });
      else if (cozuldu) location.reload();
      else girisEkrani('giris');
    });
  });
};
})();
