const STORE_KEY = 'aml_settings';
const CONSENT_KEY = 'aml_consent';
const STATS_KEY = 'aml_stats';
// 面向用户显示的版本号（与 Chrome 内部数字版本无关，仅用于界面展示）
const DISPLAY_VERSION = 'V0.9-test';

const FEATURES = [
  { key: 'focusMode', label: '专注模式', desc: '隐藏干扰元素，沉浸学习' },
  { key: 'autoO2', label: '自动 O2 优化', desc: '提交时自动开启 O2' },
  { key: 'problemColors', label: '题目难度颜色', desc: '题目列表显示难度标签' },
  { key: 'chatMarkdown', label: '私信 Markdown', desc: '私信支持 Markdown 渲染' },
  { key: 'discussCopy', label: '讨论区复制', desc: '帖子内添加复制按钮' },
  { key: 'problemJumper', label: '题目跳转', desc: '双击题号跳转' },
  { key: 'saveStationJumper', label: '保存站跳转', desc: '自动跳转保存站' },
  { key: 'userSearch', label: '用户搜索', desc: '首页用户搜索框（需授权）' },
  { key: 'showIntroduction', label: '显示用户介绍', desc: '用户主页显示介绍' },
  { key: 'extendTask', label: '任务计划增强', desc: '任务列表随机跳转' },
  { key: 'nbnhhsh', label: '缩写查询', desc: '选中缩写 Ctrl+Shift+N' },
  { key: 'problemRandom', label: '随机跳题', desc: '题目列表随机跳题' },
  { key: 'useLuoguMe', label: '使用 luogu.me', desc: '切换保存站域名' },
  { key: 'copyMarkdown', label: '复制 Markdown', desc: '复制当前内容为 Markdown' },
  { key: 'emojiRendering', label: '表情渲染', desc: 'QQ 表情代码转 Emoji' },
  { key: 'buttonUnlocker', label: '报名解锁', desc: '解锁比赛报名倒计时' },
  { key: 'problemJumpStyling', label: '跳转样式优化', desc: '首页跳转框美化' },
  { key: 'benbenCtrlEnter', label: 'Ctrl+Enter 发犇犇', desc: '犇犇快捷键' },
  { key: 'hideFortune', label: '隐藏求签', desc: '签到后隐藏求签结果和宜忌，放大打卡天数' },
  { key: 'adBlock', label: '广告隐藏', desc: '隐藏题目/题解/讨论区等各区域推荐广告' },
  { key: 'outboundGuard', label: '跳出网站提示', desc: '跳往非洛谷相关网站时确认，并在新窗口打开' }
];

const $ = (sel) => document.querySelector(sel);

function svgIcon(name) {
  const paths = {
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
  };
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>';
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

async function getSettings() {
  const res = await chrome.storage.local.get([STORE_KEY, CONSENT_KEY, STATS_KEY]);
  return res;
}

function renderSettings(list) {
  const container = $('#settings-list');
  container.innerHTML = '';
  FEATURES.forEach((f) => {
    const key = f.key;
    const val = list[STORE_KEY] ? list[STORE_KEY][key] : true;
    const item = document.createElement('div');
    item.className = 'setting-item';
    item.innerHTML =
      '<div><div class="setting-label">' + f.label + '</div><div class="setting-desc">' + f.desc + '</div></div>' +
      '<label class="switch"><input type="checkbox" data-key="' + key + '" ' + (val ? 'checked' : '') + '><span class="slider"></span></label>';
    container.appendChild(item);
  });
  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const key = cb.dataset.key;
      const cur = await chrome.storage.local.get(STORE_KEY);
      const settings = Object.assign({}, (cur[STORE_KEY] || {}), { [key]: cb.checked });
      await chrome.storage.local.set({ [STORE_KEY]: settings });
    });
  });
}

function renderStats(stats, consent) {
  const body = $('#stats-body');
  if (consent !== 'allow') {
    body.className = 'stats-empty';
    body.textContent = '未授权，不获取数据。';
    return;
  }
  if (!stats) {
    body.className = 'stats-loading';
    body.textContent = '暂无数据，可点击上方"重新获取"。';
    return;
  }
  body.className = '';
  body.innerHTML =
    '<div class="stats-grid">' +
      '<div class="stat-user"><span class="avatar-ico">' + svgIcon('user') + '</span><div><div class="u-name">' + esc(stats.name) + '</div><div class="u-slogan">' + esc(stats.slogan) + '</div></div></div>' +
      '<div class="stat-card"><div class="stat-label">通过题目</div><div class="stat-value primary">' + stats.passed + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">提交题目</div><div class="stat-value primary">' + stats.submitted + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">排名</div><div class="stat-value">' + esc(String(stats.ranking)) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">UID</div><div class="stat-value">' + esc(String(stats.uid)) + '</div></div>' +
    '</div>';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function init() {
  const data = await getSettings();
  const settings = data[STORE_KEY] || {};
  const consent = data[CONSENT_KEY] || null;

  renderSettings(data);
  renderStats(data[STATS_KEY], consent);

  // 版本与更新
  try {
    $('#brand-version').textContent = DISPLAY_VERSION;
  } catch (e) {}
  $('#check-update-btn').addEventListener('click', () => checkUpdate(true));
  checkUpdate(false);

  // 主题色
  $('#theme-color').value = settings.themeColor || '#4f46e5';
  $('#theme-color-text').textContent = settings.themeColor || '#4f46e5';
  $('#theme-color').addEventListener('input', async (e) => {
    const color = e.target.value;
    $('#theme-color-text').textContent = color;
    const cur = await chrome.storage.local.get(STORE_KEY);
    const newSettings = Object.assign({}, (cur[STORE_KEY] || {}), { themeColor: color });
    await chrome.storage.local.set({ [STORE_KEY]: newSettings });
  });

  // 重新获取数据
  $('#crawl-btn').addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab && tab.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'crawlNow' }, () => {
        toast('已请求获取数据，请到页面查看');
        setTimeout(loadAll, 1500);
      });
    } else {
      toast('请先在洛谷页面打开');
    }
  });

  // 修改授权已迁移至页面「更多设置」面板，此处不再提供
});

function toast(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:99;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ============ 版本更新 ============
function renderUpdate(info) {
  const curEl = $('#upd-current');
  const latEl = $('#upd-latest');
  const actEl = $('#update-action');
  if (!curEl || !latEl || !actEl) return;
  curEl.textContent = DISPLAY_VERSION;
  actEl.innerHTML = '';

  if (info.error) {
    latEl.textContent = '检测失败';
    latEl.className = 'err';
    actEl.textContent = '请检查网络后点击"检查更新"';
    return;
  }
  if (info.unreachable) {
    latEl.textContent = '—';
    latEl.className = '';
    actEl.textContent = '未配置更新源或已是最新';
    return;
  }
  latEl.textContent = 'v' + info.latest;
  latEl.className = info.updateAvailable ? 'new' : '';

  if (info.updateAvailable) {
    const a = document.createElement('a');
    a.className = 'btn btn-primary btn-sm';
    a.href = info.url || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '下载新版本';
    actEl.appendChild(a);
  } else {
    actEl.textContent = '已是最新版本';
  }
}

async function checkUpdate(force) {
  const btn = $('#check-update-btn');
  if (btn) btn.disabled = true;
  try {
    const info = await chrome.runtime.sendMessage({ type: 'checkUpdate' });
    renderUpdate(info || { current: '?.?.?', latest: '—', error: true });
  } catch (e) {
    renderUpdate({ current: '?.?.?', latest: '—', error: true });
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadAll() {
  const data = await getSettings();
  renderStats(data[STATS_KEY], data[CONSENT_KEY] || null);
  renderConsent(data[CONSENT_KEY] || null);
}

document.addEventListener('DOMContentLoaded', init);