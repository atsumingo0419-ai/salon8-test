// お店の情報とメニュー。HPのメニュー表と、デモモードの予約フォームがここを読む。
// 本番の予約フォームは Google スプレッドシートのメニュー・スタッフを読む（ここではない）。
// tbd: true は「まだ確認中（仮）」の印。お店に確認できたら消す。
window.SALON8_DATA = {
  shop: {
    name: "脱毛salon8（はち）",
    address: "東京都豊島区西池袋3丁目22-10 ルミエール304号室",
    zip: "171-0021",
    stations: "池袋駅・要町駅",
    hours: "9:00〜24:00",
    lineUrl: "https://lin.ee/BdPU7Iq",
    instagram: "https://www.instagram.com/datumou_hachi/"
  },

  // gender: male / female。minutes は施術の目安時間（空き枠の計算に使う）。price: null は料金確認中
  menus: [
    { id: "m-zenshin", gender: "male", name: "全身脱毛", minutes: 120, price: 10000, tbd: true },
    { id: "m-hige", gender: "male", name: "お髭", minutes: 30, price: null, tbd: true },
    { id: "m-vio", gender: "male", name: "VIO", minutes: 60, price: null, tbd: true },
    { id: "m-ashi", gender: "male", name: "足全体", minutes: 60, price: null, tbd: true },
    { id: "m-munehara", gender: "male", name: "胸・お腹", minutes: 45, price: null, tbd: true },
    { id: "m-ude", gender: "male", name: "腕全体", minutes: 45, price: null, tbd: true },
    { id: "m-waki", gender: "male", name: "わき", minutes: 15, price: null, tbd: true },
    { id: "m-shiri", gender: "male", name: "お尻", minutes: 30, price: null, tbd: true },
    { id: "m-senaka", gender: "male", name: "背中", minutes: 45, price: null, tbd: true },

    { id: "f-zenshin", gender: "female", name: "全身脱毛", minutes: 120, price: 10000, tbd: true },
    { id: "f-kao", gender: "female", name: "お顔", minutes: 30, price: null, tbd: true },
    { id: "f-vio", gender: "female", name: "VIO", minutes: 60, price: null, tbd: true },
    { id: "f-munehara", gender: "female", name: "胸・お腹", minutes: 45, price: null, tbd: true },
    { id: "f-ude", gender: "female", name: "腕全体", minutes: 45, price: null, tbd: true },
    { id: "f-ashi", gender: "female", name: "足全体", minutes: 60, price: null, tbd: true },
    { id: "f-waki", gender: "female", name: "わき", minutes: 15, price: null, tbd: true },
    { id: "f-shiri", gender: "female", name: "お尻", minutes: 30, price: null, tbd: true },
    { id: "f-senaka", gender: "female", name: "背中", minutes: 45, price: null, tbd: true }
  ],

  // デモ用の仮スタッフ。gender: both / male / female（担当できるメニュー）
  // week は曜日ごとの勤務時間（日〜土）。空欄はお休み
  staff: [
    {
      id: "staff-a", name: "スタッフA", gender: "both", intro: "（紹介文が入ります）",
      week: ["", "10:00-22:00", "10:00-22:00", "", "10:00-22:00", "10:00-22:00", "10:00-20:00"]
    },
    {
      id: "staff-b", name: "スタッフB", gender: "both", intro: "（紹介文が入ります）",
      week: ["12:00-24:00", "", "13:00-24:00", "13:00-24:00", "13:00-24:00", "", "9:00-21:00"]
    }
  ],

  // 担当制（デモ用）：スタッフごとに料金・時間が違うときだけ書く。{ スタッフID: { メニューID: { price, minutes } } }
  // あるスタッフを書くと、そのスタッフは書いたメニューだけ担当する（本番はスプレッドシートの「担当メニュー」）
  staffMenus: {},

  settings: {
    cancelHours: 24,   // LINE からの変更・キャンセルの締切（何時間前まで）
    stepMin: 30,       // 予約できる時間の刻み（分）
    leadMin: 180,      // 何分前まで予約を受け付けるか
    horizonDays: 60,   // 何日先まで予約できるか
    open: "9:00",      // 営業開始（これより前の枠は出さない）
    close: "24:00"     // 営業終了
  }
};
