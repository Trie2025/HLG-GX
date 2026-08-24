// XE-Luogu(氙-Luogu) XLG - 后台 Service Worker
// 职责：提供 storage 读写（替代 GM_* 系列）、跨域请求代理（替代 GM_xmlhttpRequest）、版本更新检测
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/Trie2025/HLG-GX/main/release/version.json';
const UPDATE_KEY = 'hlg_update'; // { version, url, checkedAt }

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.local.get('aml_settings', (res) => {
    if (!res.aml_settings) {
      chrome.storage.local.set({
        aml_settings: {
          themeColor: '#4f46e5',
          panelOpen: true,
          sidebarCollapsed: false,
          focusMode: false,
          autoO2: true,
          problemColors: true,
          chatMarkdown: true,
          discussCopy: true,
          problemJumper: true,
          saveStationJumper: true,
          userSearch: true,
          showIntroduction: true,
          extendTask: true,
          nbnhhsh: true,
          problemRandom: true,
          useLuoguMe: false,
          copyMarkdown: true,
          chatNotification: true,
          emojiRendering: true,
          buttonUnlocker: true,
          problemJumpStyling: true,
          benbenCtrlEnter: true,
          memoEnabled: true,
          memoContent: '欢迎使用 XE-Luogu(氙-Luogu) XLG！',
          customCSS: '',
          defaultCode: '',
          autoReply: false,
          siteFont: true,
          focusModeHideChat: true,
          focusModeHideSidebar: true,
          focusModeHideFooter: true,
          focusModeHideHome: true
        }
      });
    }
  });

  // 安装/更新后立即检查一次更新
  if (details.reason === 'install' || details.reason === 'update') {
    checkForUpdate(true);
    scheduleUpdateCheck();
  } else {
    scheduleUpdateCheck();
  }
});

// 每 6 小时自动检查一次更新
function scheduleUpdateCheck() {
  chrome.alarms.create('hlg-update-check', { periodInMinutes: 6 * 60 });
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === 'hlg-update-check') checkForUpdate(false);
});

// 版本比较：latest 是否大于 current
function isNewer(latest, current) {
  const a = String(latest || '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// 检查更新。force=true 跳过 6 小时缓存，立即请求。
async function checkForUpdate(force) {
  const cur = chrome.runtime.getManifest().version;
  const cached = await chrome.storage.local.get(UPDATE_KEY);
  const now = Date.now();
  const CACHE_TTL = 6 * 3600 * 1000;

  const useCache = cached[UPDATE_KEY] && !force && now - cached[UPDATE_KEY].checkedAt < CACHE_TTL;
  if (useCache) {
    const u = cached[UPDATE_KEY];
    const updateAvailable = isNewer(u.version, cur);
    applyBadge(updateAvailable);
    return { current: cur, latest: u.version, url: u.url, updateAvailable, cached: true };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(UPDATE_CHECK_URL + '?t=' + now, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const u = { version: data.version, url: data.url, checkedAt: now };
    await chrome.storage.local.set({ [UPDATE_KEY]: u });
    const updateAvailable = isNewer(u.version, cur);
    applyBadge(updateAvailable);
    return { current: cur, latest: u.version, url: u.url, updateAvailable, cached: false };
  } catch (e) {
    // 网络失败时回退到缓存
    if (cached[UPDATE_KEY]) {
      const u = cached[UPDATE_KEY];
      const updateAvailable = isNewer(u.version, cur);
      applyBadge(updateAvailable);
      return { current: cur, latest: u.version, url: u.url, updateAvailable, cached: true, error: String(e && e.message || e) };
    }
    applyBadge(false);
    return { current: cur, latest: cur, url: '', updateAvailable: false, error: String(e && e.message || e) };
  }
}

// 有新版本时在工具栏图标上显示数字角标
function applyBadge(updateAvailable) {
  if (updateAvailable) {
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    chrome.action.setBadgeText({ text: '新' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// 跨域请求代理：content script 无法直接请求外部域，统一走这里
async function proxyFetch(msg) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const opts = {
      method: msg.method || 'GET',
      headers: msg.headers || {},
      signal: controller.signal
    };
    if (msg.body != null) opts.body = msg.body;
    const res = await fetch(msg.url, opts);
    clearTimeout(timer);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: '', error: String(e && e.message || e) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'fetch') {
    proxyFetch(msg).then(sendResponse);
    return true; // async
  }

  if (msg.type === 'storageGet') {
    chrome.storage.local.get(msg.keys, (res) => sendResponse(res));
    return true;
  }

  if (msg.type === 'storageSet') {
    chrome.storage.local.set(msg.data, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'storageRemove') {
    chrome.storage.local.remove(msg.keys, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'checkUpdate') {
    checkForUpdate(true).then(sendResponse);
    return true; // async
  }

  return false;
});