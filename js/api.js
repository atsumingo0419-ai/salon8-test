// 予約システムとのやりとり。config.js の API_URL が空ならデモ（仮データ）で動く。
// 空き枠の計算（computeDaySlots まわり）と担当制（effective）は gas/Code.gs にも同じものがある。直すときは両方。
(function () {
  "use strict";

  var CFG = window.SALON8_CONFIG || {};
  var DATA = window.SALON8_DATA || {};
  var API_URL = (CFG.API_URL || "").trim();
  var DEMO = !API_URL;

  // ---- 日付まわり（すべて日本時間で数える） ----
  var JST = 9 * 3600000;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function parseYmd(s) { var a = s.split("-").map(Number); return { y: a[0], m: a[1], d: a[2] }; }
  function todayJST() {
    var t = new Date(Date.now() + JST);
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function addDays(s, n) {
    var p = parseYmd(s);
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function dow(s) { var p = parseYmd(s); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function daysInMonth(month) { var p = month.split("-").map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); }
  function msAt(date, min) { return Date.parse(date + "T00:00:00+09:00") + min * 60000; }
  function toMin(hm) {
    var m = String(hm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function toHM(min) { return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }
  function parseRange(s) {
    var a = String(s || "").replace(/[〜～~]/g, "-").split("-");
    if (a.length !== 2) return null;
    var st = toMin(a[0]), en = toMin(a[1]);
    return st == null || en == null || en <= st ? null : [st, en];
  }

  // 1日分の空き枠（開始時刻の配列）。busy は [{s, e}]（ミリ秒）
  function computeDaySlots(date, range, busy, duration, step, earliestMs) {
    var out = [];
    for (var t = range[0]; t + duration <= range[1]; t += step) {
      var s = msAt(date, t), e = s + duration * 60000;
      if (s < earliestMs) continue;
      var clash = busy.some(function (b) { return b.s < e && s < b.e; });
      if (!clash) out.push(toHM(t));
    }
    return out;
  }

  // 1か月分の空き枠。{ "2026-11-03": ["10:00", ...], 休みの日: null }。受付期間外の日は入れない
  function computeMonthSlots(month, opts) {
    var today = todayJST(), last = addDays(today, opts.horizonDays);
    var open = toMin(opts.open), close = toMin(opts.close);
    var earliest = Date.now() + opts.leadMin * 60000;
    var days = {};
    for (var d = 1; d <= daysInMonth(month); d++) {
      var date = month + "-" + pad(d);
      if (date < today || date > last) continue;
      var r = parseRange(opts.week[dow(date)]);
      if (!r) { days[date] = null; continue; }
      r = [Math.max(r[0], open), Math.min(r[1], close)];
      days[date] = computeDaySlots(date, r, opts.busy, opts.duration, opts.stepMin, earliest);
    }
    return days;
  }

  // 担当制：そのスタッフがそのメニューをやるときの料金・時間（担当しないなら null）
  // staffMenus に行があるスタッフは、書いてあるメニューだけ担当する
  function effective(staff, menu, staffMenus) {
    if (!staff || !menu) return null;
    if (staff.gender && staff.gender !== "both" && staff.gender !== menu.gender) return null;
    var mine = (staffMenus || {})[staff.id];
    if (mine && Object.keys(mine).length) {
      var o = mine[menu.id];
      if (!o) return null;
      return { price: o.price != null ? o.price : menu.price, minutes: o.minutes || menu.minutes };
    }
    return { price: menu.price, minutes: menu.minutes };
  }

  // ---- デモ（仮データ）----
  var DEMO_KEY = "salon8-demo-bookings", CUST_KEY = "salon8-demo-customers";
  function load(key, empty) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null") || empty; } catch (e) { return empty; }
  }
  function save(key, v) {
    try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 保存できなくても動く */ }
  }
  // 日付とスタッフで毎回同じになる「仮の埋まり予定」
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function demoBusy(staff, month, excludeId) {
    var busy = [];
    for (var d = 1; d <= daysInMonth(month); d++) {
      var date = month + "-" + pad(d);
      var r = parseRange(staff.week[dow(date)]);
      if (!r) continue;
      var rnd = seeded(staff.id + date), n = Math.floor(rnd() * 4);
      for (var i = 0; i < n; i++) {
        var len = [60, 90, 120][Math.floor(rnd() * 3)];
        var st = r[0] + Math.floor(rnd() * ((r[1] - r[0] - len) / 30)) * 30;
        busy.push({ s: msAt(date, st), e: msAt(date, st + len) });
      }
    }
    load(DEMO_KEY, []).forEach(function (b) {
      if (b.staffId === staff.id && b.status === "予約" && b.id !== excludeId) busy.push({ s: b.s, e: b.e });
    });
    return busy;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function findMenu(id) { return DATA.menus.filter(function (m) { return m.id === id; })[0]; }
  function findStaff(id) { return DATA.staff.filter(function (s) { return s.id === id; })[0]; }
  // デモの本人確認：line.js の ?mockline=1 が渡す "mock:ユーザーID" だけ通す
  function demoUser(idToken) { var m = /^mock:(.+)$/.exec(idToken || ""); return m ? m[1] : null; }
  function demoMonthSlots(staff, eff, month, excludeId) {
    var o = Object.assign({}, DATA.settings, { week: staff.week, busy: demoBusy(staff, month, excludeId), duration: eff.minutes });
    return computeMonthSlots(month, o);
  }
  function beforeDeadline(b) { return b.s - Date.now() >= (DATA.settings.cancelHours || 24) * 3600000; }
  function genderJa(g) { return g === "female" ? "女性" : "男性"; }

  var demo = {
    getConfig: function () {
      return wait(150).then(function () {
        return {
          shopName: DATA.shop.name,
          lineUrl: DATA.shop.lineUrl,
          menus: DATA.menus,
          staff: DATA.staff.map(function (s) { return { id: s.id, name: s.name, gender: s.gender, intro: s.intro }; }),
          staffMenus: DATA.staffMenus || {},
          settings: DATA.settings
        };
      });
    },
    getMonthSlots: function (staffId, menuId, month) {
      var staff = findStaff(staffId), eff = effective(staff, findMenu(menuId), DATA.staffMenus);
      return wait(350).then(function () { return { days: demoMonthSlots(staff, eff, month, null) }; });
    },
    changeSlots: function (idToken, replaces, staffId, menuId, month) {
      var staff = findStaff(staffId), eff = effective(staff, findMenu(menuId), DATA.staffMenus);
      return wait(350).then(function () {
        if (!demoUser(idToken)) return { ok: false, reason: "auth" };
        return { days: demoMonthSlots(staff, eff, month, replaces) };
      });
    },
    book: function (p) {
      var staff = findStaff(p.staffId), menu = findMenu(p.menuId), eff = effective(staff, menu, DATA.staffMenus);
      return wait(700).then(function () {
        if (!eff) return { ok: false, reason: "invalid" };
        var userId = "";
        if (p.idToken) { userId = demoUser(p.idToken); if (!userId) return { ok: false, reason: "auth" }; }
        var list = load(DEMO_KEY, []), old = null;
        if (p.replaces) {
          old = list.filter(function (b) { return b.id === p.replaces; })[0];
          if (!old || old.userId !== userId || old.status !== "予約") return { ok: false, reason: "notfound" };
          if (!beforeDeadline(old)) return { ok: false, reason: "deadline", hours: DATA.settings.cancelHours };
        }
        var slots = demoMonthSlots(staff, eff, p.date.slice(0, 7), old && old.id)[p.date] || [];
        if (slots.indexOf(p.time) < 0) return { ok: false, reason: "taken" };
        var s = msAt(p.date, toMin(p.time));
        var id = "S8-" + p.date.slice(5).replace("-", "") + "-" + String(Math.floor(1000 + Math.random() * 9000));
        list.push({
          id: id, staffId: staff.id, staffName: staff.name, menuId: menu.id, menuName: menu.name + "【" + genderJa(menu.gender) + "】",
          date: p.date, time: p.time, end: toHM(toMin(p.time) + eff.minutes), price: eff.price,
          s: s, e: s + eff.minutes * 60000, userId: userId, status: "予約"
        });
        if (old) old.status = "変更";
        save(DEMO_KEY, list);
        if (userId) {
          var cust = load(CUST_KEY, {});
          cust[userId] = { name: p.name, kana: p.kana, sex: p.sex, birth: p.birth, tel: p.tel, email: p.email };
          save(CUST_KEY, cust);
        }
        return { ok: true, id: id, demo: true, notified: userId ? "LINE" : "メール", mailed: !userId };
      });
    },
    me: function (idToken) {
      return wait(300).then(function () {
        var userId = demoUser(idToken);
        if (!userId) return { ok: false, reason: "auth" };
        var today = todayJST();
        var list = load(DEMO_KEY, []).filter(function (b) {
          return b.userId === userId && b.status === "予約" && b.date >= today;
        }).map(function (b) {
          return { id: b.id, date: b.date, time: b.time, end: b.end, menuName: b.menuName, menuId: b.menuId,
            staffName: b.staffName, staffId: b.staffId, price: b.price, changeable: beforeDeadline(b) };
        }).sort(function (x, y) { return (x.date + x.time) < (y.date + y.time) ? -1 : 1; });
        return { ok: true, profile: load(CUST_KEY, {})[userId] || null, bookings: list,
          cancelHours: DATA.settings.cancelHours, lineUrl: DATA.shop.lineUrl };
      });
    },
    cancel: function (idToken, id) {
      return wait(500).then(function () {
        var userId = demoUser(idToken);
        if (!userId) return { ok: false, reason: "auth" };
        var list = load(DEMO_KEY, []);
        var b = list.filter(function (x) { return x.id === id; })[0];
        if (!b || b.userId !== userId || b.status !== "予約") return { ok: false, reason: "notfound" };
        if (!beforeDeadline(b)) return { ok: false, reason: "deadline", hours: DATA.settings.cancelHours };
        b.status = "キャンセル";
        save(DEMO_KEY, list);
        return { ok: true };
      });
    }
  };

  // ---- 本番（Google Apps Script）----
  function getJSON(params) {
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(API_URL + "?" + q).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.error) throw new Error(j.error);
      return j;
    });
  }
  // IDトークンを含むものは POST で送る（URL に残さない）。text/plain なのでブラウザの事前確認（CORS）が要らない
  function postJSON(body) {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  var live = {
    getConfig: function () { return getJSON({ action: "config" }); },
    getMonthSlots: function (staffId, menuId, month) {
      return getJSON({ action: "slots", staff: staffId, menu: menuId, month: month });
    },
    changeSlots: function (idToken, replaces, staffId, menuId, month) {
      return postJSON({ action: "slots", idToken: idToken, replaces: replaces, staff: staffId, menu: menuId, month: month });
    },
    book: function (p) { return postJSON(Object.assign({ action: "book" }, p)); },
    me: function (idToken) { return postJSON({ action: "me", idToken: idToken }); },
    cancel: function (idToken, id) { return postJSON({ action: "cancel", idToken: idToken, id: id }); }
  };

  var impl = DEMO ? demo : live;
  window.Salon8API = {
    DEMO: DEMO,
    getConfig: impl.getConfig,
    getMonthSlots: impl.getMonthSlots,
    changeSlots: impl.changeSlots,
    book: impl.book,
    me: impl.me,
    cancel: impl.cancel,
    util: {
      pad: pad, ymd: ymd, parseYmd: parseYmd, todayJST: todayJST, addDays: addDays, dow: dow,
      daysInMonth: daysInMonth, msAt: msAt, toMin: toMin, toHM: toHM, computeDaySlots: computeDaySlots,
      effective: effective
    }
  };
})();
