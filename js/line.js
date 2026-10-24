// LINE の中（LIFF）で開いたときのログインまわり。
// config.js の LIFF_ID が空なら何もしない（ふつうの WEB 予約のまま）。
// ?mockline=1 のときは、LINE で開いてログインしたふりをする（試作の確認用。デモモードの API と組み合わせる）。
(function () {
  "use strict";

  var CFG = window.SALON8_CONFIG || {};
  var LIFF_ID = (CFG.LIFF_ID || "").trim();
  var MOCK = /[?&]mockline=1\b/.test(location.search);
  var st = { loggedIn: false, inClient: false, profile: null };

  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.liff) return resolve();
      var s = document.createElement("script");
      s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  window.Salon8Line = {
    available: !!LIFF_ID || MOCK,
    mock: MOCK,

    // opts.requireLogin：ログインしていなければ LINE ログインへ（マイページ用）
    // LINE アプリの中で開いたときは、何もしなくてもログイン済みになる
    init: function (opts) {
      opts = opts || {};
      if (MOCK) {
        st = { loggedIn: true, inClient: true, profile: { displayName: "テスト" } };
        return Promise.resolve(st);
      }
      if (!LIFF_ID) return Promise.resolve(st);
      return loadSdk().then(function () {
        return window.liff.init({ liffId: LIFF_ID });
      }).then(function () {
        var liff = window.liff;
        st.inClient = liff.isInClient();
        st.loggedIn = liff.isLoggedIn();
        if (!st.loggedIn && (opts.requireLogin || st.inClient)) {
          liff.login({ redirectUri: location.href });
          return new Promise(function () {}); // ログイン画面へ移るので、ここで止める
        }
        if (!st.loggedIn) return st;
        return liff.getProfile().then(function (p) { st.profile = p; return st; }, function () { return st; });
      }).catch(function (err) {
        console.error(err);
        return st;
      });
    },

    active: function () { return st.loggedIn; },
    profile: function () { return st.profile; },
    // サーバーで本人確認するためのトークン（期限があるので、使うたびに取り直す）
    idToken: function () {
      if (MOCK) return "mock:U-mock";
      return st.loggedIn && window.liff ? window.liff.getIDToken() : null;
    },
    // ログインの期限が切れたとき
    relogin: function () {
      if (MOCK) { location.reload(); return; }
      if (window.liff) {
        if (window.liff.isLoggedIn()) window.liff.logout();
        window.liff.login({ redirectUri: location.href });
      }
    },
    // 試作の確認用に ?mockline=1 をリンクにも引き継ぐ
    link: function (href) {
      if (!MOCK) return href;
      return href + (href.indexOf("?") < 0 ? "?" : "&") + "mockline=1";
    }
  };
})();
