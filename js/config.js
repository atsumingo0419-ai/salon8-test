// 予約システムのつなぎ先。
// API_URL が空のあいだは「デモモード」（仮のスタッフ・仮の空き枠で動く。予約もメールも飛ばない）。
// Google Apps Script を公開したら、そのURL（https://script.google.com/macros/s/……/exec）を入れる。
// LIFF_ID を入れると、LINE の中で開いたときに「LINE で予約」になる（入力の自動入力・LINE で通知・マイページ）。
// 試作の確認用：URL の最後に ?mockline=1 をつけると、LINE で開いたふりができる（デモモードのときだけ意味がある）。
window.SALON8_CONFIG = {
  API_URL: "",
  LIFF_ID: ""
};
