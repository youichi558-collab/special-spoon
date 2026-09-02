// ================================================================
// part_types.js — 部品DBの「種別」コードの、たった1つの定義。
//
// 【2026-09-02 切り出し】以前は js/ui.js の中に4つがバラバラに散らばっていた
// (PART_TYPE_CODES/LABELS/ORDER・index.htmlのプルダウン・CSVヘルプ文言)。
// 部品DB単独画面(parts.html)を作るとき、そこにコピーすると5箇所目になり、
// 増やすたびに全部を揃える決まりを守れなくなる。
//
// ここへ集めることで、CADと単独画面は同じ1つのソースを見る。
// index.html(プルダウン)とCSVヘルプ文言は表示のコピーなので、
// 種別を1つ足すときはここに加えたうえで両方も直すこと
// (tests/test_device_terminal.js が食い違いを見張っている)。
// ================================================================
const PART_TYPE_CODES = ['contactor','starter','coil','timer','thermal','pb','pb_lamp','pb_estop','selector','selector_key','selector_lamp','selector_pb','lever','contact_unit','lamp','breaker','fuse','transformer','terminal','inverter','servo','servo_motor','motor','plc','plc_unit','hmi','option'];

// 廃止した種別コード（2026-08-23）。
// sw_no(a接点)/sw_nc(b接点) は「接点構成」であって部品の分類ではないため廃止した。
// 接点構成は型式の中に含まれる（IDEC HW1B-M1P10 の P10 が 1a を表す）。
//
// 【自動変換はしない】これらは正式な種別コード(pb/selector系)が追加される前に
// 押ボタン・セレクタを暫定流用で登録したもので、実体はコンタクトユニットではない。
// 機械的に contact_unit へ置き換えると押ボタンがコンタクトユニットとして
// 登録されてしまう。人が中身を見て分類し直す必要がある。
//
// 取り込みは従来どおり通す（ここで弾くと既存CSVが再取込できなくなる）が、
// 件数を数えて「要再分類」として知らせる。
const LEGACY_PART_TYPES = { sw_no: 'a接点', sw_nc: 'b接点' };

// 種別コード→表示名。CSV一括登録欄のヘルプ文言(js/ui.js内)と揃えること。
const PART_TYPE_LABELS = {
  // 開閉器類。electromagnetic contactor(単体)とstarter(サーマル一体)は
  // 型番自体が変わる別部品なので分けている(S-T21 と MSO-T21 等)。
  contactor: '電磁接触器', starter: '電磁開閉器(サーマル一体)',
  coil: 'リレーコイル', timer: 'タイマ', thermal: 'サーマルリレー',
  // 操作機器。押ボタンとセレクタはa接点/b接点とは別物なので専用コードにした。
  pb: '押ボタン', pb_lamp: '照光押ボタン', pb_estop: '非常停止',
  selector: 'セレクタ', selector_key: '鍵付セレクタ', selector_lamp: '照光セレクタ',
  selector_pb: 'セレクタ押ボタン', lever: 'モノレバー',
  // コンタクトユニット(接点ブロック単体)。押ボタン・セレクタ共通の発注単位で、
  // 改造や接点追加のときに単体で購入する(IDEC HW-CNP10等)。
  // カタログの呼び方をそのまま使う(通称は誤解のもと、2026-08-23 盛田さん判断)。
  // 旧 sw_no(a接点)/sw_nc(b接点) を置き換えたもの。a接点/b接点は接点構成であって
  // 部品の分類ではなく、型式の中(HW1B-M1P10のP10部分)に含まれるため種別で持たない。
  contact_unit: 'コンタクトユニット',
  lamp: 'ランプ・表示灯',
  breaker: 'ブレーカ', fuse: 'ヒューズ', transformer: 'トランス', terminal: '端子台',
  // インバータとサーボアンプは別物なので分ける(2026-08-23、盛田さん指示で新設)。
  // どちらも端子が図面に散らばる装置なのでDEVICE_PART_TYPES(report.js)にも入れる。
  inverter: 'インバータ',
  servo: 'サーボアンプ', servo_motor: 'サーボモータ', motor: 'モーター',
  plc: 'PLC(シーケンサ)', plc_unit: 'PLC増設ユニット', hmi: 'タッチパネル・表示器',
  option: '増設ユニット等(付属品)',
  '': '(種別未設定)',
};
const PART_TYPE_ORDER = ['breaker','contactor','starter','thermal','coil','timer','pb','pb_lamp','pb_estop','selector','selector_key','selector_lamp','selector_pb','lever','contact_unit','lamp','inverter','servo','servo_motor','motor','plc','plc_unit','hmi','terminal','fuse','transformer','option'];
