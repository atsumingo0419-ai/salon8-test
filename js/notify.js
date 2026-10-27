// お店用：予約・変更・キャンセルを自分の LINE に届けてもらう申し込み（notify.html）
// 申し込むと「承認待ち」になり、お店の管理者が予約シートの「お店の通知先」で「する」にした人にだけ届く（Code.gs の shopNotify_）
(function () {
  "use strict";

  var API = window.Salon8API, LINE = window.Salon8Line;

  function $(s) { return document.querySelector(s); }
  function error(html) { $("#boot").hidden = true; $("#error").innerHTML = html; $("#error").hidden = false; }
  function relogin() {
    error('LINEのログインの期限が切れました。<button type="button" class="link-btn" id="relogin">LINEでログインし直す</button>');
    $("#relogin").addEventListener("click", function () { LINE.relogin(); });
  }

  var TEXT = {
    "未登録": ["まだ申し込んでいません", "申し込むと、お店の管理者が承認したあとで、このLINEに予約のお知らせが届くようになります。"],
    "しない": ["今は届かない設定です", "もう一度届くようにするには、申し込み直してください（管理者の承認がもう一度いります）。"],
    "承認待ち": ["承認待ちです", "申し込みました。お店の管理者が予約シートの「お店の通知先」で「通知」を「する」にすると届くようになります。"],
    "する": ["このLINEに届きます", "予約・変更・キャンセルが入ると、このLINEにお知らせが届きます。"]
  };

  function render(r) {
    $("#boot").hidden = true;
    if (r.lineUrl) $("#friend-link").href = r.lineUrl;
    var st = TEXT[r.state] ? r.state : "未登録";
    $("#state-title").textContent = TEXT[st][0];
    $("#state-text").textContent = TEXT[st][1];
    $("#act-apply").hidden = !(st === "未登録" || st === "しない");
    $("#act-wait").hidden = st !== "承認待ち";
    $("#act-on").hidden = st !== "する";
    $("#off").hidden = r.enabled !== false;
    $("#card").hidden = false;
    // 友だちでないと届かないので、先に知らせる（分からないときは何も出さない）
    LINE.friendship().then(function (f) { $("#friend").hidden = f !== false; });
  }

  function busy(btn, label) {
    btn.disabled = true;
    btn.dataset.label = btn.textContent;
    btn.innerHTML = '<span class="spinner" style="border-color:rgba(127,127,127,.3);border-top-color:currentColor"></span>' + label;
  }
  function idle(btn) { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }

  function call(op, btn, label) {
    $("#error").hidden = true;
    $("#notice").hidden = true;
    if (btn) busy(btn, label);
    return API.shopNotify(LINE.idToken(), op).then(function (r) {
      if (btn) idle(btn);
      if (r && r.ok === false) {
        if (r.reason === "auth") relogin();
        else if (r.reason === "notapproved") { error("まだ承認されていないため、テストは送れません。"); load(); }
        else error(r.message || "うまくいきませんでした。時間をおいてもう一度お試しください。");
        return null;
      }
      render(r);
      return r;
    }).catch(function () {
      if (btn) idle(btn);
      error("通信できませんでした。時間をおいてもう一度お試しください。");
      return null;
    });
  }
  function load() { return call("status"); }
  function notice(text) { $("#notice").textContent = text; $("#notice").hidden = false; }

  $("#apply").addEventListener("click", function () { call("apply", this, "申し込み中…"); });
  $("#reload").addEventListener("click", function () { call("status", this, "確認中…"); });
  $("#test").addEventListener("click", function () {
    call("test", this, "送信中…").then(function (r) {
      if (!r) return;
      if (r.pushed) notice("テストを送りました。LINEのトークを確かめてください。");
      else error("送れませんでした。公式LINEを友だち追加しているか、ブロックしていないか確かめてください。");
    });
  });
  $("#stop").addEventListener("click", function () {
    call("stop", this, "処理中…").then(function (r) {
      if (r) notice("通知を止めました。");
    });
  });

  // ---- はじめ ----
  if (API.DEMO) $("#demo-bar").hidden = false;
  if (!LINE.available) {
    error("このページは、LINEで開いてください（お店のスタッフ用です）。");
    return;
  }
  LINE.init({ requireLogin: true }).then(function () {
    if (!LINE.active()) { relogin(); return; }
    var p = LINE.profile();
    $("#line-chip").textContent = "LINEでログイン中" + (p && p.displayName ? "（" + p.displayName + " さん）" : "");
    $("#line-chip").hidden = false;
    return load();
  });
})();
