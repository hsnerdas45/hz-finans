/* Testler için sahte Firebase (compat API'nin uygulamanın kullandığı kısmı).
   Gerçek Firebase emülatörü bu ortamda indirilemediği için yazıldı.
   · Kullanıcılar ve veri localStorage'da tutulur → aynı tarayıcıdaki iki sekme
     "iki kişi" gibi aynı veritabanını görür; 'storage' olayıyla anlık senkron.
   · firebase/firestore.rules'taki kurallar aşağıda aynı mantıkla uygulanır;
     böylece onaysız kullanıcının veriye erişememesi uygulamanın tepkisiyle birlikte sınanır.
     (Kural dosyasının kendisi gerçek Firebase'de ayrıca doğrulanmalıdır.) */
(function () {
  var K = 'sahteFB_';
  function oku(k, v) { try { return JSON.parse(localStorage.getItem(K + k)) || v; } catch (e) { return v; } }
  function yaz(k, v) { localStorage.setItem(K + k, JSON.stringify(v)); yayinla(); }
  function hata(code) { var e = new Error(code); e.code = code; return Promise.reject(e); }
  var dinleyiciler = [];
  function yayinla() { setTimeout(function () { dinleyiciler.slice().forEach(function (f) { f(); }); }, 0); }
  window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf(K) === 0) yayinla(); });
  window.__sahteFB = { kayitlar: [] };

  /* ── auth ── */
  var mevcut = null, authCb = [];
  function kullaniciNesnesi(u) {
    return { uid: u.uid, email: u.email, displayName: u.ad || null,
      updateProfile: function (p) { var us = oku('users', {}); us[u.email].ad = p.displayName; yaz('users', us); this.displayName = p.displayName; return Promise.resolve(); } };
  }
  function ayarla(u) {
    mevcut = u ? kullaniciNesnesi(u) : null;
    sessionStorage.setItem(K + 'oturum', u ? u.email : '');
    authCb.forEach(function (f) { setTimeout(function () { f(mevcut); }, 0); });
  }
  var auth = {
    languageCode: 'tr', useEmulator: function () { },
    get currentUser() { return mevcut; },
    onAuthStateChanged: function (cb) {
      authCb.push(cb);
      var e = sessionStorage.getItem(K + 'oturum'), us = oku('users', {});
      if (e && us[e]) mevcut = kullaniciNesnesi(us[e]);
      setTimeout(function () { cb(mevcut); }, 0);
    },
    createUserWithEmailAndPassword: function (email, pw) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) return hata('auth/invalid-email');
      if (!pw || pw.length < 6) return hata('auth/weak-password');
      var us = oku('users', {}); if (us[email]) return hata('auth/email-already-in-use');
      us[email] = { uid: 'u' + Math.random().toString(36).slice(2, 10), email: email, pw: pw }; yaz('users', us);
      ayarla(us[email]); return Promise.resolve({ user: mevcut });
    },
    signInWithEmailAndPassword: function (email, pw) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) return hata('auth/invalid-email');
      var u = oku('users', {})[email];
      if (!u || u.pw !== pw) return hata('auth/invalid-credential');
      ayarla(u); return Promise.resolve({ user: mevcut });
    },
    sendPasswordResetEmail: function (email) { window.__sahteFB.kayitlar.push('sifirlama:' + email); return Promise.resolve(); },
    signInWithPopup: function () { return hata('auth/popup-closed-by-user'); },
    signInWithRedirect: function () { return Promise.resolve(); },
    signOut: function () { ayarla(null); return Promise.resolve(); }
  };

  /* ── kurallar (firestore.rules ile aynı mantık) ── */
  var VERI = ['config', 'cards', 'recurring', 'plans', 'imports', 'tx'];
  function belgeler() { return oku('docs', {}); }
  function yonetici() { var k = belgeler()['meta/kurulum']; return !!(mevcut && k && k.yonetici === mevcut.uid); }
  function onayli() { if (yonetici()) return true; var p = mevcut && belgeler()['kullanicilar/' + mevcut.uid]; return !!(p && p.onay === true); }
  function izin(yol, islem, yeni, eski) {
    if (!mevcut) return false;
    var p = yol.split('/'), kol = p[0], id = p[1];
    if (yol === 'meta/kurulum') {
      if (islem === 'read') return true;
      if (islem === 'create') return yeni && yeni.yonetici === mevcut.uid && Object.keys(yeni).every(function (k) { return k === 'yonetici' || k === 'at'; });
      return false;
    }
    if (kol === 'kullanicilar') {
      if (islem === 'read') return id === undefined ? yonetici() : (mevcut.uid === id || yonetici());
      if (islem === 'create') return mevcut.uid === id && yeni.onay === false && yeni.rol === 'uye';
      if (islem === 'update') return yonetici() || (mevcut.uid === id && yeni.onay === eski.onay && yeni.rol === eski.rol);
      if (islem === 'delete') return yonetici();
    }
    return VERI.indexOf(kol) >= 0 && onayli();
  }
  function kopya(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function belgeSnap(yol) {
    var d = belgeler()[yol];
    return { exists: d !== undefined, id: yol.split('/').pop(), data: function () { return kopya(d); } };
  }
  function belge(yol) {
    return {
      get: function () { return izin(yol, 'read') ? Promise.resolve(belgeSnap(yol)) : hata('permission-denied'); },
      set: function (v) {
        var b = belgeler(), eski = b[yol], v2 = kopya(v);
        if (!izin(yol, eski === undefined ? 'create' : 'update', v2, eski)) return hata('permission-denied');
        b[yol] = v2; yaz('docs', b); return Promise.resolve();
      },
      update: function (v) {
        var b = belgeler(), eski = b[yol]; if (eski === undefined) return hata('not-found');
        var y = Object.assign({}, eski, kopya(v));
        if (!izin(yol, 'update', y, eski)) return hata('permission-denied');
        b[yol] = y; yaz('docs', b); return Promise.resolve();
      },
      delete: function () {
        if (!izin(yol, 'delete')) return hata('permission-denied');
        var b = belgeler(); delete b[yol]; yaz('docs', b); return Promise.resolve();
      },
      onSnapshot: function (cb, err) {
        var son = null, iptal = false;
        function f() {
          if (iptal) return;
          if (!izin(yol, 'read')) { if (err) err({ code: 'permission-denied' }); return; }
          var s = JSON.stringify(belgeler()[yol]); if (s === son) return; son = s; cb(belgeSnap(yol));
        }
        dinleyiciler.push(f); setTimeout(f, 0);
        return function () { iptal = true; };
      }
    };
  }
  function sorgu(kol, sirala, sinir) {
    function liste() {
      var b = belgeler(), out = Object.keys(b).filter(function (k) { return k.split('/')[0] === kol && k.split('/').length === 2; })
        .map(function (k) { return { id: k.split('/')[1], v: b[k] }; });
      if (sirala) out.sort(function (a, c) { var x = a.v[sirala[0]], y = c.v[sirala[0]]; return (x < y ? -1 : x > y ? 1 : 0) * (sirala[1] === 'desc' ? -1 : 1); });
      if (sinir) out = out.slice(0, sinir);
      return out;
    }
    return {
      orderBy: function (f, d) { return sorgu(kol, [f, d || 'asc'], sinir); },
      limit: function (n) { return sorgu(kol, sirala, n); },
      onSnapshot: function (cb, err) {
        var son = null;
        function f() {
          if (!izin(kol, 'read')) { if (err) err({ code: 'permission-denied' }); return; }
          var l = liste(), s = JSON.stringify(l); if (s === son) return; son = s;
          cb({ docs: l.map(function (x) { return { id: x.id, data: function () { return kopya(x.v); } }; }) });
        }
        dinleyiciler.push(f); setTimeout(f, 0);
        return function () { };
      }
    };
  }
  var fs = { settings: function () { }, useEmulator: function () { }, enablePersistence: function () { return Promise.resolve(); },
    doc: belge, collection: function (k) { return sorgu(k); } };

  window.firebase = {
    initializeApp: function () { return { auth: function () { return auth; }, firestore: function () { return fs; } }; },
    auth: { GoogleAuthProvider: function () { } }
  };
})();
