// HPの動き：メニュー表の男女切り替え・ヘッダーの線・スマホ下の予約ボタン
(function () {
  "use strict";

  // LINE のリッチメニュー（liff.line.me/…/reserve.html など）から開くと、まずこのページが開く。
  // LIFF に初期化してもらうと、予約画面・マイページへ送り直してくれる（その間は画面を隠す）
  var LINE = window.Salon8Line;
  if (LINE && LINE.available && !LINE.mock && /[?&]liff\.state=/.test(location.search)) {
    var root = document.documentElement;
    root.style.visibility = "hidden";
    var showAgain = function () { root.style.visibility = ""; };
    setTimeout(showAgain, 4000);
    LINE.init().then(showAgain, showAgain);
  }

  var DATA = window.SALON8_DATA;
  var menus = DATA.menus;
  var list = document.getElementById("menu-list");
  var tabs = document.querySelectorAll("#menu .seg button");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function priceHTML(m) {
    if (m.price == null) return '<span class="pending">料金確認中</span>';
    return '<span class="num">' + Number(m.price).toLocaleString("ja-JP") + "</span>円" + (m.tbd ? '<span class="tbd">仮</span>' : "");
  }

  function render(gender) {
    list.innerHTML = menus.filter(function (m) { return m.gender === gender; }).map(function (m) {
      return '<a class="menu-row" href="reserve.html?menu=' + encodeURIComponent(m.id) + '">' +
        '<div><div class="menu-name">' + esc(m.name) + '</div>' +
        '<div class="menu-time">目安 ' + m.minutes + "分" + (m.tbd ? '<span class="tbd">仮</span>' : "") + "</div></div>" +
        '<div class="menu-price">' + priceHTML(m) + '<div class="menu-go">予約する →</div></div>' +
        "</a>";
    }).join("");
    tabs.forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.g === gender)); });
  }
  tabs.forEach(function (b) { b.addEventListener("click", function () { render(b.dataset.g); }); });
  render("male");

  // 本番の予約システムがつながっていたら、メニュー表もスプレッドシートの内容に合わせる
  var API = window.Salon8API;
  if (API && !API.DEMO) {
    API.getConfig().then(function (c) {
      if (c && c.menus && c.menus.length) {
        menus = c.menus;
        var cur = document.querySelector('#menu .seg button[aria-selected="true"]');
        render(cur ? cur.dataset.g : "male");
      }
    }).catch(function () { /* 読めなければ data.js のまま */ });
  }

  var header = document.querySelector(".site-header");
  var bar = document.getElementById("bottom-bar");
  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle("scrolled", y > 8);
    bar.classList.toggle("show", y > 420);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
