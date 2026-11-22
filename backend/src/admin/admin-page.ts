/**
 * Trang admin 1 file — không build tool, không thư viện. Token lưu sessionStorage (tự mất khi đóng
 * tab). Mọi nội dung từ server đều được escape trước khi chèn vào HTML.
 */
export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Quản trị — Nhật Ký Thi Công</title>
<style>
  :root { --g:#16a34a; --gl:#f0fdf4; --t:#17202a; --m:#6b7280; --b:#e5e5e5; --r:#dc2626; --a:#b45309; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--t); background:#f7f8fa; }
  header { background:#fff; border-bottom:1px solid var(--b); padding:12px 20px; display:flex; align-items:center; gap:16px; }
  header h1 { font-size:16px; margin:0; color:var(--g); }
  nav button { background:none; border:none; padding:8px 12px; font-size:14px; cursor:pointer; color:var(--m); border-radius:8px; }
  nav button.on { background:var(--gl); color:var(--g); font-weight:700; }
  main { max-width:1100px; margin:20px auto; padding:0 16px; }
  .card { background:#fff; border:1px solid var(--b); border-radius:10px; padding:16px; margin-bottom:14px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--b); vertical-align:top; }
  th { color:var(--m); font-weight:600; }
  input, select, textarea { font:inherit; padding:8px 10px; border:1.5px solid var(--b); border-radius:8px; width:100%; }
  textarea { min-height:90px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; }
  .row > * { flex:1; min-width:140px; }
  button.btn { background:var(--g); color:#fff; border:none; border-radius:8px; padding:8px 14px; cursor:pointer; font-weight:600; }
  button.ghost { background:#fff; color:var(--t); border:1.5px solid var(--b); border-radius:8px; padding:6px 10px; cursor:pointer; }
  button.danger { color:var(--r); border-color:#fecaca; }
  .badge { font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:#f3f4f6; }
  .PENDING { background:#fffbeb; color:var(--a); } .PROCESSING { background:#eff6ff; color:#1d4ed8; }
  .COMPLETED, .ACTIVE { background:var(--gl); color:var(--g); } .REJECTED, .CANCELLED, .EXPIRED { background:#fef2f2; color:var(--r); }
  .muted { color:var(--m); font-size:12px; }
  #login { max-width:360px; margin:80px auto; }
  #msg { position:fixed; bottom:16px; right:16px; background:var(--t); color:#fff; padding:10px 14px; border-radius:8px; display:none; font-size:13px; }
  label { font-size:12px; color:var(--m); display:block; margin:8px 0 4px; }
</style>
</head>
<body>
<div id="login" class="card" style="display:none">
  <h2 style="margin-top:0">Đăng nhập quản trị</h2>
  <label>Email</label><input id="em" type="email" autocomplete="username" />
  <label>Mật khẩu</label><input id="pw" type="password" autocomplete="current-password" />
  <p><button class="btn" onclick="login()">Đăng nhập</button></p>
  <p class="muted">Chỉ email nằm trong ADMIN_EMAILS trên server mới vào được.</p>
</div>
<div id="app" style="display:none">
  <header>
    <h1>Quản trị</h1>
    <nav>
      <button data-t="withdrawals" onclick="tab('withdrawals')">Rút tiền</button>
      <button data-t="subs" onclick="tab('subs')">Gói của user</button>
      <button data-t="tips" onclick="tab('tips')">Bài viết</button>
      <button data-t="products" onclick="tab('products')">Sản phẩm</button>
      <button data-t="ads" onclick="tab('ads')">Quảng cáo</button>
    </nav>
    <span style="flex:1"></span>
    <button class="ghost" onclick="logout()">Đăng xuất</button>
  </header>
  <main id="view"></main>
</div>
<div id="msg"></div>
<script>
const PLANS = {
  OWNER_MONTHLY:'Chủ nhà — Theo tháng', OWNER_6MONTH:'Chủ nhà — 6 tháng', OWNER_9MONTH:'Chủ nhà — 9 tháng', OWNER_12MONTH:'Chủ nhà — 12 tháng',
  CONTRACTOR_MONTHLY:'Nhà thầu — Theo tháng', CONTRACTOR_10PROJECTS:'Nhà thầu — 10 dự án', CONTRACTOR_YEARLY:'Nhà thầu — Gói năm', AI_PREMIUM:'AI Premium',
};
const WSTATUS = { PENDING:'Chờ xử lý', PROCESSING:'Đang xử lý', COMPLETED:'Đã chuyển', REJECTED:'Từ chối' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const day = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('adminToken');
let state = { tab: 'withdrawals', editTip: null, editProduct: null, editAd: null, ads: [], users: [], tips: [], products: [] };

function toast(t) { const m = $('msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(m._t); m._t = setTimeout(() => m.style.display = 'none', 3000); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Phiên đăng nhập hết hạn'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || ('Lỗi ' + res.status));
  return data;
}

async function login() {
  try {
    const r = await api('/auth/login', { method: 'POST', body: { email: $('em').value.trim(), password: $('pw').value } });
    token = r.accessToken; sessionStorage.setItem('adminToken', token);
    await api('/admin/me');
    start();
  } catch (e) { token = null; sessionStorage.removeItem('adminToken'); toast(e.message); }
}
function logout() { token = null; sessionStorage.removeItem('adminToken'); $('app').style.display = 'none'; $('login').style.display = 'block'; }
async function start() {
  try { await api('/admin/me'); } catch (e) { return logout(); }
  $('login').style.display = 'none'; $('app').style.display = 'block'; tab(state.tab);
}
function tab(t) {
  state.tab = t;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  ({ withdrawals: renderWithdrawals, subs: renderSubs, tips: renderTips, products: renderProducts, ads: renderAds })[t]();
}

// ---------- Rút tiền ----------
async function renderWithdrawals() {
  const filter = state.wFilter || 'PENDING';
  const list = await api('/admin/withdrawals' + (filter === 'ALL' ? '' : '?status=' + filter)).catch((e) => (toast(e.message), []));
  const opts = ['PENDING','PROCESSING','COMPLETED','REJECTED','ALL'].map((s) => '<option value="' + s + '"' + (s === filter ? ' selected' : '') + '>' + (WSTATUS[s] || 'Tất cả') + '</option>').join('');
  $('view').innerHTML = '<div class="card"><div class="row" style="align-items:center"><h3 style="margin:0">Yêu cầu rút tiền</h3><select style="max-width:200px" onchange="state.wFilter=this.value;renderWithdrawals()">' + opts + '</select></div></div>'
    + '<div class="card"><table><tr><th>Ngày</th><th>User</th><th>Số tiền</th><th>Ngân hàng</th><th>Trạng thái</th><th></th></tr>'
    + (list.length ? list.map((w) => '<tr><td>' + day(w.createdAt) + '</td><td>' + esc(w.user.name) + '<div class="muted">' + esc(w.user.phone || w.user.email || '') + '</div></td>'
      + '<td><b>' + vnd(w.amount) + '</b></td><td>' + esc(w.bankName) + '<div class="muted">' + esc(w.bankAccount) + (w.accountHolder ? ' — ' + esc(w.accountHolder) : '') + '</div></td>'
      + '<td><span class="badge ' + w.status + '">' + WSTATUS[w.status] + '</span></td><td>' + wActions(w) + '</td></tr>').join('')
      : '<tr><td colspan="6" class="muted">Không có yêu cầu nào.</td></tr>')
    + '</table></div>';
}
function wActions(w) {
  const b = (s, label, cls) => '<button class="ghost ' + (cls || '') + '" onclick="setW(\'' + w.id + '\',\'' + s + '\')">' + label + '</button> ';
  if (w.status === 'PENDING') return b('PROCESSING','Đang xử lý') + b('COMPLETED','Đã chuyển') + b('REJECTED','Từ chối','danger');
  if (w.status === 'PROCESSING') return b('COMPLETED','Đã chuyển') + b('REJECTED','Từ chối','danger');
  return '';
}
async function setW(id, status) {
  if (status === 'REJECTED' && !confirm('Từ chối yêu cầu này? Số tiền sẽ hoàn lại số dư của user.')) return;
  if (status === 'COMPLETED' && !confirm('Xác nhận ĐÃ CHUYỂN KHOẢN cho user?')) return;
  try { await api('/admin/withdrawals/' + id, { method: 'PATCH', body: { status } }); toast('Đã cập nhật'); renderWithdrawals(); } catch (e) { toast(e.message); }
}

// ---------- Gói ----------
function renderSubs() {
  const planOpts = Object.entries(PLANS).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('');
  $('view').innerHTML = '<div class="card"><h3 style="margin-top:0">Tìm user</h3><div class="row"><input id="uq" placeholder="SĐT, email hoặc tên" onkeydown="if(event.key===\'Enter\')findUsers()" /><button class="btn" style="flex:0" onclick="findUsers()">Tìm</button></div></div>'
    + state.users.map((u) => '<div class="card"><b>' + esc(u.name) + '</b> <span class="muted">' + esc(u.phone || '') + ' ' + esc(u.email || '') + ' — tạo ' + day(u.createdAt) + '</span>'
      + '<table style="margin-top:10px"><tr><th>Gói</th><th>Nguồn</th><th>Bắt đầu</th><th>Hết hạn</th><th>Trạng thái</th><th></th></tr>'
      + (u.subscriptions.length ? u.subscriptions.map((s) => '<tr><td>' + esc(PLANS[s.plan] || s.plan) + '</td><td>' + (s.transactionId.startsWith('admin-grant') ? 'Admin tặng' : esc(s.store)) + '</td><td>' + day(s.startedAt) + '</td><td>' + (s.expiresAt ? day(s.expiresAt) : 'Vĩnh viễn') + '</td>'
        + '<td><span class="badge ' + s.status + '">' + esc(s.status) + '</span></td><td>' + (s.status === 'ACTIVE' ? '<button class="ghost danger" onclick="cancelSub(\'' + s.id + '\')">Huỷ</button>' : '') + '</td></tr>').join('')
        : '<tr><td colspan="6" class="muted">Chưa có gói nào.</td></tr>')
      + '</table><div class="row" style="margin-top:12px;align-items:end"><div><label>Tặng/gia hạn gói</label><select id="gp-' + u.id + '">' + planOpts + '</select></div>'
      + '<div><label>Số ngày (trống = theo gói)</label><input id="gd-' + u.id + '" type="number" min="1" /></div><button class="btn" style="flex:0" onclick="grant(\'' + u.id + '\')">Tặng gói</button></div></div>').join('');
  if (state.lastQ) $('uq').value = state.lastQ;
}
async function findUsers() {
  state.lastQ = $('uq').value;
  try { state.users = await api('/admin/users?q=' + encodeURIComponent(state.lastQ)); if (!state.users.length) toast('Không tìm thấy'); renderSubs(); } catch (e) { toast(e.message); }
}
async function grant(userId) {
  const plan = $('gp-' + userId).value; const d = $('gd-' + userId).value;
  if (!confirm('Tặng gói "' + PLANS[plan] + '" cho user này?')) return;
  try { await api('/admin/subscriptions', { method: 'POST', body: { userId, plan, ...(d ? { days: Number(d) } : {}) } }); toast('Đã tặng gói'); findUsers(); } catch (e) { toast(e.message); }
}
async function cancelSub(id) {
  if (!confirm('Huỷ gói này ngay (VD user đã được hoàn tiền)?')) return;
  try { await api('/admin/subscriptions/' + id + '/cancel', { method: 'POST' }); toast('Đã huỷ gói'); findUsers(); } catch (e) { toast(e.message); }
}

// ---------- Bài viết ----------
async function renderTips() {
  state.tips = await api('/admin/tips').catch((e) => (toast(e.message), []));
  const t = state.editTip || {};
  const cats = ['', 'Phần thô', 'Hoàn thiện', 'Mẹo hay'].map((c) => '<option value="' + c + '"' + (c === (t.category || '') ? ' selected' : '') + '>' + (c || '— Không —') + '</option>').join('');
  $('view').innerHTML = '<div class="card"><h3 style="margin-top:0">' + (t.id ? 'Sửa bài viết' : 'Thêm bài viết') + '</h3>'
    + '<label>Tiêu đề</label><input id="tt" value="' + esc(t.title) + '" />'
    + '<div class="row"><div><label>Nhóm</label><select id="tc">' + cats + '</select></div><div><label>Emoji</label><input id="te" value="' + esc(t.emoji) + '" placeholder="💧" /></div>'
    + '<div><label>Phút đọc</label><input id="tm" type="number" min="1" value="' + esc(t.readMinutes) + '" /></div><div><label>Mã hạng mục (tuỳ chọn)</label><input id="tp" value="' + esc(t.phaseCode) + '" placeholder="B-16" /></div></div>'
    + '<label>Nội dung</label><textarea id="tb">' + esc(t.body) + '</textarea>'
    + '<label>Link xem thêm (tuỳ chọn)</label><input id="tl" value="' + esc(t.linkUrl) + '" />'
    + '<p><button class="btn" onclick="saveTip()">Lưu</button> ' + (t.id ? '<button class="ghost" onclick="state.editTip=null;renderTips()">Huỷ sửa</button>' : '') + '</p></div>'
    + '<div class="card"><table><tr><th></th><th>Tiêu đề</th><th>Nhóm</th><th>Ngày</th><th></th></tr>'
    + state.tips.map((x, i) => '<tr><td>' + esc(x.emoji) + '</td><td>' + esc(x.title) + '</td><td>' + esc(x.category || '') + '</td><td>' + day(x.createdAt) + '</td>'
      + '<td><button class="ghost" onclick="state.editTip=state.tips[' + i + '];renderTips();scrollTo(0,0)">Sửa</button> <button class="ghost danger" onclick="delTip(\'' + x.id + '\')">Xoá</button></td></tr>').join('')
    + '</table></div>';
}
async function saveTip() {
  const body = { title: $('tt').value, body: $('tb').value, category: $('tc').value || undefined, emoji: $('te').value || undefined,
    readMinutes: $('tm').value ? Number($('tm').value) : undefined, phaseCode: $('tp').value || undefined, linkUrl: $('tl').value || undefined };
  try {
    const id = state.editTip && state.editTip.id;
    await api('/admin/tips' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body });
    state.editTip = null; toast('Đã lưu'); renderTips();
  } catch (e) { toast(e.message); }
}
async function delTip(id) { if (!confirm('Xoá bài viết này?')) return; try { await api('/admin/tips/' + id, { method: 'DELETE' }); toast('Đã xoá'); renderTips(); } catch (e) { toast(e.message); } }

// ---------- Sản phẩm ----------
async function renderProducts() {
  state.products = await api('/admin/products').catch((e) => (toast(e.message), []));
  const p = state.editProduct || {};
  const offer = (p.offers || []).find((o) => o.supplier && o.supplier.name === 'Shopee') || (p.offers || [])[0] || {};
  const cats = ['Dụng cụ', 'Vật liệu', 'An toàn', 'Nội thất'].map((c) => '<option' + (c === p.category ? ' selected' : '') + '>' + c + '</option>').join('');
  $('view').innerHTML = '<div class="card"><h3 style="margin-top:0">' + (p.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm') + '</h3>'
    + '<div class="row"><div style="flex:2"><label>Tên sản phẩm</label><input id="pn" value="' + esc(p.name) + '" /></div><div><label>Nhóm</label><select id="pc">' + cats + '</select></div><div><label>Emoji</label><input id="pe" value="' + esc(p.emoji) + '" placeholder="🔧" /></div></div>'
    + '<label>Mô tả</label><textarea id="pd">' + esc(p.description) + '</textarea>'
    + '<div class="row"><div><label>Giá bán (đ)</label><input id="pp" type="number" min="0" value="' + esc(offer.price) + '" /></div><div><label>Giá gốc để gạch (tuỳ chọn)</label><input id="po" type="number" min="0" value="' + esc(p.originalPrice) + '" /></div></div>'
    + '<label>Link Shopee (affiliate)</label><input id="pu" value="' + esc(offer.affiliateUrl) + '" placeholder="https://shopee.vn/..." />'
    + '<p><button class="btn" onclick="saveProduct()">Lưu</button> ' + (p.id ? '<button class="ghost" onclick="state.editProduct=null;renderProducts()">Huỷ sửa</button>' : '') + '</p>'
    + '<p class="muted">Sản phẩm có link Shopee cũng được dùng cho banner "Tài trợ" trong tab Báo cáo.</p></div>'
    + '<div class="card"><table><tr><th></th><th>Sản phẩm</th><th>Nhóm</th><th>Giá</th><th>Link</th><th></th></tr>'
    + state.products.map((x, i) => { const o = (x.offers || [])[0] || {};
      return '<tr><td>' + esc(x.emoji) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.category) + '</td><td>' + (o.price != null ? vnd(o.price) : '—') + (x.originalPrice ? ' <s class="muted">' + vnd(x.originalPrice) + '</s>' : '') + '</td>'
        + '<td>' + (o.affiliateUrl ? '✓' : '<span class="muted">chưa có</span>') + '</td>'
        + '<td><button class="ghost" onclick="state.editProduct=state.products[' + i + '];renderProducts();scrollTo(0,0)">Sửa</button> <button class="ghost danger" onclick="delProduct(\'' + x.id + '\')">Xoá</button></td></tr>'; }).join('')
    + '</table></div>';
}
async function saveProduct() {
  const body = { name: $('pn').value, category: $('pc').value, description: $('pd').value || undefined, emoji: $('pe').value || undefined,
    price: Number($('pp').value || 0), originalPrice: $('po').value ? Number($('po').value) : undefined, affiliateUrl: $('pu').value || undefined };
  try {
    const id = state.editProduct && state.editProduct.id;
    await api('/admin/products' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body });
    state.editProduct = null; toast('Đã lưu'); renderProducts();
  } catch (e) { toast(e.message); }
}
async function delProduct(id) { if (!confirm('Xoá sản phẩm này?')) return; try { await api('/admin/products/' + id, { method: 'DELETE' }); toast('Đã xoá'); renderProducts(); } catch (e) { toast(e.message); } }

// ---------- Quảng cáo ----------
const dIn = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
async function renderAds() {
  state.ads = await api('/admin/ads').catch((e) => (toast(e.message), []));
  const a = state.editAd || {};
  const now = Date.now();
  const status = (x) => !x.active ? 'Tắt' : now < +new Date(x.startsAt) ? 'Chờ chạy' : now >= +new Date(x.endsAt) ? 'Hết hạn' : '<b>Đang chạy</b>';
  const pl = ['POPUP', 'BANNER'].map((v) => '<option value="' + v + '"' + (v === a.placement ? ' selected' : '') + '>' + (v === 'POPUP' ? 'Popup (1 lần/ngày)' : 'Banner') + '</option>').join('');
  $('view').innerHTML = '<div class="card"><h3 style="margin-top:0">' + (a.id ? 'Sửa quảng cáo' : 'Thêm quảng cáo') + '</h3>'
    + '<div class="row"><div style="flex:2"><label>Tiêu đề (nhà quảng cáo)</label><input id="at" value="' + esc(a.title) + '" /></div><div><label>Vị trí</label><select id="ap">' + pl + '</select></div></div>'
    + '<label>Ảnh (popup ~ 4:5, banner ~ 3:1)</label><input id="af" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />'
    + '<input id="ai" value="' + esc(a.imageUrl) + '" placeholder="hoặc dán URL ảnh https://..." />'
    + (a.imageUrl ? '<p><img src="' + esc(a.imageUrl) + '" style="max-height:120px;border-radius:8px" /></p>' : '')
    + '<label>Link khi bấm (tuỳ chọn)</label><input id="al" value="' + esc(a.linkUrl) + '" placeholder="https://..." />'
    + '<div class="row"><div><label>Từ ngày</label><input id="as" type="date" value="' + dIn(a.startsAt) + '" /></div><div><label>Đến hết ngày</label><input id="ae" type="date" value="' + (a.endsAt ? dIn(new Date(+new Date(a.endsAt) - 1).toISOString()) : '') + '" /></div>'
    + '<div><label>Bật</label><select id="aa"><option value="1">Bật</option><option value="0"' + (a.active === false ? ' selected' : '') + '>Tắt</option></select></div></div>'
    + '<p><button class="btn" onclick="saveAd()">Lưu</button> ' + (a.id ? '<button class="ghost" onclick="state.editAd=null;renderAds()">Huỷ sửa</button>' : '') + '</p></div>'
    + '<div class="card"><table><tr><th></th><th>Tiêu đề</th><th>Vị trí</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr>'
    + state.ads.map((x, i) => '<tr><td><img src="' + esc(x.imageUrl) + '" style="height:40px;border-radius:4px" /></td><td>' + esc(x.title) + '</td><td>' + x.placement + '</td>'
      + '<td>' + day(x.startsAt) + ' → ' + day(new Date(+new Date(x.endsAt) - 1).toISOString()) + '</td><td>' + status(x) + '</td>'
      + '<td><button class="ghost" onclick="state.editAd=state.ads[' + i + '];renderAds();scrollTo(0,0)">Sửa</button> <button class="ghost danger" onclick="delAd(\'' + x.id + '\')">Xoá</button></td></tr>').join('')
    + '</table></div>';
}
async function saveAd() {
  try {
    let imageUrl = $('ai').value.trim();
    const file = $('af').files[0];
    if (file) {
      const up = await api('/admin/ads/upload-url', { method: 'POST', body: { contentType: file.type } });
      const r = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!r.ok) throw new Error('Upload ảnh lỗi ' + r.status);
      imageUrl = up.publicUrl;
    }
    if (!$('as').value || !$('ae').value) throw new Error('Chọn ngày bắt đầu và kết thúc');
    // Ngày theo giờ VN; "đến hết ngày" = 0h ngày hôm sau.
    const startsAt = new Date($('as').value + 'T00:00:00+07:00').toISOString();
    const endsAt = new Date(+new Date($('ae').value + 'T00:00:00+07:00') + 86400000).toISOString();
    const body = { title: $('at').value, imageUrl, linkUrl: $('al').value.trim() || undefined, placement: $('ap').value, startsAt, endsAt, active: $('aa').value === '1' };
    const id = state.editAd && state.editAd.id;
    await api('/admin/ads' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body });
    state.editAd = null; toast('Đã lưu'); renderAds();
  } catch (e) { toast(e.message); }
}
async function delAd(id) { if (!confirm('Xoá quảng cáo này?')) return; try { await api('/admin/ads/' + id, { method: 'DELETE' }); toast('Đã xoá'); renderAds(); } catch (e) { toast(e.message); } }

token ? start() : logout();
</script>
</body>
</html>`;
