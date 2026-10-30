// マイページ：LINE の中で開いて、自分のこれからの予約を見る・日時を変える・キャンセルする。これまでの予約も見られる
// 本人かどうかはサーバー（Code.gs の me_ / cancel_）が LINE のログイン情報で確かめる
(function () {
  "use strict";

  var API = window.Salon8API, U = API.util, LINE = window.Salon8Line;
  var DATA = window.SALON8_DATA;
  var WDAY = ["日", "月", "火", "水", "木", "金", "土"];
  var hours = (DATA.settings && DATA.settings.cancelHours) || 24;
  var target = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function yen(p) { return p == null ? "料金は当日ご案内" : Number(p).toLocaleString("ja-JP") + "円"; }
  function dateJa(d) { var p = U.parseYmd(d); return p.m + "月" + p.d + "日（" + WDAY[U.dow(d)] + "）"; }
  function error(html) { $("#boot").hidden = true; $("#error").innerHTML = html; $("#error").hidden = false; }
  function relogin() {
    error('LINEのログインの期限が切れました。<button type="button" class="link-btn" id="relogin">LINEでログインし直す</button>');
    $("#relogin").addEventListener("click", function () { LINE.relogin(); });
  }

  // これまでのご予約（新しい順・サーバーが20件までにしている）。今年でない日は年もつける
  function renderHistory(hist) {
    var year = U.todayJST().slice(0, 4);
    $("#hist").hidden = hist.length === 0;
    $("#hist-list").innerHTML = hist.map(function (b) {
      var y = b.date.slice(0, 4);
      return "<li>" +
        '<span class="hist-date">' + (y !== year ? esc(y) + "年" : "") + esc(dateJa(b.date)) + "</span>" +
        '<span class="hist-menu">' + esc(b.menuName) + "</span>" +
        '<span class="hist-staff">担当 ' + esc(b.staffName) + "</span>" +
        "</li>";
    }).join("");
  }

  function render(me) {
    $("#boot").hidden = true;
    hours = me.cancelHours || hours;
    if (me.lineUrl) $("#talk").href = me.lineUrl;
    $("#note").textContent = "変更・キャンセルは、ご予約の" + hours + "時間前までこの画面からできます。それを過ぎたら、お手数ですがトークでご連絡ください。WEBサイト（ブラウザ）からご予約いただいた分は、ここには表示されません。";
    renderHistory(me.history || []);
    var list = me.bookings || [];
    $("#empty").hidden = list.length > 0;
    $("#list").innerHTML = list.map(function (b) {
      // 今は受け付けていないメニュー・担当（movable が false）は、日時の変更だけトークで
      var cancelBtn = '<button type="button" class="btn btn-danger" data-cancel="' + esc(b.id) + '">キャンセル</button>';
      var actions = !b.changeable
        ? '<p class="bk-note">変更・キャンセルの締切（' + hours + "時間前）を過ぎています。トークでご連絡ください。</p>"
        : b.movable === false
          ? '<div class="bk-actions">' + cancelBtn + '</div><p class="bk-note">このご予約の日時の変更は、トークでご連絡ください。</p>'
          : '<div class="bk-actions">' +
              '<a class="btn btn-ghost" href="' + esc(LINE.link("reserve.html?change=" + encodeURIComponent(b.id))) + '">日時を変更</a>' +
              cancelBtn +
            "</div>";
      return '<div class="bk-card">' +
        '<div class="bk-date">' + esc(dateJa(b.date)) + ' <span class="bk-time">' + esc(b.time) + "〜" + esc(b.end) + "</span></div>" +
        '<p class="bk-meta"><b>' + esc(b.menuName) + "</b>　担当 " + esc(b.staffName) + "　" + esc(yen(b.price)) + "</p>" +
        '<p class="bk-id">予約番号 ' + esc(b.id) + "</p>" +
        actions +
        "</div>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("[data-cancel]"), function (btn) {
      btn.addEventListener("click", function () {
        target = list.filter(function (b) { return b.id === btn.dataset.cancel; })[0];
        $("#cancel-body").innerHTML = "<p><b>" + esc(dateJa(target.date)) + " " + esc(target.time) + "〜" + esc(target.end) + "</b><br>" +
          esc(target.menuName) + "　担当 " + esc(target.staffName) + "</p><p>キャンセルすると、この時間は他の方が予約できるようになります。</p>";
        $("#cancel-ok").disabled = false;
        $("#cancel-ok").textContent = "キャンセルする";
        $("#cancel-dialog").showModal();
      });
    });
  }

  function load() {
    return API.me(LINE.idToken()).then(function (me) {
      if (me && me.ok === false) { if (me.reason === "auth") relogin(); else error("読み込めませんでした。"); return; }
      render(me);
    }).catch(function () { error("読み込めませんでした。時間をおいてもう一度開いてください。"); });
  }

  // キャンセルを確定
  var dlg = $("#cancel-dialog");
  Array.prototype.forEach.call(dlg.querySelectorAll("[data-close]"), function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  $("#cancel-ok").addEventListener("click", function () {
    var btn = this;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-color:rgba(180,71,63,.3);border-top-color:#B4473F"></span>キャンセルしています…';
    API.cancel(LINE.idToken(), target.id).then(function (res) {
      dlg.close();
      if (res && res.ok) {
        $("#notice").textContent = dateJa(target.date) + " " + target.time + " のご予約をキャンセルしました。" + (API.DEMO ? "" : "LINEにもお知らせをお送りしました。");
        $("#notice").hidden = false;
        $("#error").hidden = true;
        return load();
      }
      if (res && res.reason === "auth") return relogin();
      if (res && res.reason === "deadline") return error("締切（" + (res.hours || hours) + "時間前）を過ぎたため、キャンセルできませんでした。トークでご連絡ください。");
      if (res && res.reason === "notfound") { error("このご予約はすでに変更・キャンセルされています。"); return load(); }
      error("キャンセルできませんでした。時間をおいてもう一度お試しいただくか、トークでご連絡ください。");
    }).catch(function () {
      dlg.close();
      error("通信できませんでした。時間をおいてもう一度お試しください。");
    });
  });

  // ---- はじめ ----
  if (API.DEMO) $("#demo-bar").hidden = false;
  $("#new").href = LINE.link("reserve.html?from=line");
  if (!LINE.available) {
    error("このページは、公式LINEのメニュー「予約の確認・キャンセル」から開いてください。");
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
