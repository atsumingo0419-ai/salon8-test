// 予約フォーム：メニュー → スタッフ → 日時（空き枠カレンダー）→ お客様情報 → 確認 → 完了
// LINE の中で開いたとき（line.js）：前回の入力を自動で入れる・予約確認は LINE に届く・?change=予約番号 で日時の変更
(function () {
  "use strict";

  var API = window.Salon8API, U = API.util;
  var LINE = window.Salon8Line || { available: false, init: function () { return Promise.resolve({}); }, active: function () { return false; }, link: function (h) { return h; } };
  var DATA = window.SALON8_DATA;
  var params = new URLSearchParams(location.search);
  var WDAY = ["日", "月", "火", "水", "木", "金", "土"];

  var CONFIG = null;
  var state = {
    step: 1,
    gender: "male",
    menu: null,
    staff: null,
    month: null,     // "2026-11"
    date: null,      // "2026-11-03"
    time: null,      // "10:00"
    slots: {},       // 月ごとの空き枠 { "2026-11": { "2026-11-03": [...] } }
    form: {},
    booked: null,
    line: false,     // LINE でログインして開いている
    profile: null,   // 前回 LINE で予約したときの入力
    change: null,    // 日時の変更中なら、元の予約
    reqId: null,     // 受付番号（押し直しても二重予約にならないように、同じ内容なら同じ番号で送る）
    reqKey: "",
    source: ({ line: "LINE", instagram: "Instagram", ig: "Instagram" })[params.get("from")] || "HP"
  };

  // 手順を進めたら一瞬で先頭へ（スーッと流れると待たされる感じになる）。下に引っぱって読み直すと入力が消えるので止める
  document.documentElement.style.scrollBehavior = "auto";
  document.documentElement.style.overscrollBehaviorY = "none";

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function yen(p) { return p == null ? "料金確認中" : Number(p).toLocaleString("ja-JP") + "円"; }
  function genderJa(g) { return g === "female" ? "女性" : "男性"; }
  function menuLabel(m) { return m.name + "【" + genderJa(m.gender) + "】"; }
  function dateJa(d) { var p = U.parseYmd(d); return p.m + "月" + p.d + "日（" + WDAY[U.dow(d)] + "）"; }
  function endTime(t, minutes) { return U.toHM(U.toMin(t) + minutes); }
  function monthOf(d) { return d.slice(0, 7); }
  function shiftMonth(month, n) {
    var a = month.split("-").map(Number), t = new Date(Date.UTC(a[0], a[1] - 1 + n, 1));
    return t.getUTCFullYear() + "-" + U.pad(t.getUTCMonth() + 1);
  }
  // 担当制：選んだスタッフでの料金・時間（スタッフを選ぶ前はメニューのまま）
  function effOf(staff, menu) { return U.effective(staff, menu, CONFIG.staffMenus); }
  function eff() { return (state.staff && effOf(state.staff, state.menu)) || { price: state.menu.price, minutes: state.menu.minutes }; }
  function show(id, on) { var el = $(id); if (el) el.hidden = !on; return el; }

  // ---- 画面の切り替え ----
  // 画面が変わった直後のタップは受けない（トントンと2回押すと、次の画面のカードまで押されてしまうので）
  // 経過時間は performance.now で測る（端末の時計が巻き戻っても押せなくならない）
  var shownAt = 0;
  function tooSoon() { return performance.now() - shownAt < 400; }
  function go(n, push) {
    state.step = n;
    shownAt = performance.now();
    $$(".r-step").forEach(function (sec) { sec.hidden = Number(sec.dataset.step) !== n; });
    $$("#progress li").forEach(function (li) {
      var p = Number(li.dataset.p);
      li.classList.toggle("done", p < n);
      li.classList.toggle("now", p === n);
    });
    $("#progress").hidden = n === 6;
    ({ 1: renderMenus, 2: renderStaff, 3: renderDate, 4: renderForm, 5: renderConfirm, 6: renderDone })[n]();
    $$("[data-picked]").forEach(renderPicked);
    if (push !== false) history.pushState({ step: n }, "");
    window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", function (e) {
    if (state.booked) { location.href = state.line ? LINE.link("mypage.html") : "index.html"; return; }
    var n = (e.state && e.state.step) || 1;
    if (state.change && n < 3) { location.href = LINE.link("mypage.html"); return; }
    // 選んでいないところより先には戻れないように
    if (n >= 2 && !state.menu) n = 1;
    if (n >= 3 && !state.staff) n = 2;
    if (n >= 4 && !state.time) n = 3;
    if (n >= 5 && !state.form.name) n = 4;
    go(n, false);
  });
  $$("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (state.change && state.step === 3) { location.href = LINE.link("mypage.html"); return; }
      history.back();
    });
  });

  // これまでに選んだもの
  function renderPicked(dl) {
    var rows = [];
    if (state.change && state.step > 1) rows.push(["変更前", dateJa(state.change.date) + " " + state.change.time + "〜" + state.change.end]);
    if (state.menu && state.step > 1) rows.push(["メニュー", menuLabel(state.menu) + "　" + yen(eff().price)]);
    if (state.staff && state.step > 2) rows.push(["担当", state.staff.name]);
    if (state.time && state.step > 3) {
      rows.push([state.change ? "変更後" : "日時", dateJa(state.date) + " " + state.time + "〜" + endTime(state.time, eff().minutes)]);
    }
    dl.innerHTML = rows.map(function (r) {
      return "<div><dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd></div>";
    }).join("");
    dl.hidden = !rows.length;
  }

  // ---- 1. メニュー ----
  var segBtns = $$('[data-step="1"] .seg button');
  segBtns.forEach(function (b) {
    b.addEventListener("click", function () { state.gender = b.dataset.g; renderMenus(); });
  });
  function renderMenus() {
    segBtns.forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.g === state.gender)); });
    var box = $("#menu-picks");
    box.innerHTML = CONFIG.menus.filter(function (m) { return m.gender === state.gender; }).map(function (m) {
      var price = m.price == null
        ? '<span class="pending">料金確認中</span>'
        : '<span class="num">' + Number(m.price).toLocaleString("ja-JP") + "</span>円";
      return '<button type="button" class="pick' + (state.menu && state.menu.id === m.id ? " selected" : "") + '" data-id="' + esc(m.id) + '">' +
        '<span class="pick-name">' + esc(m.name) + "</span>" +
        '<span class="pick-price">' + price + "</span>" +
        '<span class="pick-meta">目安 ' + m.minutes + "分" + (m.tbd ? '<span class="tbd">仮</span>' : "") + "</span>" +
        "</button>";
    }).join("");
    $$(".pick", box).forEach(function (el) {
      el.addEventListener("click", function () {
        if (tooSoon()) return;
        var m = CONFIG.menus.filter(function (x) { return x.id === el.dataset.id; })[0];
        if (!state.menu || state.menu.id !== m.id) { state.slots = {}; state.date = null; state.time = null; }
        state.menu = m;
        if (state.staff && !effOf(state.staff, m)) state.staff = null;
        go(2);
      });
    });
  }

  // ---- 2. スタッフ ----
  function initialOf(name) { return Array.from(name).pop() || ""; } // 絵文字で終わる名前でも割れないように
  function renderStaff() {
    var box = $("#staff-picks");
    var list = CONFIG.staff.filter(function (s) { return !!effOf(s, state.menu); });
    if (!list.length) {
      box.innerHTML = '<p class="cal-msg">このメニューを担当できるスタッフがいません。公式LINEからご相談ください。</p>';
      return;
    }
    box.innerHTML = list.map(function (s) {
      var face = s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : esc(initialOf(s.name));
      var e = effOf(s, state.menu);
      // 担当制：このスタッフだけ料金や時間が違うときは、カードに出す
      var diff = e.price !== state.menu.price || e.minutes !== state.menu.minutes
        ? '<span class="pick-meta staff-price">' + esc(yen(e.price)) + "・目安 " + e.minutes + "分</span>" : "";
      return '<button type="button" class="pick staff-pick' + (state.staff && state.staff.id === s.id ? " selected" : "") + '" data-id="' + esc(s.id) + '">' +
        '<span class="avatar">' + face + "</span>" +
        '<span class="pick-name">' + esc(s.name) + (API.DEMO ? '<span class="tbd">仮</span>' : "") + "</span>" +
        '<span class="chev" aria-hidden="true">›</span>' +
        '<span class="pick-meta">' + esc(s.intro || "") + "</span>" + diff +
        "</button>";
    }).join("");
    // 写真が読めないとき（Google ドライブの共有リンクなど）は頭文字に戻す
    $$(".avatar img", box).forEach(function (img) {
      img.addEventListener("error", function () {
        var s = CONFIG.staff.filter(function (x) { return x.id === img.closest(".pick").dataset.id; })[0];
        img.parentNode.textContent = initialOf(s.name);
      });
    });
    $$(".pick", box).forEach(function (el) {
      el.addEventListener("click", function () {
        if (tooSoon()) return;
        var s = CONFIG.staff.filter(function (x) { return x.id === el.dataset.id; })[0];
        if (!state.staff || state.staff.id !== s.id) { state.slots = {}; state.date = null; state.time = null; }
        state.staff = s;
        go(3);
      });
    });
  }

  // ---- 3. 日時 ----
  var today = U.todayJST();
  var firstMonth = monthOf(today);
  function lastMonth() { return monthOf(U.addDays(today, Number(CONFIG.settings.horizonDays) || 60)); }

  $("#cal-prev").addEventListener("click", function () { state.month = shiftMonth(state.month, -1); state.date = null; loadMonth(); });
  $("#cal-next").addEventListener("click", function () { state.month = shiftMonth(state.month, 1); state.date = null; loadMonth(); });

  function renderDate() {
    if (!state.month) state.month = state.date ? monthOf(state.date) : firstMonth;
    loadMonth();
  }

  var loadSeq = 0;
  function loadMonth() {
    var month = state.month, seq = ++loadSeq;
    // 前の月の読み込み中に月を戻すと、薄いまま押せなくなるので、まず外す
    $("#cal").classList.remove("cal-loading");
    drawCalendar();
    if (state.slots[month]) { autoPick(); return; }
    $("#cal").classList.add("cal-loading");
    $("#cal-msg").hidden = false;
    $("#cal-msg").textContent = "空き状況を確認しています…";
    // 変更のときは、自分の元の枠も空いている扱いで出す（本人確認つき）
    var req = state.change
      ? API.changeSlots(LINE.idToken(), state.change.id, state.staff.id, state.menu.id, month)
      : API.getMonthSlots(state.staff.id, state.menu.id, month);
    req.then(function (res) {
      if (seq !== loadSeq) return;
      if (res && res.ok === false) { if (res.reason === "auth") authError(); throw new Error(res.reason); }
      state.slots[month] = res.days || {};
      $("#cal").classList.remove("cal-loading");
      drawCalendar();
      autoPick();
    }).catch(function () {
      if (seq !== loadSeq) return;
      $("#cal").classList.remove("cal-loading");
      $("#cal-msg").hidden = false;
      $("#cal-msg").innerHTML = '空き状況を読み込めませんでした。<button type="button" class="link-btn" id="cal-retry">もう一度読み込む</button>';
      $("#cal-retry").addEventListener("click", loadMonth);
    });
  }

  // 月を開いたとき、選んでいた日があればその時間を出す。この月に空きがなければ案内
  function autoPick() {
    var days = state.slots[state.month] || {};
    var any = Object.keys(days).some(function (d) { return days[d] && days[d].length; });
    var msg = $("#cal-msg");
    if (!any) {
      msg.hidden = false;
      msg.textContent = state.month < lastMonth() ? "この月は空きがありません。次の月をご覧ください。" : "この期間は空きがありません。公式LINEからご相談ください。";
    } else {
      msg.hidden = !!state.date;
      msg.textContent = "ご希望の日付を選んでください。";
    }
    drawTimes();
  }

  function drawCalendar() {
    var month = state.month, p = month.split("-").map(Number);
    $("#cal-title").textContent = p[0] + "年" + p[1] + "月";
    $("#cal-prev").disabled = month <= firstMonth;
    $("#cal-next").disabled = month >= lastMonth();
    var days = state.slots[month] || {};
    var html = WDAY.map(function (w, i) {
      return '<div class="cal-dow' + (i === 0 ? " sun" : i === 6 ? " sat" : "") + '">' + w + "</div>";
    }).join("");
    var startDow = U.dow(month + "-01");
    for (var i = 0; i < startDow; i++) html += "<div></div>";
    for (var d = 1; d <= U.daysInMonth(month); d++) {
      var date = month + "-" + U.pad(d);
      var cls = "cal-day", mark = "", label = dateJa(date);
      if (!(date in days)) { cls += " out"; mark = "&nbsp;"; label += " 受付期間外"; }
      else if (days[date] === null) { cls += " off"; mark = "休"; label += " お休み"; }
      else if (!days[date].length) { cls += " full"; mark = "×"; label += " 満席"; }
      else if (days[date].length <= 3) { cls += " ok few"; mark = "△"; label += " 残りわずか"; }
      else { cls += " ok"; mark = "○"; label += " 空きあり"; }
      if (date === today) cls += " today";
      if (date === state.date) cls += " selected";
      var dis = cls.indexOf(" ok") < 0;
      html += '<button type="button" class="' + cls + '" data-date="' + date + '"' + (dis ? " disabled" : "") + ' aria-label="' + label + '">' +
        '<span class="d">' + d + '</span><span class="m">' + mark + "</span></button>";
    }
    var grid = $("#cal-grid");
    grid.innerHTML = html;
    $$(".cal-day.ok", grid).forEach(function (b) {
      b.addEventListener("click", function () {
        if (tooSoon()) return;
        state.date = b.dataset.date;
        state.time = null;
        $$(".cal-day", grid).forEach(function (x) { x.classList.toggle("selected", x === b); });
        $("#cal-msg").hidden = true;
        drawTimes();
        $("#times").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function drawTimes() {
    var box = $("#times"), days = state.slots[state.month] || {};
    var list = state.date && days[state.date];
    if (!list || !list.length) { box.hidden = true; return; }
    box.hidden = false;
    $("#times-title").textContent = dateJa(state.date) + "の空き時間";
    var grid = $("#times-grid");
    grid.innerHTML = list.map(function (t) {
      return '<button type="button" class="time-btn' + (t === state.time ? " selected" : "") + '" data-t="' + t + '">' + t + "</button>";
    }).join("");
    $$(".time-btn", grid).forEach(function (b) {
      b.addEventListener("click", function () {
        if (tooSoon()) return;
        state.time = b.dataset.t;
        show("#taken-alert", false);
        // 変更のときは、前回の情報で入力を省いて確認へ
        if (state.change && profileComplete()) { state.form = formFromProfile(); go(5); return; }
        go(4);
      });
    });
  }

  // ---- 4. お客様情報 ----
  var form = $("#form");

  // 生年月日のプルダウン（15〜80歳くらいまで）
  (function () {
    var thisYear = Number(today.slice(0, 4));
    function fill(sel, first, from, to, unit) {
      var html = '<option value="">' + first + "</option>";
      for (var v = from; from <= to ? v <= to : v >= to; v += from <= to ? 1 : -1) html += '<option value="' + v + '">' + v + unit + "</option>";
      sel.innerHTML = html;
    }
    fill(form.elements.by, "年", thisYear - 15, thisYear - 80, "年");
    fill(form.elements.bm, "月", 1, 12, "月");
    fill(form.elements.bd, "日", 1, 31, "日");
  })();

  // ひらがな・半角カナで入れてもカタカナに直す
  function toKatakana(s) { return s.normalize("NFKC").replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
  form.elements.kana.addEventListener("blur", function () { this.value = toKatakana(this.value); });
  // 全角で打ったメール（ｔａｒｏ＠…）は半角に直して見せる
  function halfEmail(s) { return s.normalize("NFKC").trim(); }
  form.elements.email.addEventListener("blur", function () { this.value = halfEmail(this.value); });
  // 電話番号は数字だけに。iPhone の自動入力などで「+81 90-…」と入ったら、頭の 81 を 0 に戻す
  function telDigits(s) {
    var d = s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[^\d]/g, "");
    var m = d.match(/^810?([1-9]\d{8,9})$/);
    return m ? "0" + m[1] : d;
  }

  // LINE で前に予約した人は、そのときの入力を最初から入れておく
  function profileComplete() {
    var p = state.profile;
    return !!(p && p.name && p.kana && p.sex && p.birth && p.tel && p.email);
  }
  function formFromProfile() {
    var p = state.profile;
    return { name: p.name, kana: p.kana, sex: p.sex, birth: p.birth, tel: p.tel, email: p.email,
      visit: "2回目以降", focus: "", early: "いいえ", note: "", agree: true, website: "" };
  }
  var prefilled = false;
  function renderForm() {
    if (!prefilled && state.profile && !state.form.name) {
      state.form = formFromProfile();
      state.form.agree = false;
      prefilled = true;
      show("#prefill-note", true);
    }
    var f = state.form;
    ["name", "kana", "tel", "email", "focus", "early", "note"].forEach(function (k) { if (f[k] != null) form.elements[k].value = f[k]; });
    // 性別は、まだ選んでいなければメニューの男女に合わせておく
    var sex = f.sex || genderJa(state.menu.gender);
    $$('input[name="sex"]', form).forEach(function (r) { r.checked = r.value === sex; });
    if (f.birth) {
      var b = f.birth.split("-").map(Number);
      form.elements.by.value = b[0]; form.elements.bm.value = b[1]; form.elements.bd.value = b[2];
    }
    if (f.visit) $$('input[name="visit"]', form).forEach(function (r) { r.checked = r.value === f.visit; });
    if (f.agree) form.elements.agree.checked = true;
  }
  function fieldOk(name, ok) { $('[data-f="' + name + '"]', form).classList.toggle("invalid", !ok); return ok; }
  function oneSpace(s) { return s.trim().replace(/[\s　]+/g, " "); }
  function readForm() {
    var visit = $('input[name="visit"]:checked', form), sex = $('input[name="sex"]:checked', form);
    var by = form.elements.by.value, bm = form.elements.bm.value, bd = form.elements.bd.value;
    return {
      name: oneSpace(form.elements.name.value),
      kana: oneSpace(toKatakana(form.elements.kana.value)),
      sex: sex ? sex.value : "",
      birth: by && bm && bd ? by + "-" + U.pad(Number(bm)) + "-" + U.pad(Number(bd)) : "",
      tel: telDigits(form.elements.tel.value),
      email: halfEmail(form.elements.email.value),
      visit: visit ? visit.value : "",
      focus: form.elements.focus.value.trim(),
      early: form.elements.early.value,
      note: form.elements.note.value.trim(),
      agree: form.elements.agree.checked,
      website: form.elements.s8_hp.value
    };
  }
  function realDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = U.parseYmd(s), t = new Date(Date.UTC(p.y, p.m - 1, p.d));
    return t.getUTCMonth() === p.m - 1 && s < today; // 2月30日などはだめ
  }
  function validate(f) {
    var ok = true;
    ok = fieldOk("name", /^\S+ \S+/.test(f.name)) && ok;
    ok = fieldOk("kana", /^[ァ-ヺー・]+( [ァ-ヺー・]+)+$/.test(f.kana)) && ok;
    ok = fieldOk("sex", !!f.sex) && ok;
    ok = fieldOk("birth", realDate(f.birth)) && ok;
    ok = fieldOk("tel", /^0\d{9,10}$/.test(f.tel)) && ok;
    ok = fieldOk("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) && /^[\x21-\x7E]+$/.test(f.email)) && ok;
    ok = fieldOk("visit", !!f.visit) && ok;
    ok = fieldOk("agree", f.agree) && ok;
    return ok;
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = readForm();
    if (!validate(f)) {
      var first = $(".field.invalid", form);
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    state.form = f;
    go(5);
  });
  // 直したらその場で赤を消す
  form.addEventListener("input", function (e) {
    var field = e.target.closest(".field");
    if (field && field.classList.contains("invalid")) field.classList.remove("invalid");
  });

  // プライバシーポリシーは別ページに飛ばさず、重ねて開く（LINEの中のブラウザで入力が消えないように）
  var dlg = $("#privacy-dialog"), privacyLoaded = false;
  var privacyUrl = $("#open-privacy").dataset.src || "privacy.html";
  $("#open-privacy").addEventListener("click", function () {
    if (!dlg.showModal) { location.href = privacyUrl; return; }
    dlg.showModal();
    if (privacyLoaded) return;
    fetch(privacyUrl).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var main = doc.querySelector("main");
      $("#privacy-body").innerHTML = main ? main.innerHTML : "";
      privacyLoaded = true;
    }).catch(function () {
      $("#privacy-body").innerHTML = '<p>読み込めませんでした。<a href="' + esc(privacyUrl) + '">こちら</a>からご覧ください。</p>';
    });
  });
  $$("[data-close]", dlg).forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });

  // ---- 5. 確認 ----
  function summaryHTML(withCustomer) {
    var m = state.menu, f = state.form, e = eff();
    var rows = [];
    if (state.change) rows.push(["変更前", esc(dateJa(state.change.date)) + "<br>" + state.change.time + "〜" + state.change.end]);
    rows.push(
      ["メニュー", esc(menuLabel(m)) + "<small>目安 " + e.minutes + "分</small>"],
      ["料金", esc(yen(e.price)) + "<small>当日お支払い</small>"],
      ["担当", esc(state.staff.name)],
      [state.change ? "変更後" : "日時", esc(dateJa(state.date)) + "<br>" + state.time + "〜" + endTime(state.time, e.minutes)]
    );
    if (withCustomer) {
      var b = U.parseYmd(f.birth);
      rows.push(["氏名", esc(f.name) + "<small>" + esc(f.kana) + "</small>"]);
      rows.push(["性別", esc(f.sex)]);
      rows.push(["生年月日", b.y + "年" + b.m + "月" + b.d + "日"]);
      rows.push(["電話番号", esc(f.tel)]);
      rows.push(["メール", esc(f.email)]);
      if (!state.change) {
        rows.push(["ご来店", esc(f.visit)]);
        if (f.focus) rows.push(["多めに施術してほしい部位", esc(f.focus)]);
        rows.push(["早めの施術希望", esc(f.early)]);
        if (f.note) rows.push(["ご要望", esc(f.note).replace(/\n/g, "<br>")]);
      }
    }
    return rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");
  }
  function submitLabel() { return state.change ? "この日時に変更する" : "予約を確定する"; }
  function newReqId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function renderConfirm() {
    var key = [state.menu.id, state.staff.id, state.date, state.time, state.form.name, state.form.tel, state.change ? state.change.id : ""].join("|");
    if (key !== state.reqKey) { state.reqKey = key; state.reqId = newReqId(); }
    var t = $("#confirm-title");
    if (t) t.textContent = state.change ? "変更内容の確認" : "ご予約内容の確認";
    $("#confirm").innerHTML = summaryHTML(true);
    show("#send-error", false);
    var btn = $("#submit");
    btn.disabled = false;
    btn.textContent = submitLabel();
  }

  var sending = false;
  $("#submit").addEventListener("click", function () {
    if (sending) return;
    sending = true;
    var btn = this;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>送信しています…';
    var f = state.form;
    var payload = {
      menuId: state.menu.id,
      staffId: state.staff.id,
      date: state.date,
      time: state.time,
      name: f.name,
      kana: f.kana,
      sex: f.sex,
      birth: f.birth,
      tel: f.tel,
      email: f.email,
      visit: f.visit,
      focus: f.focus,
      early: f.early,
      note: f.note,
      source: state.source,
      website: f.website,
      reqId: state.reqId
    };
    if (state.line) payload.idToken = LINE.idToken();
    if (state.change) payload.replaces = state.change.id;
    API.book(payload).then(function (res) {
      sending = false;
      if (res && res.ok) {
        state.booked = res;
        history.replaceState({ step: 6 }, "");
        go(6, false);
        return;
      }
      var reason = res && res.reason;
      if (reason === "taken" || reason === "closed") {
        // たった今ほかの人が取った／画面を開いている間に受付の締切を過ぎた → 日時を選び直してもらう
        delete state.slots[monthOf(state.date)];
        var when = dateJa(state.date);
        var a = show("#taken-alert", true);
        a.textContent = reason === "closed"
          ? "申し訳ありません。" + when + state.time + "からのご予約は、受付の締切" + (res.hours ? "（開始の" + res.hours + "時間前まで）" : "") + "を過ぎました。別の日時をお選びください。"
          : "申し訳ありません。" + when + "のその時間は、たった今ご予約が入りました。別の時間をお選びください。";
        state.time = null;
        go(3);
        return;
      }
      if (reason === "auth") { authError(); showSendError("LINEのログインの期限が切れました。上のボタンからログインし直してください。"); return; }
      if (reason === "deadline") { showSendError("変更・キャンセルの締切（" + (res.hours || CONFIG.settings.cancelHours) + "時間前）を過ぎたため、変更できませんでした。お手数ですが公式LINEのトークでご連絡ください。"); return; }
      if (reason === "notfound") { showSendError("元のご予約が見つかりませんでした（すでに変更・キャンセル済みの可能性があります）。「予約の確認」をご覧ください。"); return; }
      showSendError(res && res.message);
    }).catch(function () {
      // 通信が切れた：予約は入っているかもしれない。同じ受付番号で押し直せば、二重にはならない
      sending = false;
      showSendError("通信が途切れて、結果を確かめられませんでした。もう一度「" + submitLabel() + "」を押してください（同じ予約が二重に入ることはありません）。うまくいかない場合は公式LINEからご連絡ください。");
    });
  });
  function showSendError(msg) {
    var a = show("#send-error", true);
    a.textContent = msg || "送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。うまくいかない場合は公式LINEからご連絡ください。";
    var btn = $("#submit");
    btn.disabled = false;
    btn.textContent = submitLabel();
  }

  // LINE のログインの期限切れ：ログインし直すボタンを出す
  function authError() {
    var a = show("#auth-alert", true);
    if (!a) return;
    a.innerHTML = 'LINEのログインの期限が切れました。<button type="button" class="link-btn" id="relogin">LINEでログインし直す</button>';
    $("#relogin").addEventListener("click", function () { LINE.relogin(); });
  }

  // ---- 完了 ----
  function gcalUrl() {
    var s = U.msAt(state.date, U.toMin(state.time)), e = s + eff().minutes * 60000;
    function z(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
    var shop = (DATA && DATA.shop) || {};
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent("脱毛salon8 " + menuLabel(state.menu)) +
      "&dates=" + z(s) + "/" + z(e) +
      "&details=" + encodeURIComponent("予約番号：" + state.booked.id + "\n担当：" + state.staff.name) +
      "&location=" + encodeURIComponent(shop.address || "");
  }
  function renderDone() {
    var t = $("#done-title");
    if (t) t.textContent = state.change ? "ご予約を変更しました" : "ご予約が完了しました";
    $("#done-id").innerHTML = "<small>予約番号</small>" + esc(state.booked.id);
    var n = state.booked.notified;
    $("#done-mail").textContent = n === "LINE" ? "LINEに予約内容をお送りしました。"
      : n === "メール" || state.booked.mailed ? state.form.email + " に確認メールをお送りしました。"
      : "ご予約内容はこの画面でご確認ください（スクリーンショットがおすすめです）。";
    $("#done-demo").hidden = !API.DEMO;
    $("#done-summary").innerHTML = summaryHTML(false);
    $("#gcal").href = gcalUrl();
    if (CONFIG.lineUrl) $("#done-line").href = CONFIG.lineUrl;
    var my = show("#done-mypage", state.line);
    if (my) my.href = LINE.link("mypage.html");
    if (state.line) show("#done-line", false);
  }

  // ---- はじめ ----
  if (API.DEMO) $("#demo-bar").hidden = false;
  function bootError(html) {
    $("#boot").hidden = true;
    var a = $("#boot-error");
    a.innerHTML = html;
    a.hidden = false;
  }
  Promise.all([API.getConfig(), LINE.init()]).then(function (r) {
    CONFIG = r[0];
    CONFIG.settings = CONFIG.settings || {};
    CONFIG.staffMenus = CONFIG.staffMenus || {};
    if (!LINE.active()) return null;
    // LINE でログインしている：前回の入力と、今の予約を読む
    state.line = true;
    state.source = "LINE";
    return API.me(LINE.idToken()).then(function (me) {
      if (me && me.ok === false && me.reason === "auth") { authError(); return null; }
      return me;
    }, function () { return null; });
  }).then(function (me) {
    $("#boot").hidden = true;
    if (state.line) {
      var p = LINE.profile && LINE.profile();
      var chip = show("#line-chip", true);
      if (chip) chip.textContent = "LINEでログイン中" + (p && p.displayName ? "（" + p.displayName + " さん）" : "") + "・予約確認はLINEに届きます";
      state.profile = me && me.profile;
    }

    // マイページの「日時を変更」から来た
    var changeId = params.get("change");
    if (changeId) {
      var bk = me && me.bookings && me.bookings.filter(function (b) { return b.id === changeId; })[0];
      if (!state.line || !bk) return bootError('変更するご予約が見つかりませんでした。<a href="' + LINE.link("mypage.html") + '">予約の確認</a>からもう一度お試しください。');
      if (!bk.changeable) return bootError("変更・キャンセルの締切（" + CONFIG.settings.cancelHours + "時間前）を過ぎています。お手数ですが公式LINEのトークでご連絡ください。");
      state.change = bk;
      state.menu = CONFIG.menus.filter(function (m) { return m.id === bk.menuId; })[0];
      state.staff = CONFIG.staff.filter(function (s) { return s.id === bk.staffId; })[0];
      if (!state.menu || !state.staff) return bootError("このご予約のメニューか担当が、今は受け付けていません。公式LINEのトークでご連絡ください。");
      state.gender = state.menu.gender;
      var t = $("#date-title");
      if (t) t.textContent = "変更する日時を選ぶ";
      var back = $('[data-step="3"] [data-back]');
      if (back) back.textContent = "予約の確認に戻る";
      history.replaceState({ step: 3 }, "");
      go(3, false);
      return;
    }

    // HPのメニュー表から来たら、そのメニューを選んだ状態で始める
    var pre = params.get("menu");
    var m = pre && CONFIG.menus.filter(function (x) { return x.id === pre; })[0];
    if (m) {
      state.gender = m.gender;
      state.menu = m;
      history.replaceState({ step: 1 }, "");
      go(2);
    } else {
      history.replaceState({ step: 1 }, "");
      go(1, false);
    }
  }).catch(function () {
    bootError('予約システムを読み込めませんでした。時間をおいてもう一度開くか、<a href="https://lin.ee/BdPU7Iq">公式LINE</a>からご予約ください。');
  });
})();
