// XE-Luogu(氙-Luogu) XLG - 内容脚本
// 由原油猴脚本迁移而来，改为 CRX 架构：
//  - GM_setValue/GM_getValue  -> chrome.storage.local（经 background 代理）
//  - GM_xmlhttpRequest        -> background 代理 fetch
//  - GM_addStyle              -> content/main.css + 动态注入
//  - 移除"询问 cookie/注册 上传凭证"的模块，改为"征得同意后自行爬取本地数据"
//  - 数据爬取仅在用户手动点击时进行，并做节流缓存，避免频繁访问洛谷 API
(() => {
  'use strict';

  const STORE_KEY = 'aml_settings';
  const CONSENT_KEY = 'aml_consent'; // 'allow' | 'deny' | null
  const STATS_KEY = 'aml_stats';
  // 面向用户的显示版本号（与 Chrome 内部数字版本无关，仅用于界面展示）
  const DISPLAY_VERSION = 'V0.9-test';

  // ============ 存储封装（替代 GM_setValue / GM_getValue / GM_deleteValue） ============
  const K = (k) => 'aml_' + k;

  function getStore(keys) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'storageGet', keys }, (res) => resolve(res || {}));
    });
  }
  function setStore(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'storageSet', data }, () => resolve());
    });
  }
  function removeStore(keys) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'storageRemove', keys }, () => resolve());
    });
  }

  // 功能设置（替代 GM_getValue(GM_getValue('aml_'+k))）
  const DEFAULTS = {
    themeColor: '#4f46e5',
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
    randomExcludeAc: true,   // 随机跳题：排除已AC题目（洛谷随机跳题 filterAccepted）
    useLuoguMe: true,
    copyMarkdown: true,
    chatNotification: true,
    emojiRendering: true,
    latexRendering: true,
    buttonUnlocker: true,
    problemJumpStyling: true,
    benbenCtrlEnter: true,
    memoEnabled: true,
    memoContent: '欢迎使用 XE-Luogu(氙-Luogu) XLG！',
    customCSS: '',
    defaultCode: '',
    autoReply: true,
    siteFont: true,
    siteFontKeepLatex: true,
    settingsBtnVisible: true,   // 右下角设置按钮显示/隐藏（隐藏后仍可用 Ctrl+, 唤起设置）
    focusModeHideChat: true,
    focusModeHideSidebar: true,
    focusModeHideFooter: true,
    focusModeHideHome: true,
    hideFortune: true,
    adBlock: true,
    outboundGuard: true,
    contestCalendar: true,
    foldProblemBg: true,
    benbenReplyMd: true,
    focusLock: true,
    htmlRunBlock: true,
    ratingCurve: true,
    contestPrediction: true,     // 比赛记分板等级分预测（还原自 tts.txt 原插件 /contest/ 部分）
    runCommand: true,
    autoExpandBenben: true,
    discussList: true,
    codeFolding: true,
    userEloColor: true,
    acceptedProblemCmp: true,
    aiAnalysis: false,
    aiApiUrl: 'https://api.openai.com/v1/chat/completions',
    aiApiKey: '',
    aiModel: 'gpt-4o-mini',
    // ===== 迁移自「插件」文件夹油猴脚本的功能开关键 =====
    tasklistHideAc: true,        // 任务计划/题单：隐藏已AC（exlg tasklist-ex auto_clear）
    solutionTag: true,           // 题目列表：可交题解标记（洛谷可交题解）
    globalSearch: true,          // Alt+S 全局搜索（Better Luogu）
    searchEngine: 0,             // 全局搜索默认引擎 0百度/1谷歌/2必应/3洛谷
    homeFavTrainings: true,      // 主页收藏题单+进度（主页显示收藏题单）
    userCardStats: true,         // 用户页 CCS+咕值+粉丝卡片（Better Luogu userCard）
    submissionVisual: true,      // 提交记录测试点色卡（提交记录显示优化）
    customAcImage: '',           // 自定义 AC 图片 URL（为空则用洛谷默认，mf2 luogu_ac_image）
    origDifficulty: true,        // CF/AT 原始难度（exlg original-difficulty）
    submissionDiffColor: true,   // 提交记录难度着色（exlg submission-color）
    articleExportPdf: true,      // 专栏导出 PDF（Article2PDF）
    editorFormat: true,          // 编辑器自动排版（exlg blog format）
    commentManager: false,       // 专栏评论管理（Better Luogu commentManager）
    globalBenben: true,          // 全网犇犇聚合（exlg 全网犇犇）
    benbenRank: true,            // 犇犇龙王排行（exlg benben-ranklist）
    codeScan: true,              // 危险代码扫描（exlg malicious-code-identifier）
    roundTheme: true,            // 全局圆角化（氩洛谷附赠圆角化）
    achievement: true,           // 成就系统：AC 时冒 banner + 撒花（成就系统 V1.0）
    punctuationTool: true,       // 网页标点处理工具（多种标点处理模式）
    puncMode: 'normal',          // 网页标点默认模式：normal/remove/add/removeAlt/swap（在设置中心切换）
    captchaAuto: true,           // 自动识别填充验证码（走后台代理，规避混合内容拦截）
    captchaToken: '',            // 验证码识别服务 Token
    hideSolution: true,          // 隐藏题解正文（exlg hide-solution）
    discussionSave: true,        // 发帖自动保存草稿/恢复（exlg discussion-save）
    hideDifficulty: true,        // 题目难度隐藏开关 V1.3（隐藏/悬停显示/始终显示）
    diffMode: 'show'             // 难度模式：show 始终显示 / hover 悬停显示 / hidden 隐藏（在设置中心切换）
  };

  let S = Object.assign({}, DEFAULTS);
  let consent = null;   // crawl 授权状态
  let stats = null;     // 爬取到的用户数据

  // 主题色应用到 CSS 变量
  function applyTheme() {
    document.documentElement.style.setProperty('--aml-primary', S.themeColor || '#4f46e5');
  }

  // 监听设置变更（popup 修改后实时生效）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.aml_settings) {
      S = Object.assign({}, DEFAULTS, changes.aml_settings.newValue);
      applyTheme();
    }
    if (changes.aml_stats) { stats = changes.aml_stats.newValue; dispatchStats(); }
  });

  // ============ 基础工具 ============
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'aml-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
  }

  function debounce(fn, delay) {
    let t = null;
    return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), delay); };
  }

  // 分片处理，避免长时间阻塞主线程
  function chunk(items, fn, size) {
    return new Promise((resolve) => {
      let idx = 0;
      function next() {
        const end = Math.min(idx + size, items.length);
        for (let i = idx; i < end; i++) { try { fn(items[i], i); } catch (e) {} }
        idx = end;
        // 必须用 setTimeout 而非 requestAnimationFrame：
        // 后台标签页/无头环境下 rAF 不触发，await chunk 会永久挂起，
        // 导致 init 后半段（保存站恢复、SPA 观察器等）全部失效
        if (idx < items.length) setTimeout(next, 0);
        else resolve();
      }
      next();
    });
  }

  // 从页面/登录 cookie 读取当前登录用户（自行解析，不需要用户填写任何凭证）
  function getCookie(name) {
    const val = '; ' + document.cookie;
    const parts = val.split('; ' + name + '=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function getCurrentUser() {
    // 0) 登录 cookie（_uid 是洛谷登录后写入的用户 id cookie）
    const uidFromCookie = getCookie('_uid') || getCookie('uid');

    // A) 页面内嵌上下文（最权威：真实 uid + 用户名）。优先于链接启发式，
    //    避免把用户下拉菜单里"个人中心 / 练习情况 / 设置"等 /user/uid 链接文字误当用户名。
    let ctxUser = null;
    try {
      const ctx = $('#lentille-context');
      if (ctx) {
        const data = JSON.parse(ctx.innerHTML);
        if (data && data.data && data.data.user) {
          ctxUser = {
            uid: data.data.user.uid,
            name: data.data.user.name || '',
            intro: data.data.user.introduction || ''
          };
        }
      }
    } catch (e) {}
    if (ctxUser && ctxUser.name) return ctxUser;

    // B) 便捷菜单/占位文字的判定：纯中文且较短(≤5)的短语多为"个人中心/练习情况/设置"等
    //    导航标签，而非用户名；规避提高块列表却也难以穷举的问题。
    const RESERVED = ['个人中心', '设置', '练习情况', '退出登录', '退出', '我的主页', '个人主页', '用户中心', '个人资料'];
    const isLabelLike = (s) =>
      RESERVED.indexOf(s) !== -1 || (/^[\u4e00-\u9fff]+$/.test(s) && s.length <= 5);

    // C) 遍历头部候选，解析 /user/uid 链接，用 cookie uid 匹配当前用户，且排除标签文字。
    const headers = $all('.header-layout, nav, .lg-header, .header, .lfe-body, .lfe-nav, header');
    for (const h of headers) {
      const links = $all('a[href^="/user/"]', h);
      for (const link of links) {
        const m = link.href.match(/\/user\/(\d+)/);
        if (!m) continue;
        if (uidFromCookie && m[1] === uidFromCookie) {
          const linkName = (link.textContent || '').trim();
          if (linkName && !isLabelLike(linkName)) return { uid: m[1], name: linkName, intro: '' };
        }
      }
    }

    // D) 兜底
    if (ctxUser && ctxUser.uid) return ctxUser;
    if (uidFromCookie) return { uid: uidFromCookie, name: '', intro: '' };
    return null;
  }

  function getUid() {
    const u = getCurrentUser();
    return (u && u.uid) || null;
  }
  function getUname() {
    const u = getCurrentUser();
    return (u && u.name) || null;
  }

  // ============ 跨域请求（替代 GM_xmlhttpRequest） ============
  function xhr(opts) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'fetch', url: opts.url, method: opts.method, headers: opts.headers, body: opts.data }, (res) => {
        if (!res) return resolve(null);
        if (opts.onload) {
          opts.onload({ status: res.status, responseText: res.text });
        }
        resolve(res);
      });
    });
  }

  // ============ 简易 Markdown 渲染（替代 marked + highlight） ============
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // 行内渲染：代码、加粗、斜体、删除线、图片、链接。结构与洛谷所用 marked 保持一致，
  // 放入 .lfe-marked 后由洛谷自带样式表着色，观感与原生一致。
  function inlineMd(s) {
    let txt = escapeHtml(s);
    // 给 URL 自动加链接（洛谷 marked 不自动，但保守起见不强加）
    txt = txt
      .replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => '<img src="' + src + '" alt="' + alt + '" />')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, href) => '<a href="' + href + '" target="_blank" rel="nofollow noopener">' + t + '</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
    return txt;
  }

  // 完整 Markdown 渲染（块级），产出的 DOM 结构与洛谷 marked 的 .lfe-marked 一致
  function renderMarkdown(md) {
    if (!md) return '';
    const lines = (md + '\n').split('\n');
    let i = 0;
    const out = [];
    const lists = [];

    const blockStart = () => {
      while (lists.length) out.push('</' + lists.pop() + '>');
    };

    const renderTable = (headCells, rows) => {
      let t = '<table><thead><tr>';
      t += headCells.map((c) => '<th>' + inlineMd(c.trim()) + '</th>').join('');
      t += '</tr></thead><tbody>';
      rows.forEach((r) => {
        t += '<tr>' + r.map((c) => '<td>' + inlineMd(c.trim()) + '</td>').join('') + '</tr>';
      });
      t += '</tbody></table>';
      return t;
    };

    while (i < lines.length) {
      const raw = lines[i];
      const line = raw.replace(/\r$/, '');

      // 代码块
      if (/^```/.test(line.trim())) {
        blockStart();
        const lang = line.trim().slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
        out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        i++;
        continue;
      }
      // 前导空格缩进代码块（4 空格/tab）
      if (/^( {4}|\t)/.test(line)) {
        blockStart();
        const buf = [];
        while (i < lines.length && /^( {4}|\t)/.test(lines[i])) { buf.push(lines[i].replace(/^( {4}|\t)/, '')); i++; }
        out.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }
      // 表格
      const tblMatch = line.match(/^\s*\|?(.+)\|?\s*$/);
      if (tblMatch && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /^[\s|:|-]*-[-:|\s]*$/.test(lines[i + 1])) {
        blockStart();
        const headCells = line.replace(/^\||\|$/g, '').split('|');
        const rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          rows.push(lines[i].replace(/^\||\|$/g, '').split('|'));
          i++;
        }
        out.push(renderTable(headCells, rows));
        continue;
      }
      // 标题
      const hm = /^(#{1,6})\s+(.*)$/.exec(line);
      if (hm) {
        blockStart();
        out.push('<h' + hm[1].length + '>' + inlineMd(hm[2]) + '</h' + hm[1].length + '>');
        i++;
        continue;
      }
      // 无序/有序列表
      const om = /^(\s*)([*-]|\d+\.)\s+(.*)$/.exec(line);
      if (om && /[*-]/.test(om[2])) {
        if (!lists.length) { out.push('<ul>'); lists.push('ul'); }
        out.push('<li>' + inlineMd(om[3]) + '</li>');
        // 折叠后续连续列表行
        i++;
        while (i < lines.length && /^(\s*)[*-]\s+/.test(lines[i])) { out.push('<li>' + inlineMd(lines[i].replace(/^\s*[*-]\s+/, '')) + '</li>'); i++; }
        blockStart();
        continue;
      }
      const oom = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
      if (oom) {
        if (!lists.length) { out.push('<ol>'); lists.push('ol'); }
        out.push('<li>' + inlineMd(oom[3]) + '</li>');
        i++;
        while (i < lines.length && /^(\s*)\d+\.\s+/.test(lines[i])) { out.push('<li>' + inlineMd(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>'); i++; }
        blockStart();
        continue;
      }
      // 引用
      if (/^>\s?/.test(line)) {
        blockStart();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote><p>' + inlineMd(buf.join('\n')) + '</p></blockquote>');
        continue;
      }
      // 分割线
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blockStart(); out.push('<hr/><hr/>'); i++; continue; }
      // 空行
      if (!line.trim()) { blockStart(); i++; continue; }
      // 普通段落
      blockStart();
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i]) &&
             !/^>\s?/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i]) && !/^\s*([*-])\s/.test(lines[i]) &&
             !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + inlineMd(para.join('\n')) + '</p>');
    }
    return out.join('');
  }

  // ============ 授权弹窗（爬取前询问用户） ============
  function ensureConsent() {
    return getStore([CONSENT_KEY]).then((res) => {
      consent = res[CONSENT_KEY] || null;
      if (consent === 'allow' || consent === 'deny') return consent;
      return showConsentModal();
    });
  }

  function showConsentModal() {
    return new Promise((resolve) => {
      if ($('.aml-consent-mask')) return;
      const mask = document.createElement('div');
      mask.className = 'aml-consent-mask';
      mask.innerHTML =
        '<div class="aml-consent-box">' +
          '<div class="aml-consent-icon">' + svgIcon('shield') + '</div>' +
          '<h2 class="aml-consent-title">扩展授权</h2>' +
          '<p class="aml-consent-desc">为了展示您的数据概览（通过题目、提交数、排名等），需要读取您<b>自己的</b>洛谷页面数据。' +
          '所有数据仅保存在本地浏览器中，<b>不会上传到任何服务器</b>。' +
          '您也可以选择不授权，仅使用页面增强功能。</p>' +
          '<div class="aml-consent-actions">' +
            '<button class="aml-btn aml-btn-ghost" data-act="deny">不同意，仅增强</button>' +
            '<button class="aml-btn aml-btn-primary" data-act="allow">同意授权</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(mask);

      mask.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const act = btn.dataset.act;
          consent = act;
          await setStore({ [CONSENT_KEY]: act });
          mask.remove();
          if (act === 'allow') { crawlStats(); toast('已授权，正在获取您的数据'); }
          else toast('已关闭数据获取功能');
          resolve(consent);
        });
      });
    });
  }

  // ============ 数据爬取（自行从洛谷 API 获取，无需用户提供 cookie） ============
  // 节流：60 秒内不重复请求洛谷 API，避免大量访问；数据同时缓存到本地。
  const CRAWL_THROTTLE_MS = 60 * 1000;
  let lastCrawlAt = 0;
  async function crawlStats(force) {
    const uid = getUid();
    if (!uid) { toast('未检测到登录状态，无法获取数据'); return; }
    const now = Date.now();
    if (!force && lastCrawlAt && now - lastCrawlAt < CRAWL_THROTTLE_MS) {
      toast('获取过于频繁，请稍后再试');
      return;
    }
    lastCrawlAt = now;
    try {
      const res = await fetch('https://www.luogu.com.cn/api/user/info/' + uid, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      const json = await res.json();
      // 注意：洛谷 /api/user/info/{uid} 响应没有顶层 code 字段，直接返回 { user: {...} }，
      // 因此用 json.user 是否存在来判断成功，而非 json.code === 200。
      if (json && json.user) {
        stats = {
          name: json.user.name,
          uid: json.user.uid,
          slogan: json.user.slogan || '这个家伙很懒，什么也没留下',
          passed: json.user.passedProblemCount || 0,
          submitted: json.user.submittedProblemCount || 0,
          ranking: json.user.ranking || '无',
          time: now
        };
        await setStore({ [STATS_KEY]: stats });
        dispatchStats();
      } else {
        toast('数据获取失败，请确认已登录');
      }
    } catch (e) {
      toast('数据获取失败');
    }
  }

  function dispatchStats() {
    window.dispatchEvent(new CustomEvent('aml:stats', { detail: stats }));
    updateGreeting();
  }

  // 刷新设置面板问候语（用户名来源：顶部导航 > 已爬取数据 > 访客）
  function updateGreeting() {
    const g = $('#aml-sp-greet');
    if (!g) return;
    const user = getCurrentUser();
    const uname = (user && user.name) || (stats && stats.name) || '访客';
    g.textContent = 'Hi, ' + esc(uname) + ' !';
  }

  // ============ SVG 图标（不使用 emoji） ============
  function svgIcon(name, size) {
    const s = size || 22;
    const paths = {
      moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
      sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
      up: '<polyline points="18 15 12 9 6 15"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      wand: '<path d="M15 4V2M15 22v-2M8.5 4V2M8.5 22v-2M2 8.5H4M22 8.5h-2M2 15.5H4M22 15.5h-2M12 2v3M12 19v3M4 12h3M17 12h3M12 8a4 4 0 0 1 4 4"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
      user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
      eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
      expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
      copyMd: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
      bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      random: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
      send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      spark: '<path d="M12 2l1.9 5.8a1 1 0 0 0 .6.6L20.3 10l-5.8 1.9a1 1 0 0 0-.6.6L12 18.3l-1.9-5.8a1 1 0 0 0-.6-.6L3.7 10l5.8-1.6a1 1 0 0 0 .6-.6L12 2z"/><path d="M19 15l.7 2.2a.5.5 0 0 0 .3.3L22 18l-2 .7a.5.5 0 0 0-.3.3L19 21l-.7-2a.5.5 0 0 0-.3-.3L16 18l2-.7a.5.5 0 0 0 .3-.3L19 15z"/>'
    };
    return '<svg class="aml-ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.check) + '</svg>';
  }

  // ============ 功能实现（由原脚本迁移） ============
  // 顶部导航增强
  function featureNavEnhanced() {
    const nav = $('.lg-nav');
    if (!nav || nav.querySelector('.lg-nav-enhanced')) return;
    const wrap = document.createElement('div');
    wrap.className = 'lg-nav-enhanced';
    const items = [['题库', '/problem/list'], ['题解', '/solution'], ['讨论', '/discuss'], ['比赛', '/contest'], ['排名', '/ranklist']];
    items.forEach(([text, url]) => {
      const a = document.createElement('a');
      a.href = url; a.textContent = text;
      if (location.pathname.startsWith(url.split('?')[0])) a.classList.add('active');
      wrap.appendChild(a);
    });
    nav.appendChild(wrap);
  }

  // 侧边栏快捷操作
  function featureSidebarQuick() {
    const sidebar = $('.lg-sidebar');
    if (!sidebar || sidebar.querySelector('.lg-sidebar-quick')) return;
    const tools = document.createElement('div');
    tools.className = 'lg-sidebar-quick';
    tools.innerHTML =
      '<div class="lg-sidebar-quick-title">快捷操作</div>' +
      '<div class="item" data-action="copy-pid">' + svgIcon('copy', 16) + '<span>复制题号</span></div>' +
      '<div class="item" data-action="reading-mode">' + svgIcon('book', 16) + '<span>阅读模式</span></div>' +
      '<div class="item" data-action="fullscreen">' + svgIcon('expand', 16) + '<span>全屏模式</span></div>';
    sidebar.appendChild(tools);
    tools.addEventListener('click', (e) => {
      const item = e.target.closest('.item');
      if (!item) return;
      const act = item.dataset.action;
      const label = item.querySelector('span');
      if (act === 'copy-pid') {
        const pid = $('.lg-problem-id');
        if (pid) {
          navigator.clipboard.writeText(pid.textContent.trim()).then(() => {
            label.textContent = '已复制';
            setTimeout(() => label.textContent = '复制题号', 1500);
          });
        }
      } else if (act === 'reading-mode') {
        document.body.classList.toggle('lg-reading-mode');
        label.textContent = document.body.classList.contains('lg-reading-mode') ? '退出阅读' : '阅读模式';
      } else if (act === 'fullscreen') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      }
    });
  }

  // 回到顶部
  function featureScrollTop() {
    if ($('.lg-scroll-top')) return;
    const btn = document.createElement('div');
    btn.className = 'lg-scroll-top';
    btn.innerHTML = svgIcon('up', 22);
    btn.title = '回到顶部';
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => { btn.style.display = window.scrollY > 300 ? 'flex' : 'none'; });
  }

  // 阅读进度条
  function featureReadingProgress() {
    if ($('.lg-reading-progress')) return;
    const bar = document.createElement('div');
    bar.className = 'lg-reading-progress';
    document.body.appendChild(bar);
    let ticking = false;
    const update = () => {
      ticking = false;
      const top = document.documentElement.scrollTop || document.body.scrollTop;
      const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      bar.style.width = (h > 0 ? (top / h * 100) : 0) + '%';
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
  }

  // Ctrl+Enter 提交
  function featureCtrlEnter() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        const btn = $('.lg-submit-btn, [type="submit"]');
        if (btn) { btn.click(); e.preventDefault(); }
      }
    });
  }

  // 题目列表难度标签
  function featureDifficultyTags() {
    if (!S.problemColors) return;
    const list = $('.lg-problem-list');
    if (!list) return;
    const items = $all('.lg-problem-item', list).filter((el) => !el.querySelector('.lg-difficulty-tag'));
    if (!items.length) return;
    const colors = {
      '1': { bg: '#dcfce7', color: '#166534', text: '入门' },
      '2': { bg: '#dbeafe', color: '#1e40af', text: '普及-' },
      '3': { bg: '#bfdbfe', color: '#1e40af', text: '普及' },
      '4': { bg: '#e2e8f0', color: '#334155', text: '普及+' },
      '5': { bg: '#fee2e2', color: '#991b1b', text: '提高' },
      '6': { bg: '#fecaca', color: '#991b1b', text: '提高+' }
    };
    chunk(items, (item) => {
      const diff = item.getAttribute('data-difficulty') || '1';
      const style = colors[diff] || colors['1'];
      const tag = document.createElement('span');
      tag.className = 'lg-difficulty-tag';
      tag.style.background = style.bg; tag.style.color = style.color;
      tag.textContent = style.text;
      item.appendChild(tag);
    }, 20);
  }

  // 题目统计（通过/提交/通过率）
  function featureProblemStats() {
    const info = $('.lg-problem-info');
    if (!info || info.querySelector('.lg-problem-stats')) return;
    const acc = $('.lg-accepted-count'), tot = $('.lg-total-count');
    if (!acc || !tot) return;
    const a = parseInt(acc.textContent) || 0, t = parseInt(tot.textContent) || 1;
    const rate = (a / t * 100).toFixed(1);
    const stats = document.createElement('div');
    stats.className = 'lg-problem-stats';
    stats.innerHTML =
      '<div class="stat-item"><div class="stat-value">' + a + '</div><div class="stat-label">通过</div></div>' +
      '<div class="stat-item"><div class="stat-value">' + t + '</div><div class="stat-label">提交</div></div>' +
      '<div class="stat-item"><div class="stat-value">' + rate + '%</div><div class="stat-label">通过率</div></div>';
    info.appendChild(stats);
  }

  // 题目标签
  function featureProblemTags() {
    const content = $('.lg-problem-content');
    if (!content || content.querySelector('.lg-problem-tags')) return;
    const tags = $all('.lg-tag, .tag', content);
    if (!tags.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'lg-problem-tags';
    tags.forEach((t) => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = t.textContent.trim(); wrap.appendChild(s); });
    content.prepend(wrap);
  }

  // 帖子内题目彩色标签
  function featureContentPidTags() {
    const content = $('.lg-discuss-content, .lg-problem-content');
    if (!content) return;
    const text = content.innerHTML;
    const matches = text.match(/P\d{4,5}/g);
    if (!matches) return;
    const unique = matches.filter((v, i, a) => a.indexOf(v) === i);
    const map = {
      p1000: ['#dcfce7', '#166534', '#16a34a'], p1004: ['#dbeafe', '#1e40af', '#2563eb'], p1008: ['#fef9c3', '#854d0e', '#ca8a04'],
      p1011: ['#fee2e2', '#991b1b', '#dc2626'], p1014: ['#e2e8f0', '#334155', '#64748b'], p1016: ['#f3e8ff', '#6b21a8', '#9333ea'], p1018: ['#ffedd5', '#9a3412', '#ea580c']
    };
    unique.forEach((pid) => {
      const pnum = parseInt(pid.replace('P', ''));
      let cls = 'default';
      if (pnum >= 1000 && pnum <= 1003) cls = 'p1000';
      else if (pnum >= 1004 && pnum <= 1007) cls = 'p1004';
      else if (pnum >= 1008 && pnum <= 1010) cls = 'p1008';
      else if (pnum >= 1011 && pnum <= 1013) cls = 'p1011';
      else if (pnum >= 1014 && pnum <= 1015) cls = 'p1014';
      else if (pnum >= 1016 && pnum <= 1017) cls = 'p1016';
      else if (pnum >= 1018 && pnum <= 1019) cls = 'p1018';
      const st = map[cls] || ['#e2e8f0', '#475569', '#94a3b8'];
      const tag = '<span class="lg-problem-tag ' + cls + '" style="background:' + st[0] + ';color:' + st[1] + ';border-color:' + st[2] + ';">' + pid + '</span>';
      content.innerHTML = content.innerHTML.split(pid).join(tag);
    });
  }

  // 题目引用增强
  function featureProblemRef() {
    const content = $('.lg-discuss-content, .lg-problem-content');
    if (!content) return;
    const links = $all('a[href*="/problem/"]', content);
    links.forEach((link) => {
      if (link.parentElement.classList.contains('lg-problem-ref')) return;
      const pid = link.textContent.trim();
      if (!/^P\d{4,5}$/.test(pid)) return;
      const pnum = parseInt(pid.replace('P', ''));
      let diff = '题目引用';
      if (pnum >= 1000) diff = 'P' + pnum + ' 入门';
      const wrapper = document.createElement('div');
      wrapper.className = 'lg-problem-ref';
      wrapper.innerHTML = '<span class="ref-title">' + pid + '</span><span class="ref-difficulty">' + diff + '</span>';
      link.parentNode.replaceChild(wrapper, link);
    });
  }

  // 代码编辑器统计
  function featureCodeStats() {
    const editor = $('.lg-code-editor, .lg-editor');
    if (!editor || editor.querySelector('.lg-code-stat')) return;
    const stat = document.createElement('div');
    stat.className = 'lg-code-stat';
    stat.innerHTML = '<span>行数: <span id="aml-line-count">0</span></span><span>字符数: <span id="aml-char-count">0</span></span>';
    editor.appendChild(stat);
    const update = () => {
      const t = editor.textContent || editor.value || '';
      const lc = $('#aml-line-count'), cc = $('#aml-char-count');
      if (lc) lc.textContent = t.split('\n').length;
      if (cc) cc.textContent = t.length;
    };
    editor.addEventListener('input', debounce(update, 200));
    setTimeout(update, 300);
  }

  // 代码块复制
  function featureCodeCopy() {
    const pres = $all('.lg-problem-content pre, .lg-discuss-content pre, .lg-blog-content pre');
    if (!pres.length) return;
    chunk(pres, (pre) => {
      if (pre.parentElement.classList.contains('lg-code-wrapper')) return;
      const wrap = document.createElement('div');
      wrap.className = 'lg-code-wrapper';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.innerHTML = svgIcon('copy', 14) + '<span>复制</span>';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.textContent).then(() => {
          btn.classList.add('copied'); btn.querySelector('span').textContent = '已复制';
          setTimeout(() => { btn.classList.remove('copied'); btn.querySelector('span').textContent = '复制'; }, 1500);
        });
      });
      wrap.appendChild(btn);
    }, 10);
  }

  // 字数统计
  function featureWordCount() {
    const content = $('.lg-discuss-content, .lg-problem-content, .lg-blog-content');
    if (!content || $('.lg-word-count')) return;
    const text = content.textContent;
    const cc = text.length;
    const wc = text.split(/\s+/).filter((w) => w.length > 0).length;
    const div = document.createElement('div');
    div.className = 'lg-word-count';
    div.innerHTML = '<span>字符: <span class="count-num">' + cc + '</span></span><span>词数: <span class="count-num">' + wc + '</span></span>';
    const parent = content.parentNode;
    if (parent) parent.insertBefore(div, content);
  }

  // 浮动目录
  function featureToc() {
    if ($('.lg-toc')) return;
    const content = $('.lg-discuss-content, .lg-problem-content, .lg-blog-content');
    if (!content) return;
    const headers = $all('h1, h2, h3', content);
    if (headers.length < 3) return;
    const toc = document.createElement('div');
    toc.className = 'lg-toc';
    toc.innerHTML = '<div class="lg-toc-title">目录</div>';
    headers.forEach((header, idx) => {
      const level = parseInt(header.tagName.replace('H', ''));
      const id = 'aml-toc-' + idx;
      header.id = id;
      const item = document.createElement('div');
      item.className = 'toc-item level-' + level;
      item.textContent = header.textContent.trim();
      item.addEventListener('click', () => document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' }));
      toc.appendChild(item);
    });
    document.body.appendChild(toc);
  }

  // 工具栏快捷操作
  function featureToolbarQuick() {
    const toolbar = $('.lg-toolbar, .lg-problem-toolbar');
    if (!toolbar || toolbar.querySelector('.lg-quick-actions')) return;
    const acts = document.createElement('div');
    acts.className = 'lg-quick-actions';
    acts.innerHTML =
      '<button data-action="copy">' + svgIcon('copy', 14) + '<span>复制文本</span></button>' +
      '<button data-action="clear">' + svgIcon('x', 14) + '<span>清空输入</span></button>' +
      '<button data-action="word-count">' + svgIcon('book', 14) + '<span>字数统计</span></button>';
    toolbar.appendChild(acts);
    acts.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.action;
      const ta = $('textarea, .lg-editor textarea');
      if (!ta) return;
      const label = btn.querySelector('span');
      if (act === 'copy') {
        navigator.clipboard.writeText(ta.value).then(() => {
          label.textContent = '已复制';
          setTimeout(() => label.textContent = '复制文本', 1000);
        });
      } else if (act === 'clear') {
        if (confirm('确认清空？')) { ta.value = ''; ta.dispatchEvent(new Event('input')); }
      } else if (act === 'word-count') {
        const t = ta.value;
        toast('字符: ' + t.length + '  词: ' + t.split(/\s+/).filter((w) => w).length + '  行: ' + t.split('\n').length);
      }
    });
  }

  // 自动 O2
  function featureAutoO2() {
    if (!S.autoO2 || !location.pathname.startsWith('/problem/')) return;
    try {
      if (location.hash === '#ide' && !document.querySelector('[id=LCheck-4]')?.checked) document.querySelector('[for=LCheck-4]')?.click();
      else if (location.hash === '#submit' && !document.querySelector('[id=LCheck-5]')?.checked) document.querySelector('[for=LCheck-5]')?.click();
    } catch (e) {}
  }

  // 随机跳题
  function featureRandomProblem() {
    if (!S.problemRandom || !location.pathname.startsWith('/problem/list')) return;
    const toolbar = $('.lg-toolbar');
    if (!toolbar || toolbar.querySelector('.aml-random-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'aml-random-btn';
    btn.innerHTML = svgIcon('random', 14) + '<span>随机跳题</span>';
    btn.addEventListener('click', () => {
      const m = location.href.match(/page=(\d+)/);
      const np = Math.floor(Math.random() * 50) + 1;
      let nu = location.href.replace(/page=\d+/, 'page=' + np);
      if (nu === location.href) nu += (location.href.includes('?') ? '&' : '?') + 'page=' + np;
      location.href = nu;
    });
    toolbar.appendChild(btn);
  }

  // 用户搜索——复刻油猴脚本：无需授权，作为首页右侧边栏卡片
  function findCardByHeading(text) {
    const headers = $all('.l-card .header h3, .l-card h3, .lg-card h3, .l-card .header, .lg-article h2');
    for (const h of headers) {
      if ((h.textContent || '').trim().indexOf(text) !== -1) {
        return h.closest('.l-card, .lg-card, .lg-article') || h.parentElement;
      }
    }
    return null;
  }
  function featureUserSearch() {
    if (!S.userSearch || location.pathname !== '/') return;
    if ($('.lg-user-search-card')) return;
    // 定位右侧边栏（本站公告所在容器），把搜索卡片作为第一张卡片插入，与原生卡片融为一体
    const notice = findCardByHeading('本站公告');
    const sidebar = notice && notice.closest('.lg-right, .am-u-lg-3, .am-u-md-4');
    if (!sidebar) return;
    const c = document.createElement('div');
    c.className = 'lg-article lg-user-search-card';
    c.innerHTML =
      '<h2>用户搜索</h2>' +
      '<div class="am-input-group am-input-group-primary am-input-group-sm">' +
        '<input id="lg-user-search-input" type="text" class="am-form-field" placeholder="输入用户名或 UID">' +
      '</div>' +
      '<p><button id="lg-user-search-btn" class="am-btn am-btn-primary am-btn-sm">搜索</button></p>';
    sidebar.insertBefore(c, sidebar.firstElementChild);
    const doSearch = () => {
      const inp = document.getElementById('lg-user-search-input');
      if (!inp) return;
      const q = inp.value.trim();
      if (!q) return;
      // 用户搜索接口需要洛谷登录 cookie（__client_id），必须在同源 content script 中 fetch，
      // 浏览器会自动携带站点 cookie；走 background 代理会丢失 cookie 导致失败。
      fetch('https://www.luogu.com.cn/api/user/search?keyword=' + encodeURIComponent(q), {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.users && data.users.length > 0) location.href = 'https://www.luogu.com.cn/user/' + data.users[0].uid;
          else toast('未找到用户');
        })
        .catch(() => toast('搜索失败'));
    };
    document.getElementById('lg-user-search-btn').addEventListener('click', doSearch);
    document.getElementById('lg-user-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  }

  // 显示用户介绍
  let introFetching = false; // 防止 debRedo 反复触发时重复请求 API
  function featureUserIntro() {
    if (!S.showIntroduction || !location.pathname.match(/^\/user\/\d+$/)) return;
    const m = location.pathname.match(/^\/user\/(\d+)$/);
    if (!m) return;
    const uid = m[1];
    const main = $all('.main')[2];
    if (!main || main.querySelector('.aml-intro-card')) return;

    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // 仅把"可见"的已渲染介绍视为已显示：洛谷新版会把非本人/非管理的介绍隐藏（元素可能仍在
    // DOM 但不可见），若只按文本匹配会误判为"已显示"而不补全。可见用 getClientRects 判定。
    const isVisible = (el) => el.getClientRects().length > 0 &&
      (() => { const st = getComputedStyle(el); return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) !== 0; })();
    const alreadyShown = (text) => {
      if (!norm(text)) return false;
      let want = '';
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderMarkdown(text);
        want = norm(tmp.textContent);
      } catch (e) { return false; }
      if (!want) return false;
      return $all('.lfe-marked').some((el) => isVisible(el) && norm(el.textContent) === want);
    };

    const render = (text) => {
      if (main.querySelector('.aml-intro-card')) return;
      if (alreadyShown(text)) return; // 洛谷已在页面上显示该介绍，不再重复插入
      const card = document.createElement('div');
      card.className = 'l-card aml-intro-card';
      card.innerHTML =
        '<div class="header"><h3>个人介绍</h3></div>' +
        '<div class="lfe-marked-wrap"><div class="lfe-marked">' +
          (renderMarkdown(text) || '<em>这个家伙很懒，什么也没留下</em>') +
        '</div></div>';
      main.appendChild(card);
    };

    // 优先用页面内嵌上下文（#lentille-context）里的介绍
    let intro = '';
    try {
      const data = JSON.parse($('#lentille-context')?.innerHTML || '{}');
      if (data && data.data && data.data.user) intro = data.data.user.introduction || '';
    } catch (e) {}
    if (intro) { render(intro); return; }

    // 页面未提供介绍时，自动用官方接口兜底（带防重标志）
    if (introFetching) return;
    introFetching = true;
    fetch('https://www.luogu.com.cn/api/user/info/' + uid, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
      .then((res) => res.json())
      .then((json) => { if (json && json.user) render(json.user.introduction || ''); })
      .catch(() => {})
      .finally(() => { introFetching = false; });
  }

  // 任务计划增强
  function featureTaskRandom() {
    if (!S.extendTask || location.pathname !== '/') return;
    const tasks = $all('.tasklist-item');
    if (!tasks.length) return;
    const pids = [];
    tasks.forEach((task) => { const pid = task.getAttribute('data-pid'); if (pid) pids.push(pid); });
    if (!pids.length) return;
    const header = tasks[0].parentElement?.querySelector('h3');
    if (!header || header.querySelector('.aml-task-random')) return;
    const btn = document.createElement('button');
    btn.className = 'aml-task-random';
    btn.innerHTML = svgIcon('random', 14) + '<span>随机任务</span>';
    btn.addEventListener('click', () => {
      const pid = pids[Math.floor(Math.random() * pids.length)];
      if (pid) location.href = 'https://www.luogu.com.cn/problem/' + pid;
    });
    header.appendChild(btn);
  }

  // 缩写查询
  function featureNbnhhsh() {
    if (!S.nbnhhsh) return;
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        const text = window.getSelection().toString().trim();
        if (!text) return;
        xhr({
          url: 'https://lab.magiconch.com/api/nbnhhsh/guess',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ text })
        }).then((res) => {
          if (!res) { toast('查询失败'); return; }
          try {
            const data = JSON.parse(res.text);
            if (data && data.length) {
              const result = data[0].trans || data[0].inputting || ['无结果'];
              toast(text + ' → ' + result.join(', '));
            } else toast('未找到缩写含义');
          } catch (e) { toast('查询失败'); }
        });
      }
    });
  }

  // 无法查看的文章/剪贴板：从 Luogu Saver API 爬取内容并模仿洛谷原生卡片内联展示；
  // 仅当保存站也没有该内容时才回退到跳转保存站。
  // 学习收藏文章（用户指定，尽管大陆站可能可看，仍强制走保存站内联渲染以保证展示）
  const STUDY_ARTICLES = ['ayeqimo2', 'cko0xze6', 'zigyvs1b', '0dwa861f'];

  function featureSaveStation() {
    if (!S.saveStationJumper) return;
    const m = location.pathname.match(/^\/(article|paste)\/(\w+)\/?$/);
    if (!m) return;
    const kind = m[1];
    const id = m[2];
    // 幂等：已注入卡片，或本次会话已尝试过（避免 SPA 路由/观察器反复触发）
    const key = kind + ':' + id;
    if ($('.aml-saver-card') || document.body.dataset.amlSaverAttempt === key) return;
    // 统一判定：只要能正常查看（含学习文章），一律不干预；只有真区域受限/不存在才从保存站恢复
    if (saveStationViewable(kind)) return;
    document.body.dataset.amlSaverAttempt = key;
    saveStationInject(kind, id);
  }

  // 判定该文章/剪贴板在洛谷本地是否可查看。
  // 只认明确的“区域受限/内容不存在”固定提示句判定不可查看；
  // 普通正文提到 404/not found/无法查看 等词不会误伤（避免把能看的文章也强制转保存站）。
  function saveStationViewable(kind) {
    const errRe = /PasteBin\s*not\s*found|Unable\s+to\s+Serve\s+Content|cannot\s+serve|not\s+available\s+in\s+your\s+region|this\s+content\s+is\s+not\s+available|此内容.*不可用|内容无法查看|无法查看此内容|该内容.*不可用|不存在该|找不到该/i;
    const sel = kind === 'paste'
      ? '.paste-body, .lg-paste, .paste-content, [class*="paste-content"], .lfe-marked-wrap.marked'
      : '.article-content, .lg-article-content, .lg-article, [class*="article-content"], .lfe-marked-wrap.marked, .article-header-wrap';
    const container = $(sel);
    const hay = container ? ((container.textContent || '').replace(/\s+/g, ' ')) : '';
    // 1) 正文容器内出现明确的错误固定句 -> 不可查看
    if (errRe.test(hay)) return false;
    // 2) 正文容器有实质内容 -> 可查看
    if (container && hay.replace(/\s+/g, '').length >= 20) return true;
    // 3) 全页兜底：命中明确错误句判不可查看；否则视为可查看交给原生
    const text = ($('.main, main, .lfe-body') || document.body).textContent || '';
    return !errRe.test(text);
  }

  // ================== 洛谷整站外壳复刻（自包含） ==================
  // region：受限/不存在的文章/剪贴板错误页是纯裸页（无顶栏/左栏/底栏，也无 Luogu Vue 运行时）。
  // 洛谷的 columba/Vue 组件样式依赖 data-v 作用域与大量 SPA 结构，手拼 DOM 无法完全匹配，
  // 强行注入反而会破版。因此这里改用“自包含外壳”：结构用洛谷原生类名，配色/版式由
  // main.css 里的 `.aml-shell` 规则完整提供，不依赖任何洛谷 Vue 作用域 CSS —— 100% 可控不破版，
  // 观感与洛谷官网一致（顶栏 + 左栏 + 主区 + 底栏）。
  // 侧边栏图标（FontAwesome 内联 SVG，路径来自洛谷官网真实 DOM，不依赖图标字体）
  function lgSideIcon(icon) {
    const I = {
      house: 'M240 6.1c9.1-8.2 22.9-8.2 32 0l232 208c9.9 8.8 10.7 24 1.8 33.9s-24 10.7-33.9 1.8l-8-7.2 0 205.3c0 35.3-28.7 64-64 64l-288 0c-35.3 0-64-28.7-64-64l0-205.3-8 7.2c-9.9 8.8-25 8-33.9-1.8s-8-25 1.8-33.9L240 6.1zm16 50.1L96 199.7 96 448c0 8.8 7.2 16 16 16l48 0 0-104c0-39.8 32.2-72 72-72l48 0c39.8 0 72 32.2 72 72l0 104 48 0c8.8 0 16-7.2 16-16l0-248.3-160-143.4zM208 464l96 0 0-104c0-13.3-10.7-24-24-24l-48 0c-13.3 0-24 10.7-24 24l0 104z',
      book: 'M88 0C39.4 0 0 39.4 0 88L0 432c0 44.2 35.8 80 80 80l344 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-8 0 0-76.1C435.3 375 448 353 448 328l0-256c0-39.8-32.2-72-72-72L88 0zM368 400l0 64-288 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l288 0zM80 352c-11.4 0-22.2 2.4-32 6.7L48 88c0-22.1 17.9-40 40-40l288 0c13.3 0 24 10.7 24 24l0 256c0 13.3-10.7 24-24 24L80 352zm48-200c0 13.3 10.7 24 24 24l176 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-176 0c-13.3 0-24 10.7-24 24zm24 72c-13.3 0-24 10.7-24 24s10.7 24 24 24l176 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-176 0z',
      grad: 'M318.8 38.1C309 34.1 298.6 32 288 32s-21 2.1-30.8 6.1L14.8 137.9C5.8 141.6 0 150.3 0 160L0 456c0 13.3 10.7 24 24 24s24-10.7 24-24l0-260.2 48 19.8 0 168.5c0 53 86 96 192 96s192-43 192-96l0-168.5 81.2-33.4c9-3.7 14.8-12.4 14.8-22.1s-5.8-18.4-14.8-22.1L318.8 38.1zM144 384l0-148.7 113.2 46.6c9.8 4 20.2 6.1 30.8 6.1s21-2.1 30.8-6.1L432 235.3 432 384c0 .1 0 .1 0 .3s-.1 .4-.3 .9c-.4 .9-1.3 2.7-3.4 5.2-4.4 5.2-12.6 11.9-26 18.6-26.8 13.4-67.1 23-114.3 23s-87.5-9.7-114.3-23c-13.4-6.7-21.6-13.4-26-18.6-2.1-2.5-3-4.3-3.4-5.2-.2-.5-.3-.8-.3-.9s0-.2 0-.3zM87.2 160L275.5 82.5c4-1.6 8.2-2.5 12.5-2.5s8.5 .8 12.5 2.5L488.8 160 300.5 237.5c-4 1.6-8.2 2.5-12.5 2.5s-8.5-.8-12.5-2.5L87.2 160z',
      clip: 'M152 96l80 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-80 0c-13.3 0-24 10.7-24 24s10.7 24 24 24zm0 48c-37.1 0-67.6-28-71.6-64L64 80c-8.8 0-16 7.2-16 16l0 352c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-352c0-8.8-7.2-16-16-16l-16.4 0c-4 36-34.5 64-71.6 64l-80 0zM232 0c25 0 47 12.7 59.9 32L320 32c35.3 0 64 28.7 64 64l0 352c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l28.1 0C105 12.7 127 0 152 0l80 0zM171.2 193.1c8.2 6.7 9.5 18.8 2.8 27l-45.3 56c-3.7 4.5-9.2 7.1-15 7.1s-11.3-2.7-14.9-7.2L73.9 244.9c-6.6-8.3-5.3-20.4 3-27s20.4-5.3 27 3l10 12.5 30.3-37.5c6.7-8.2 18.8-9.5 27-2.8zM192 256c0-13.3 10.7-24 24-24l64 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-64 0c-13.3 0-24-10.7-24-24zm-16 96c0-13.3 10.7-24 24-24l80 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24zm-64-32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z',
      signal: 'M488 56c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 400c0 13.3 10.7 24 24 24s24-10.7 24-24l0-400zM360 128c-13.3 0-24 10.7-24 24l0 304c0 13.3 10.7 24 24 24s24-10.7 24-24l0-304c0-13.3-10.7-24-24-24zM280 248c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 208c0 13.3 10.7 24 24 24s24-10.7 24-24l0-208zM152 320c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zM48 384c-13.3 0-24 10.7-24 24l0 48c0 13.3 10.7 24 24 24s24-10.7 24-24l0-48c0-13.3-10.7-24-24-24z',
      comments: 'M76.2 258.7c6.1-15.2 4-32.6-5.6-45.9-14.5-20.1-22.6-43.7-22.6-68.8 0-66.8 60.5-128 144-128s144 61.2 144 128-60.5 128-144 128c-15.9 0-31.1-2.3-45.3-6.5-10.3-3.1-21.4-2.5-31.4 1.5l-50.4 20.2 11.4-28.5zM0 144c0 35.8 11.6 69.1 31.7 96.8L1.9 315.2c-1.3 3.2-1.9 6.6-1.9 10 0 14.8 12 26.8 26.8 26.8 3.4 0 6.8-.7 10-1.9l96.3-38.5c18.6 5.5 38.4 8.4 58.9 8.4 106 0 192-78.8 192-176S298-32 192-32 0 46.8 0 144zM384 512c20.6 0 40.3-3 58.9-8.4l96.3 38.5c3.2 1.3 6.6 1.9 10 1.9 14.8 0 26.8-12 26.8-26.8 0-3.4-.7-6.8-1.9-10l-29.7-74.4c20-27.8 31.7-61.1 31.7-96.8 0-82.4-61.7-151.5-145-170.7-1.6 16.3-5.1 31.9-10.1 46.9 63.9 14.8 107.2 67.3 107.2 123.9 0 25.1-8.1 48.7-22.6 68.8-9.6 13.3-11.7 30.6-5.6 45.9l11.4 28.5-50.4-20.2c-10-4-21.1-4.5-31.4-1.5-14.2 4.2-29.4 6.5-45.3 6.5-72.2 0-127.1-45.7-140.7-101.2-15.6 3.2-31.7 5-48.1 5.2 16.4 81.9 94.7 144 188.8 144z',
      news: 'M168 80c-13.3 0-24 10.7-24 24l0 304c0 8.4-1.4 16.5-4.1 24L440 432c13.3 0 24-10.7 24-24l0-304c0-13.3-10.7-24-24-24L168 80zM72 480c-39.8 0-72-32.2-72-72L0 112C0 98.7 10.7 88 24 88s24 10.7 24 24l0 296c0 13.3 10.7 24 24 24s24-10.7 24-24l0-304c0-39.8 32.2-72 72-72l272 0c39.8 0 72 32.2 72 72l0 304c0 39.8-32.2 72-72 72L72 480zM192 152c0-13.3 10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 48c0 13.3-10.7 24-24 24l-48 0c-13.3 0-24-10.7-24-24l0-48zm152 24l48 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-48 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zM216 256l176 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-176 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm0 80l176 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-176 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z'
    };
    const d = I[icon];
    if (!d) return '';
    return '<svg class="svg-inline--fa fa-' + icon + '" data-prefix="far" role="img" viewBox="0 0 512 512" aria-hidden="true"><path class="path" fill="currentColor" d="' + d + '"></path></svg>';
  }

  // 侧边栏分组数据
  const LG_SIDE_GROUPS = [
    ['主页 /', 'home'],
    ['题库 /problem/list', 'book'],
    ['网校 https://class.luogu.com.cn', 'grad'],
    ['训练题单 /training/list', 'clip'],
    ['比赛 /contest/list', 'signal'],
    ['讨论区 /discuss', 'comments'],
    ['文章广场 /article', 'news']
  ].map(function (raw) {
    const p = raw[0].lastIndexOf(' ');
    return { name: raw[0].slice(0, p), href: raw[0].slice(p + 1), icon: raw[1] };
  });
  const LG_SIDE_MORE = [
    ['图片上传', '/image'], ['云剪贴板', '/paste'], ['主题商店', '/theme/list'],
    ['咕值排名', '/ranking'], ['等级分排名', '/ranking/elo'], ['洛谷有题', 'https://ti.luogu.com.cn/'], ['工单/反馈', '/ticket']
  ];
  const LG_SIDE_LINK = [
    ['帮助中心', 'https://help.luogu.com.cn'], ['联系我们', 'https://help.luogu.com.cn/contact-us'],
    ['社区规则', 'https://help.luogu.com.cn/rules/community/'], ['陶片放逐', '/judgement'], ['管理名单', '/judgement/admins']
  ];
  function lgSidebarHtml() {
    let main = '<ul>';
    LG_SIDE_GROUPS.forEach(function (g) {
      main += '<li><a href="' + lgAbs(g.href) + '"><span class="aml-side-ic">' + lgSideIcon(g.icon) + '</span><span class="title">' + g.name + '</span></a></li>';
    });
    main += '</ul>';
    const minor = function (arr) {
      let s = '<div class="nav-group on-expand"><span class="group-title"><span class="title">' + (arr === 'more' ? '更多功能' : '相关链接') + '</span></span><ul>';
      (arr === 'more' ? LG_SIDE_MORE : LG_SIDE_LINK).forEach(function (x) {
        s += '<li><a href="' + lgAbs(x[1]) + '"><span class="title minor">' + x[0] + '</span></a></li>';
      });
      return s + '</ul></div>';
    };
    return '<div class="nav-group"><h2 style="display:none">导航</h2>' + main + '</div>' + minor('more') + minor('link');
  }

  function lgFooterHtml() {
    return '<footer class="aml-footer"><p>'
      + '<a target="_blank" href="https://help.luogu.com.cn/about-us">关于洛谷</a> · '
      + '<a target="_blank" href="https://help.luogu.com.cn/">帮助中心</a> · '
      + '<a target="_blank" href="https://help.luogu.com.cn/ula/luogu">用户协议</a> · '
      + '<a target="_blank" href="https://help.luogu.com.cn/contact-us">联系我们</a> · '
      + '<a target="_blank" href="' + lgAbs('/discuss?forum=miaomiaowu') + '">小黑屋</a> · '
      + '<a target="_blank" href="' + lgAbs('/judgement') + '">陶片放逐</a> · '
      + '<a target="_blank" href="https://help.luogu.com.cn/rules/community/">社区规则</a> · '
      + '<a target="_blank" href="https://beian.miit.gov.cn">沪ICP备18008322号</a></p>'
      + '<p class="copyright">在洛谷，享受 Coding 的欢乐 · © 2013-2026 洛谷. All rights reserved.</p>'
      + '</footer>';
  }

  // 用自包含的洛谷风格外壳整体覆盖裸错误页。结构类名沿用洛谷原生，
  // 版式/配色由 main.css 的 `.aml-shell` 完整提供（不依赖 Luogu Vue 作用域 CSS）。
  const LG_HOST = 'https://www.luogu.com.cn';
  function lgAbs(href) {
    // 裸页 <base> 指向 cdn 错误目录，相对链接会解析错位，统一补全为绝对地址
    return /^https?:/.test(href) ? href : LG_HOST + (href.charAt(0) === '/' ? href : '/' + href);
  }
  function buildLuoguFrame(card, kind) {
    const breadNav = kind === 'paste'
      ? '<a href="' + LG_HOST + '/paste" class="aml-bread">云剪贴板</a>'
      : '<a href="' + LG_HOST + '/article" class="aml-bread">文章广场</a>';
    const frame = document.createElement('div');
    frame.className = 'aml-shell';
    frame.id = 'app';
    frame.innerHTML =
      '<header class="aml-top"><div class="aml-top-in">'
      + '<a href="' + LG_HOST + '/" class="aml-logo" aria-label="洛谷"><img class="header-logo mini" src="https://fecdn.luogu.com.cn/columba/static.325908fec383795b.logo-single-color.svg" alt="洛谷"></a>'
      + breadNav
      + '</div>'
      + '<div class="aml-user"><a href="' + LG_HOST + '/auth/login" class="aml-text">登录</a>'
      + '<a href="' + LG_HOST + '/auth/register" class="aml-text">注册</a></div>'
      + '</header>'
      + '<div class="aml-main">'
      + '<nav class="aml-side">' + lgSidebarHtml() + '</nav>'
      + '<main class="aml-content"><div class="aml-shell-body"></div></main>'
      + '</div>'
      + lgFooterHtml();
    const b = document.body;
    b.innerHTML = '';
    b.appendChild(frame);
    frame.querySelector('.aml-shell-body').appendChild(card);
  }

  // 从保存站 API 爬取并内联渲染
  function saveStationInject(kind, id) {
    const card = document.createElement('div');
    card.className = 'aml-saver-card l-card';
    card.innerHTML = '<div class="aml-saver-load"><span class="aml-spin"></span>正在从保存站加载' +
      (kind === 'paste' ? '剪贴板' : '文章') + '…</div>';
    // 区域受限错误页（服务端渲染的 /article、/paste 错误 HTML，无 Vue #app）：
    // 洛谷原生上边栏/侧边栏/底栏均为 SSR 渲染且保留不动，观感与官网完全一致；
    // 只需把原生 <main> 里那段“出错啦 / …not found”错误正文换成保存站恢复的内容，
    // 不再用 fixed 覆盖层，避免遮蔽官方框架。
    const errPage = /PasteBin\s*not\s*found|Unable\s+to\s+Serve\s+Content|cannot\s+serve|not\s+available\s+in\s+your\s+region|this\s+content\s+is\s+not\s+available|此内容.*不可用|内容无法查看|无法查看此内容/i
      .test((document.body.innerText || '').slice(0, 30000));
    const nativeMain = document.querySelector('main');
    if (errPage && nativeMain) {
      // SSR 受限错误页：洛谷原生上边栏/侧边栏/底栏已由 SSR 渲染并保留，
      // 只需把原生 <main> 里的错误正文替换为保存站恢复的内容，观感与官网完全一致。
      card.classList.add('aml-inline-native');
      nativeMain.innerHTML = '';
      nativeMain.appendChild(card);
    } else {
      // 裸错误页（无 <main> / 无原生框架）：直接整体覆盖为复刻的洛谷完整外壳，
      // 包含上边栏、侧边栏、主内容区、底栏，观感与官网原生页面一致。
      buildLuoguFrame(card, kind);
    }
    const label = kind === 'paste' ? '剪贴板' : '文章';
    console.log('[XE-Luogu v' + chrome.runtime.getManifest().version + '] 检测到无法查看的' + label + '（区域受限/已删除），正在从保存站恢复: ' + id);
    xhr({ url: 'https://api.luogu.me/' + kind + '/query/' + id, method: 'GET', headers: { 'User-Agent': 'Uptime-Kuma' } }).then((res) => {
      let data = null;
      try {
        const obj = JSON.parse((res && res.text) || '{}');
        if (obj && obj.code === 200 && obj.data) data = obj.data;
      } catch (e) {}
      if (data) {
        renderSaverCard(card, kind, id, data);
        toast('已从保存站恢复' + label);
      } else {
        // API 不可达时不自动跳转（避免加载中被拽到保存站），改为卡片内提示 + 手动链接
        fallbackSaverRedirect(card, kind, id);
      }
    });
  }

  // 用保存站数据拼装洛谷风格的卡片，结构与洛谷原生保持一致：
  //  - 剪贴板页复刻原生满容器卡片：.full-container > .card.padding-default > .content-card-top + hr + .marked
  //  - 文章页复刻新 columba：.article-banner > .banner-content(> .title/.meta) + .article-content > .lfe-marked-wrap
  // 对照官站真实 DOM，携带相同的 data-v 作用域属性，使洛谷自身已加载的 CSS 可按原生样式渲染。
  // 注入 KaTeX（与 luogu.me 前端同一引擎）渲染正文里 $...$ / $$...$$ / \(...\) / \[...\] 公式。
  // 受页面 CSP 影响无法加载外部脚本时自动回退到自研 renderLatexBody；KaTeX 样式表也会一并注入。
  let amlKatexCssInjected = false;
  function ensureKaTeXLib() {
    if (!amlKatexCssInjected) {
      amlKatexCssInjected = true;
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
      (document.head || document.body).appendChild(l);
    }
    const need = [];
    if (!window.katex) need.push('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js');
    if (!window.renderMathInElement) need.push('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js');
    if (!need.length) return Promise.resolve(true);
    return Promise.all(need.map((src) => new Promise((res) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res(true);
      s.onerror = () => res(false);
      (document.head || document.body).appendChild(s);
    }))).then(() => !!(window.katex && window.renderMathInElement));
  }
  function latexRenderShell(card) {
    if (!S.latexRendering) return;
    ensureKaTeXLib().then((ok) => {
      if (!ok) { try { featureBenbenLatex(); } catch (e) {} return; }
      try {
        card.dataset.amlKatex = '1'; // 屏蔽调度器里全局跑的 featureBenbenLatex，避免二次转换
        card.querySelectorAll('.lfe-marked').forEach((el) => {
          if (window.renderMathInElement) window.renderMathInElement(el, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
              { left: '$', right: '$', display: false }
            ],
            throwOnError: false
          });
        });
      } catch (e) { try { featureBenbenLatex(); } catch (e2) {} }
    });
  }

  function renderSaverCard(card, kind, id, d) {
    const bodyHtml = d.renderedContent || renderMarkdown(d.content || '');
    const author = d.author;
    const authorName = author && author.name ? escapeHtml(author.name) : '';
    const when = d.createdAt
      ? new Date(d.createdAt).toLocaleString('zh-CN', { dateStyle: 'long' })
      : '未知时间';
    const vern = DISPLAY_VERSION;
    const srcBadge = '<span class="aml-src-badge">已由 XE-Luogu(氙-Luogu) XLG ' + vern + ' 从保存站恢复</span>';
    // 发表时间完整格式 YYYY-MM-DD HH:mm
    const publishAt = d.createdAt ? (function (t) {
      const x = new Date(t);
      if (isNaN(x)) return '未知时间';
      const p = (n) => String(n).padStart(2, '0');
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()) + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
    })(d.createdAt) : '未知时间';

    let h;
    if (kind === 'paste') {
      // 云剪贴板页：顶部面包屑(洛谷 / 云剪贴板)+标题，作者/公开、发表时间，再正文
      h = '<div class="full-container" data-v-6febb0e8>' +
        '<div class="view-card-wrap">' +
        '<div class="card padding-default">' +
        '<div class="aml-paste-head">' +
        '<div class="aml-paste-crumb"><a href="' + LG_HOST + '/">洛谷</a><span class="aml-crumb-sep"> / </span><span>云剪贴板</span></div>' +
        '<h1 class="aml-paste-title">云剪贴板</h1>' +
        '</div>' +
        '<div class="content-card-top" data-v-39573478>' +
        '<div class="author" data-v-39573478>' +
        '<div class="lfe-caption author-margin" data-v-39573478>作者: ' + (authorName || '未知') + '</div>' +
        '<div class="lfe-caption" data-v-39573478>公开</div>' +
        '</div>' +
        '<div class="actions" data-v-39573478>' + srcBadge + '</div>' +
        '</div>' +
        '<div class="aml-paste-time">发表时间: ' + publishAt + '</div>' +
        '<hr class="horizon" data-v-39573478>' +
        '<div class="marked" data-v-39573478><div class="lfe-marked">' + bodyHtml + '</div></div>' +
        '<div class="aml-paste-src">' + srcBadge + '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    } else {
      // 原生 columba 文章页结构（对照 real .main.lcolor-bg-background.main）
      const title = d.title || id;
      h = '<div class="article-banner columba-content-wrap wrapper" data-v-fc349d1c>' +
        '<div class="banner-content" data-v-71eca628>' +
        '<h1 class="title" data-v-71eca628>' + escapeHtml(title) + '</h1>' +
        '<div class="meta" data-v-71eca628>' +
        (authorName
          ? '<div class="author" data-v-71eca628>' +
            '<img class="avatar" alt="avatar" referrerpolicy="no-referrer" data-v-71eca628' +
            ' src="' + ((author.avatar || '').replace(/^\/\//, 'https://')) + '">' +
            '<div class="user" data-v-71eca628>' +
            '<div class="label" data-v-71eca628>作者</div>' +
            '<div class="luogu-username user-name" data-v-71eca628>' + authorName + '</div>' +
            '</div></div>'
          : '') +
        '<div class="metas" data-v-71eca628>' +
        '<div data-v-71eca628>' +
        '<div class="label" data-v-71eca628>发表于</div>' +
        '<time data-v-71eca628>' + when + '</time>' +
        '</div>' +
        '<div data-v-71eca628>' +
        '<div class="label" data-v-71eca628>来源</div>' +
        '<div data-v-71eca628>保存站恢复</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="columba-content-wrap wrapper" data-v-fc349d1c>' +
        '<div class="article-content columba-content-wrap wrapper" data-v-fc349d1c>' +
        '<div class="aml-src-badge-row">' + srcBadge + '</div>' +
        '<div class="lfe-marked-wrap marked" data-v-fc349d1c><div class="lfe-marked">' +
        bodyHtml + '</div></div>' +
        '<div class="update-info lfe-caption">已由 XE-Luogu(氙-Luogu) XLG ' + vern + ' 从保存站恢复 · 数据仅本地</div>' +
        '</div>' +
        '</div>';
    }
    card.innerHTML = h;
    // 补做正文中的表情/公式渲染
    try { featureEmoji(); } catch (e) {}
    try { featureBenbenLatex(); } catch (e) {}
  }

  // 保存站 API 不可达时，在原卡片内展示失败提示并提供手动跳转链接，不再自动 location.replace
  // （否则加载过程中会莫名被直接转入保存站）。
  function fallbackSaverRedirect(card, kind, id) {
    const label = kind === 'paste' ? '剪贴板' : '文章';
    const newUrl = (S.useLuoguMe ? 'https://www.luogu.me' : 'https://luogu.amlg.top') + '/' + kind + '/' + id;
    // 复刻洛谷原生 loading/失败样式，保持与错误页所在卡片同构
    if (card && card.querySelector) {
      card.classList.add('aml-inline-native');
      card.innerHTML =
        '<div class="aml-saver-fail">' +
        '<div class="aml-saver-fail-icon">!</div>' +
        '<div class="aml-saver-fail-title">暂时无法从保存站加载' + label + '</div>' +
        '<div class="aml-saver-fail-desc">数据源暂时不可用，可尝试前往保存站手动查看。</div>' +
        '<a class="aml-saver-fail-btn am-u-btn" href="' + newUrl + '" target="_blank" rel="noopener">前往保存站查看</a>' +
        '</div>';
      return;
    }
    // 兜底：没有卡片容器时退化为原样跳转（极少发生）
    location.href = newUrl;
  }

  // 报名解锁
  function featureButtonUnlocker() {
    if (!S.buttonUnlocker) return;
    // 洛谷报名确认弹窗（swal2）的倒计时按钮原先用 disabled 属性禁用，现已改用属性/类名/
    // pointer-events 等多种方式。旧实现只找 button.swal2-confirm[disabled]，失效。
    // 这里直接在弹窗内按“报名+倒计时”文案识别按钮，尽力解除各种禁用形态：
    const unlock = () => {
      const pop = $('.swal2-popup');
      if (!pop) return;
      // 仅处理报名类确认弹窗，避免误伤其它 swal2 确认框
      if (!/报名|参赛|参加比赛/.test(pop.textContent || '')) return;
      pop.querySelectorAll('.swal2-confirm, button, a').forEach((btn) => {
        const t = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        // 命中报名倒计时文案：报名 (5s) / 报名(5秒) / 报名：00:05 / 报名 05 秒 等
        const counting = /^报名\s*[（(【\[]?\s*[\d:：]/.test(t) ||
          /报名\s*(\d+\s*[秒s]|[\d:：]{2,})/.test(t);
        if (!counting) return;
        // 1) 属性 / property
        if (btn.disabled || btn.hasAttribute('disabled')) {
          btn.disabled = false;
          btn.removeAttribute('disabled');
        }
        // 2) 类名禁用
        btn.classList.remove('swal2-disabled', 'disabled', 'is-disabled', 'is-forbidden', 'btn-disabled');
        // 3) pointer-events / 样式禁用
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '';
        btn.style.userSelect = 'auto';
        const wr = btn.closest('.swal2-actions') || btn.parentElement;
        if (wr) wr.style.pointerEvents = 'auto';
        // 4) 覆盖回「报名」，抵消倒计时在按钮上的渲染
        if (btn.textContent !== '报名') btn.textContent = '报名';
      });
    };
    new MutationObserver(unlock).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['disabled', 'class', 'style']
    });
    setInterval(unlock, 400);
  }

  // 私信 Markdown
  function featureChatMarkdown() {
    if (!S.chatMarkdown || !location.pathname.startsWith('/chat')) return;
    // 收集私信原始文本，把 <img> 转回 ![alt](src) 以便渲染时恢复图片（避免 el.textContent 丢失图片）
    function msgToRaw(el) {
      let s = '';
      el.childNodes.forEach((node) => {
        if (node.nodeType === 3) s += node.textContent;
        else if (node.nodeType === 1) {
          if (node.tagName === 'IMG') {
            const src = node.getAttribute('src') || '';
            const alt = node.getAttribute('alt') || '';
            s += '![' + alt + '](' + src + ')';
          } else if (node.tagName === 'BR') s += '\n';
          else s += node.textContent;
        }
      });
      return s;
    }
    function render(el) {
      if (el.classList.contains('aml-md-rendered')) return;
      const raw = msgToRaw(el).trim();
      if (!raw || !/[#*`_>\-\[\]\(\)]/.test(raw)) return;
      const wrap = document.createElement('div');
      wrap.className = 'aml-md-message';
      // 仅当包含块级 Markdown（代码块/缩进代码/标题/列表/引用/表格）时才加背景框，纯行内格式不加
      if (/```|^\s{4}|\t|^#{1,6}\s|^>\s?|^\s*[*\-]\s+|^\s*\d+\.\s+|^\s*\|/.test(raw)) {
        wrap.classList.add('aml-md-block');
      }
      wrap.innerHTML = renderMarkdown(raw);
      el.innerHTML = '';
      el.appendChild(wrap);
      el.classList.add('aml-md-rendered');
    }
    function processAll() {
      $all('.message:not(.aml-md-rendered)').forEach((msg) => { if (!msg.closest('.lfe-caption')) render(msg); });
    }
    const obs = new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.classList && node.classList.contains('message')) render(node);
          else node.querySelectorAll && node.querySelectorAll('.message').forEach(render);
        }
      }));
    });
    const container = $('.chat-container');
    if (container) obs.observe(container, { childList: true, subtree: true });
    setTimeout(processAll, 500);
    setInterval(processAll, 3000);
  }

  // 讨论区复制（按楼层复制为 Markdown）
  function featureDiscussCopy() {
    if (!S.discussCopy || !location.pathname.startsWith('/discuss/')) return;
    const contents = $all('.lfe-marked-wrap.marked, .lfe-marked');
    contents.forEach((content) => {
      const parent = content.closest('.l-card, .comment') || content.parentElement;
      if (parent.dataset.copyProcessed) return;
      if (!content.textContent.trim()) return;
      const toolbar = content.closest('.l-card')?.querySelector('.row.row-space-between, .action, .l-card-footer, .comment .action');
      if (!toolbar) return;
      const btn = document.createElement('button');
      btn.className = 'lg-copy-discuss-btn';
      btn.innerHTML = svgIcon('copyMd', 14) + '<span>复制内容</span>';
      btn.title = '复制该楼层内容为 Markdown';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const span = btn.querySelector('span');
        const md = htmlToMd(content);
        if (!md) { toast('无可复制内容'); return; }
        const done = () => {
          span.textContent = '已复制'; btn.classList.add('copied');
          setTimeout(() => { span.textContent = '复制内容'; btn.classList.remove('copied'); }, 2000);
        };
        navigator.clipboard.writeText(md).then(done).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = md; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch (err) { toast('复制失败'); }
          document.body.removeChild(ta);
        });
      });
      toolbar.appendChild(btn);
      parent.dataset.copyProcessed = 'true';
    });
  }

  // 表情渲染：将 /code 形式的 QQ 表情代码替换为真实 QQ 表情图片。
  // 默认使用自部署的 QQ 表情镜像 qqemoji.pages.dev/<code>.gif（洛谷社区普遍采用），
  // 个别镜像缺失的代码（如 bx 拜）单独指定真实图片；图片加载失败时回退为原始 /code 文本，避免破图。
  function featureEmoji() {
    if (!S.emojiRendering) return;
    const BASE = 'https://qqemoji.pages.dev/';
    const OVERRIDE = {
      bx: 'https://q.qqbiaoqing.com/q/2013/06/19/0ab65b7c989272944bbbf34f746521ff.gif'
    };
    // 常见洛谷 QQ 表情代码集合（均在 qqemoji.pages.dev 上有对应图片）
    const CODES = [
      'aini','aiq','am','azgc','baiy','bx','ch','cengyiceng','cy','dan','db','dg','dgg',
      'dk','dl','dy','dz','ee','fad','fan','fd','fendou','gg','hanx','hb','hc','hd','hec',
      'hn','hq','hsh','ht','huaix','hx','jh','jy','kk','kel','ll','lh','mg','px','qd',
      'qiang','qq','ruo','se','shl','tp','ts','tx','wl','wq','wul','xia','xin','xyx',
      'yiw','youl','yun','kuk',
    ];
    CODES.sort((a, b) => b.length - a.length);
    const re = new RegExp('/(?:' + CODES.join('|') + ')(?![A-Za-z0-9])', 'g');

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent) return;
      // 跳过代码/输入等区域，避免在代码块与编辑框里插入图片
      if (parent.closest('code, pre, samp, kbd, textarea, script, style, [contenteditable="true"]')) return;
      const text = node.textContent;
      if (!text.includes('/')) return;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m, replaced = false;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const code = m[0].slice(1);
        const img = document.createElement('img');
        img.className = 'aml-qqemoji';
        img.src = OVERRIDE[code] || BASE + code + '.gif';
        img.alt = m[0];
        img.loading = 'lazy';
        img.onerror = () => { const t = document.createTextNode(m[0]); if (img.parentNode) img.parentNode.replaceChild(t, img); };
        frag.appendChild(img);
        replaced = true;
        last = m.index + m[0].length;
      }
      if (!replaced) return;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      parent.replaceChild(frag, node);
    });
  }

  // ============ 犇犇 LaTeX 自包含渲染 ============
  // 洛谷页面 CSP 限制，无法通过外链加载 KaTeX/MathJax，故内置轻量 LaTeX→HTML 渲染器，
  // 覆盖犇犇/评论区常见公式：上下标、分数、根号、求和/积分/极限上下限、希腊字母与常用运算符。
  function renderLatexBody(src) {
    let i = 0;
    const tex = src;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const skipSpace = () => { while (i < tex.length && /\s/.test(tex[i])) i++; };
    const greek = { alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', zeta:'ζ', eta:'η', theta:'θ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν', xi:'ξ', pi:'π', rho:'ρ', sigma:'σ', tau:'τ', upsilon:'υ', phi:'φ', chi:'χ', psi:'ψ', omega:'ω', Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π', Sigma:'Σ', Phi:'Φ', Psi:'Ψ', Omega:'Ω' };
    const ops = { times:'×', cdot:'·', cdots:'⋯', ldots:'…', dots:'…', div:'÷', pm:'±', mp:'∓', leq:'≤', le:'≤', geq:'≥', ge:'≥', neq:'≠', ne:'≠', approx:'≈', sim:'∼', equiv:'≡', in:'∈', notin:'∉', ni:'∋', subset:'⊂', supset:'⊃', subseteq:'⊆', supseteq:'⊇', cup:'∪', cap:'∩', setminus:'∖', emptyset:'∅', forall:'∀', exists:'∃', nexists:'∄', neg:'¬', land:'∧', lor:'∨', infty:'∞', prime:'′', degree:'°', circ:'∘', bullet:'•', square:'□', triangle:'△', langle:'⟨', rangle:'⟩', vert:'|', parallel:'∥', perp:'⊥', angle:'∠', propto:'∝', partial:'∂', nabla:'∇', therefore:'∴', because:'∵', iff:'⟺', implies:'⟹', to:'→', rightarrow:'→', leftarrow:'←', get:'←', uparrow:'↑', downarrow:'↓', sum:'∑', prod:'∏', int:'∫', oint:'∮', bigcup:'⋃', bigcap:'⋂', circlearrowleft:'↺', circlearrowright:'↻', looparrowleft:'↫', hookrightarrow:'↪', hookleftarrow:'↩' };
    const sizes = { tiny:0.6, scriptsize:0.7, footnotesize:0.8, small:0.85, normalsize:1, large:1.22, Large:1.44, LARGE:1.7, huge:2.2, Huge:2.7 };
    const parseGroup = () => {
      skipSpace();
      if (tex[i] === '{') { i++; const h = parseExpr('}'); skipSpace(); if (tex[i] === '}') i++; return h; }
      if (i >= tex.length) return '';
      const ch = tex[i];
      if (ch === '\\') { i++; return parseCommand(); }
      i++;
      return esc(ch);
    };
    const parseExpr = (stop) => {
      let html = '';
      let color = null;   // \color{..} 声明，作用于当前组后续内容
      let size = null;    // 字号声明
      while (i < tex.length) {
        const ch = tex[i];
        if (stop && ch === stop) break;
        if (ch === '\\') {
          i++; // 现在 i 指向命令名的首字母（或非字母字符）
          // 只读探查命令名，避免误判声明类命令
          let dname = '';
          let k = i;
          while (k < tex.length && /[a-zA-Z]/.test(tex[k])) { dname += tex[k]; k++; }
          if (Object.prototype.hasOwnProperty.call(sizes, dname)) { i += dname.length; size = dname; continue; }
          if (dname === 'color') {
            i += dname.length; skipSpace();
            let cv = ''; if (tex[i] === '{') { i++; cv = parseExpr('}'); }
            color = cv; continue;
          }
          if (dname === 'textcolor') {
            i += dname.length; skipSpace();
            let cv = ''; if (tex[i] === '{') { i++; cv = parseExpr('}'); }
            html += '<span style="color:' + cv + '">' + parseGroup() + '</span>'; continue;
          }
          html += parseCommand(); continue;
        }
        if (ch === '{') { i++; html += parseExpr('}'); skipSpace(); if (tex[i] === '}') i++; continue; }
        if (ch === '}') break;
        if (ch === '_') { i++; html += '<sub>' + parseGroup() + '</sub>'; continue; }
        if (ch === '^') { i++; html += '<sup>' + parseGroup() + '</sup>'; continue; }
        html += esc(ch); i++;
      }
      if (stop && tex[i] === stop) i++;
      if (size) html = '<span style="font-size:' + sizes[size] + 'em">' + html + '</span>';
      if (color) html = '<span style="color:' + color + '">' + html + '</span>';
      return html;
    };
    const parseCommand = () => {
      let name = '';
      while (i < tex.length && /[a-zA-Z]/.test(tex[i])) name += tex[i++];
      if (!name) {
        const c = tex[i];
        if (c === ' ') { i++; return '&nbsp;'; }
        if (c !== undefined) { i++; return esc(c); }
        return '';
      }
      if (name === 'frac') {
        const n = parseGroup(); const d = parseGroup();
        return '<span class="aml-frac"><span class="num">' + n + '</span><span class="den">' + d + '</span></span>';
      }
      if (name === 'sqrt') {
        let rot = ''; skipSpace();
        if (tex[i] === '[') { i++; skipSpace(); rot = parseExpr(']'); if (tex[i] === ']') i++; skipSpace(); }
        const rd = parseGroup();
        return '<span class="aml-sqrt"><span class="rad">√</span>' + (rot ? '<span class="rot">' + rot + '</span>' : '') + '<span class="rd">' + rd + '</span></span>';
      }
      // 文本样式命令：\textrm \textit \textbf \textsf \texttt \textmd \mathrm \operatorname 等
      if (name === 'textrm' || name === 'textit' || name === 'textbf' || name === 'textsf' ||
          name === 'texttt' || name === 'textmd' || name === 'text' || name === 'textnormal' ||
          name === 'mathrm' || name === 'operatorname') {
        const cls = { textrm:'aml-trm', textit:'aml-tit', textbf:'aml-tbf', textsf:'aml-tsf',
                      texttt:'aml-ttt', textmd:'aml-tmd', text:'aml-trm', textnormal:'aml-trm',
                      mathrm:'aml-trm', operatorname:'aml-top' }[name] || 'aml-trm';
        return '<span class="' + cls + '">' + parseGroup() + '</span>';
      }
      if (name === 'cancel') return '<span class="aml-cancel">' + parseGroup() + '</span>';
      if (name === 'left' || name === 'right') {
        const c = tex[i];
        if (c !== undefined && '()[]|{}.'.indexOf(c) !== -1) { i++; return c === '.' ? '' : esc(c); }
        return '';
      }
      if (name === 'quad' || name === 'qquad') return '&nbsp;&nbsp;&nbsp;&nbsp;';
      if (name === ',' || name === ';' || name === '!' || name === ':') return '&nbsp;';
      if (name === '\\' || name === 'newline') return '<br>';
      if (Object.prototype.hasOwnProperty.call(greek, name)) return '<span class="aml-text">' + greek[name] + '</span>';
      if (name === 'sum' || name === 'prod' || name === 'int' || name === 'oint' ||
          name === 'lim' || name === 'max' || name === 'min' || name === 'sup') {
        const isOp = name === 'sum' || name === 'prod' || name === 'int' || name === 'oint';
        const base = isOp ? '<span class="aml-sym">' + esc(ops[name] || '') + '</span>' : '<span class="aml-text op">' + name + '</span>';
        let sub = '', sup = ''; skipSpace();
        if (tex[i] === '_') { i++; sub = parseGroup(); skipSpace(); }
        if (tex[i] === '^') { i++; sup = parseGroup(); skipSpace(); }
        return '<span class="aml-lim">' + base + (sub ? '<span class="sub">' + sub + '</span>' : '') + (sup ? '<span class="sup">' + sup + '</span>' : '') + '</span>';
      }
      if (Object.prototype.hasOwnProperty.call(ops, name)) return '<span class="aml-sym">' + esc(ops[name]) + '</span>';
      if (/^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|lg|exp|det|ker)$/.test(name)) return '<span class="aml-text op">' + name + '</span>';
      return '<span class="aml-text">' + esc(name) + '</span>';
    };
    return parseExpr('');
  }

  // 将正文里的 $...$ / $$...$$ 替换为渲染后的公式
  function featureBenbenLatex() {
    if (!S.latexRendering) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent) return;
      if (parent.closest('code, pre, samp, kbd, textarea, script, style, .aml-math, .katex, [contenteditable="true"]')) return;
      const text = node.textContent;
      if (!text.includes('$')) return;
      const frag = document.createDocumentFragment();
      let last = 0, i = 0, replaced = false;
      while (i < text.length) {
        if (text[i] === '$') {
          const display = text[i + 1] === '$';
          const delim = display ? 2 : 1;
          const open = i + delim;
          const close = display ? text.indexOf('$$', open) : text.indexOf('$', open);
          if (close !== -1 && open < close) {
            const body = text.slice(open, close).trim();
            if (body) {
              if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
              i = close + delim;
              const span = document.createElement('span');
              span.className = 'aml-math' + (display ? ' aml-math-display' : '');
              span.innerHTML = renderLatexBody(body);
              frag.appendChild(span);
              last = i;
              replaced = true;
              continue;
            }
          }
        }
        i++;
      }
      if (!replaced) return;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      parent.replaceChild(frag, node);
    });
  }

  // 复制 Markdown——仅在题目/讨论/博客页显示按钮，并给出更可靠的 HTML→Markdown 转换。
  // 依据洛谷 Markdown 格式手册（https://help.luogu.com.cn/rules/academic/handbook/markdown）与
  // LaTeX 手册（.../handbook/latex）还原：代码块围栏+语言、表格管道+对齐行、嵌套列表/引用层级、
  // 行内换行（行末双空格）、任务列表勾选、以及 KaTeX 公式还原为 $…$/$$…$$。
  function htmlToMd(root) {
    let md = '';
    const textOf = (el) => (el.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    const linesOf = (el) => (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\n+$/g, '');
    // 行内元素 → Markdown
    function inline(el) {
      if (el.nodeType === 3) return el.textContent.replace(/\u00a0/g, ' ');
      if (el.nodeType !== 1) return '';
      const tag = el.tagName;
      if (tag === 'BR') return '  \n';            // 洛谷：行末两个空格 = 紧凑换行
      // KaTeX 公式：提取 annotation 原始 TeX，包成 $…$/$$…$$ 完整还原
      if (tag === 'SPAN' && el.classList && (el.classList.contains('katex') || el.classList.contains('katex-display'))) {
        const ann = el.querySelector('annotation[encoding="application/x-tex"]');
        const tex = ann && ann.textContent != null ? String(ann.textContent).trim() : '';
        if (tex) {
          const d = el.classList.contains('katex-display') ||
            (el.parentElement && el.parentElement.classList && el.parentElement.classList.contains('katex-display'));
          return d ? '$$' + tex + '$$' : '$' + tex + '$';
        }
      }
      if (tag === 'CODE') return '`' + textOf(el) + '`';
      if (tag === 'STRONG' || tag === 'B') return '**' + inlineInner(el) + '**';
      if (tag === 'EM' || tag === 'I') return '*' + inlineInner(el) + '*';
      if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return '~~' + inlineInner(el) + '~~';
      if (tag === 'SUB') return '_' + inlineInner(el) + '_';
      if (tag === 'SUP') return '^' + inlineInner(el) + '^';
      if (tag === 'IMG') {
        const src = el.getAttribute('src');
        return src ? '![' + (el.getAttribute('alt') || '') + '](' + src + ')' : '';
      }
      if (tag === 'A') {
        const href = el.getAttribute('href');
        const t = inlineInner(el);
        return href ? '[' + t + '](' + href + ')' : t;
      }
      return inlineInner(el);
    }
    function inlineInner(el) {
      let out = '';
      for (const c of el.childNodes) out += inline(c);
      return out;
    }
    // 代码块：还原围栏 + 语言
    function blockCode(pre) {
      let lang = '';
      const codeEl = pre.querySelector('code');
      if (codeEl) {
        const m = String(codeEl.className || '').match(/language-([\w+#]+)/i);
        if (m) lang = m[1];
        else { const d = codeEl.getAttribute && codeEl.getAttribute('data-lang'); if (d) lang = d; }
      }
      const code = linesOf(codeEl || pre);
      return '\n\n```' + lang + '\n' + code + '\n```\n\n';
    }
    // 列表（含嵌套/任务列表）
    function walkList(list, depth) {
      const ordered = list.tagName === 'OL';
      const indent = '  '.repeat(depth);
      let out = '';
      for (const li of Array.from(list.children).filter((c) => c.tagName === 'LI')) {
        let text = '';
        const box = li.querySelector('input[type="checkbox"]');
        const subs = [];
        for (const c of li.childNodes) {
          if (c.nodeType === 3) { text += c.textContent.replace(/\u00a0/g, ' '); continue; }
          if (c.nodeType !== 1) continue;
          const t = c.tagName;
          if (t === 'UL' || t === 'OL') { subs.push(c); continue; }
          if (t === 'BR') { text += '  \n' + indent + '  '; continue; }
          if (t === 'PRE') { text += '\n' + indent + '  ' + blockCode(c).trim().replace(/\n/g, '\n' + indent + '  '); continue; }
          if (t === 'BLOCKQUOTE') { text += '\n' + indent + quoteMd(c, depth + 1); continue; }
          if (/^H[1-6]$/.test(t)) { text += '\n' + indent + '#'.repeat(parseInt(t[1], 10)) + ' '; continue; }
          if (t === 'P' || t === 'DIV') { text += inline(c); continue; }
          text += inline(c);
        }
        if (box) text = (box.checked ? '[x] ' : '[ ] ') + text;
        out += '\n' + indent + (ordered ? '1. ' : '- ') + text.replace(/\s+$/, '');
        for (const sub of subs) out += walkList(sub, depth + 1);
      }
      return out;
    }
    // 区块引用（保留嵌套层级）
    function quoteMd(bq, depth) {
      const pref = '>'.repeat(depth) + ' ';
      let out = '';
      for (const child of bq.childNodes) {
        if (child.nodeType === 3) { out += child.textContent.replace(/\u00a0/g, ' '); continue; }
        if (child.nodeType !== 1) continue;
        const t = child.tagName;
        if (t === 'BR') { out += '\n' + pref; continue; }
        if (t === 'BLOCKQUOTE') { out += '\n' + pref + quoteMd(child, depth + 1); continue; }
        if (t === 'UL' || t === 'OL') { out += '\n' + pref + walkList(child, depth); continue; }
        if (t === 'PRE') { out += '\n' + pref + blockCode(child).replace(/\n/g, '\n' + pref); continue; }
        if (t === 'P') { out += '\n' + pref + inline(child); continue; }
        if (/^H[1-6]$/.test(t)) { out += '\n' + pref + '#'.repeat(parseInt(t[1], 10)) + ' ' + inline(child); continue; }
        if (t === 'DIV' || t === 'SPAN') { out += inline(child); continue; }
        out += inline(child);
      }
      return out;
    }
    // 表格：还原管道分割 + 对齐行
    function tableMd(tbl) {
      const rows = Array.from(tbl.querySelectorAll('tr'));
      if (!rows.length) return '';
      const lines = [];
      rows.forEach((tr, ri) => {
        const cells = Array.from(tr.children).map((td) =>
          inline(td).replace(/\s*\n\s*/g, ' ').trim().replace(/\|/g, '\\|'));
        lines.push('| ' + cells.join(' | ') + ' |');
        if (ri === 0) {
          lines.push('|' + cells.map((c, ci) => {
            const th = tr.children[ci];
            const a = th && th.getAttribute ? th.getAttribute('align') : '';
            if (a === 'center') return ':---:';
            if (a === 'right') return '---:';
            return '---';
          }).join('|') + '|');
        }
      });
      return lines.join('\n');
    }
    function walk(el, depth) {
      for (const child of el.childNodes) {
        if (child.nodeType === 3) { md += child.textContent.replace(/\u00a0/g, ' '); continue; }
        if (child.nodeType !== 1) continue;
        const tag = child.tagName;
        if (tag === 'BR') { md += '  \n'; continue; }
        if (tag === 'HR') { md += '\n\n---\n\n'; continue; }
        if (tag === 'PRE') { md += blockCode(child); continue; }
        if (tag === 'TABLE') { md += '\n\n' + tableMd(child) + '\n\n'; continue; }
        if (tag === 'UL' || tag === 'OL') { md += walkList(child, depth); continue; }
        if (tag === 'BLOCKQUOTE') { md += quoteMd(child, depth + 1); continue; }
        if (/^H[1-6]$/.test(tag)) { md += '\n\n' + '#'.repeat(parseInt(tag[1], 10)) + ' ' + inline(child) + '\n\n'; continue; }
        if (tag === 'P') { const c = inline(child); if (c.trim()) md += '\n\n' + c; continue; }
        if (tag === 'DIV' || tag === 'SELECT' || tag === 'OPTION' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') {
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') continue;
          walk(child, depth);
          continue;
        }
        md += ' ' + inline(child);
      }
    }
    walk(root, 0);
    return md.replace(/[ \t]+\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '').trim();
  }

  function featureCopyMd() {
    if (!S.copyMarkdown) return;
    // 仅在题目 / 讨论 / 博客等正文页显示
    if ($('#aml-copy-md-btn')) return;
    let root = $('.lg-problem-content, .lg-discuss-content, .lg-blog-content');
    // 讨论页若无 .lg-discuss-content，回退到首个已渲染的 Markdown 内容区
    if (!root && location.pathname.startsWith('/discuss/')) root = $('.lg-article .lfe-marked-wrap.marked, .lfe-marked-wrap.marked');
    if (!root) return;
    const btn = document.createElement('button');
    btn.id = 'aml-copy-md-btn';
    btn.innerHTML = svgIcon('copyMd', 14) + '<span>复制 Md</span>';
    btn.title = '复制当前内容为 Markdown';
    btn.addEventListener('click', () => {
      const md = htmlToMd(root);
      if (!md) { toast('无可复制内容'); return; }
      navigator.clipboard.writeText(md).then(() => toast('Markdown 已复制'))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = md; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); toast('Markdown 已复制'); } catch (e) { toast('复制失败'); }
          document.body.removeChild(ta);
        });
    });
    document.body.appendChild(btn);
  }

  // 犇犇 Ctrl+Enter
  function featureBenbenCtrlEnter() {
    if (!S.benbenCtrlEnter) return;
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const input = $('#feed-content');
        if (input && document.activeElement === input) {
          const btn = $('#feed-submit');
          if (btn) btn.click();
        }
      }
    });
  }

  // 专注模式
  function featureFocusMode() {
    if (!S.focusMode) return;
    // 依据细粒度开关决定隐藏哪些区域；哈希选择器随洛谷改版可能失效，作为兜底尝试
    const zones = {
      home:   ['.lg-index-contest', '.lg-index-benben', '.lg-right', '.info[data-v-95701c92]', '.links[data-v-1bb3d6f7]', '.am-u-md-8', '.am-u-md-4.lg-punch'],
      sidebar:['.lg-sidebar', '.rside']
    };
    const map = [
      [S.focusModeHideHome, zones.home],
      [S.focusModeHideSidebar, zones.sidebar]
    ];
    if (!(S.focusModeHideChat || S.focusModeHideSidebar || S.focusModeHideFooter || S.focusModeHideHome)) {
      // 全部关闭时仍保留一个合理的沉浸默认（隐藏侧边栏），避免专注模式毫无效果
      map.push([true, zones.sidebar]);
    }
    map.forEach(([on, sels]) => { if (on) sels.forEach((s) => $all(s).forEach((el) => { el.style.display = 'none'; })); });
    if (!S.focusModeHideHome) {
      const nav = $('.lg-nav');
      if (nav) nav.innerHTML = '<a href="/problem/list" style="color:#4f46e5;font-weight:600;">题库</a>';
    }
  }

  // 跳转框样式优化
  function featureJumpStyling() {
    if (!S.problemJumpStyling || location.pathname !== '/') return;
    const inp = $('input[name="goto"]');
    if (inp) {
      inp.style.cssText = 'width:200px;padding:6px 12px;border-radius:6px;border:1px solid #4f46e5;';
    }
  }

  // 题目跳转（双击题号）
  function featureProblemJumper() {
    if (!S.problemJumper) return;
    const open = (pid) => window.open('https://www.luogu.com.cn/problem/' + pid, '_blank');
    document.addEventListener('dblclick', (e) => {
      // 优先取选中文本；犇犇等场景双击可能选中不完整/带空白，放宽为正则匹配
      const sel = window.getSelection() ? window.getSelection().toString() : '';
      let m = (sel && sel.match(/P\d{4,5}/)) || null;
      if (m) { open(m[0]); return; }
      // 回退：从双击命中的元素文本就近提取题号
      const t = e.target;
      if (t && t.textContent) {
        const tm = t.textContent.match(/P\d{4,5}/);
        if (tm) open(tm[0]);
      }
    });
  }

  // ============ 签到后隐藏求签，放大打卡天数 ============
  function featureHideFortune() {
    if (!S.hideFortune) return;
    const punch = $('.lg-punch');
    if (!punch) return;
    // 避免重复处理
    if (punch.classList.contains('aml-fortune-done')) return;
    punch.classList.add('aml-fortune-done');
    // 隐藏求签结果（大吉/小吉/凶等）
    const result = punch.querySelector('.lg-punch-result');
    if (result) result.style.display = 'none';
    // 隐藏宜忌区域（包含宜/忌的整个 am-g 区块）
    const fortuneGrid = punch.querySelector('.am-g');
    if (fortuneGrid) {
      // 保留最后一行（打卡天数），隐藏前面的宜忌行
      const rows = fortuneGrid.querySelectorAll('.am-u-sm-6');
      rows.forEach(function (el) { el.style.display = 'none'; });
      // 客户化打卡天数行
      const checkinRow = fortuneGrid.querySelector('.am-u-sm-12.lg-small');
      if (checkinRow) {
        checkinRow.className = 'am-u-sm-12 aml-checkin-row';
        checkinRow.innerHTML = checkinRow.innerHTML.replace(
          /你已经在洛谷连续打卡了\s*(<strong>?\s*\d+\s*<\/strong>?)?\s*天/,
          '你已经在洛谷连续打卡了 <strong class="aml-checkin-days">$1</strong> 天'
        );
      }
    }
    // 隐藏原始 h2 标题中的用户运势文本
    const h2 = punch.querySelector('h2');
    if (h2) {
      // 保留用户名链接，只隐藏"的运势"文本
      const textNodes = [];
      h2.childNodes.forEach(function (n) {
        if (n.nodeType === 3 && n.textContent.indexOf('的运势') !== -1) textNodes.push(n);
      });
      textNodes.forEach(function (n) { n.textContent = ''; });
    }
  }

  // ============ 广告隐藏（题面、题解、讨论区等各区域推荐广告） ============
  function featureAdBlock() {
    if (!S.adBlock) return;
    // 通过注入 CSS 来隐藏常见广告/推荐元素，不侵入 JS 逻辑（仅注入一次）
    if (!$('#aml-adblock-style')) {
      const style = document.createElement('style');
      style.id = 'aml-adblock-style';
      style.textContent =
        /* 旧版洛谷 AdSense 广告 */
        'iframe[src*="google"], .adsbygoogle, .ad, .ads, [class*="ad-s"], [class*="ad-m"], ' +
        /* 洛谷推荐广告（智能推荐、推荐题单等） */
        '.lg-ad, .lg-index-ad, ' +
        /* 各种推荐容器 */
        '[class*="gg"], [class*="recommend"], ' +
        /* 洛谷首页推荐广告区块 */
        '.lg-index-contest .lg-article:has(.lg-ad), ' +
        /* 题解页/讨论区底部的推荐广告 iframe */
        'iframe[src*="doubleclick"], iframe[src*="googlesyndication"], ' +
        /* 列表页中的推广条目 */
        '.lg-sponsor, .lg-promote, [class*="sponsor"], ' +
        /* 隐藏所有 Google AdSense 容器 */
        'ins.adsbygoogle, ' +
        /* 旧版洛谷右下角悬浮广告 */
        '.lg-sidebar-ad, .lg-floating-ad, ' +
        /* 隐藏洛谷的"智能推荐"区块（推荐题目） */
        '.lg-smart-recommend, [class*="smart-recommend"], ' +
        /* 洛谷新版主题下的隐藏节点 */
        '.ad-wrap, .ad-container, .advertisement, ' +
        /* 隐藏百度联盟广告 */
        '[class*="baidu"], [class*="Baidu"] {' +
          'display: none !important;' +
        '}';
      (document.head || document.documentElement).appendChild(style);
    }
    // 按卡片标题文本兜底隐藏：某些"洛谷推荐/广告/推广"侧栏卡片类名不固定，
    // 纯 CSS 命中不了，改按卡片标题文字识别并隐藏（SPA 每次渲染后都会重新扫描）。
    // 只匹配标题明确的广告词，避免误伤"推荐题目/相关讨论"等正常卡片。
    const AD_TITLE = /^洛谷\s*推荐$|^广告$|^推广$|^赞助$/;
    $all('.l-card').forEach((card) => {
      if (card.dataset.amlAdDone) return;
      card.dataset.amlAdDone = '1';
      const h3 = card.querySelector(':scope > .header > h3, :scope > .l-card-header, :scope > .header, :scope > h3');
      const title = (h3 ? h3.textContent : '').replace(/\s+/g, '').trim();
      if (title && AD_TITLE.test(title) && !card.closest('.lg-article, .lg-blog-content')) {
        card.style.display = 'none';
      }
    });
    // "洛谷推荐"课程广告横幅：外层容器没有类名，仅靠 Vue data-v-* 属性，类名/CSS 无法命中。
    // 该横幅自带 FontAwesome 广告图标 fa-rectangle-ad，其后紧邻"洛谷推荐"文字，据此隐藏整块横幅。
    $all('.fa-rectangle-ad').forEach((ico) => {
      const label = ico.closest('span');
      if (label && /洛谷\s*推荐/.test(label.textContent)) {
        const banner = label.parentElement;
        if (banner) banner.style.display = 'none';
      }
    });
  }

  // 全站字体优化（使用霞鹜文楷，完全复刻油猴脚本 GM_addStyle 的逻辑）
  // 注意：扩展 manifest 注入的 CSS 里 @import 会被扩展/页面 CSP 拦截不生效，
  // 因此像油猴脚本那样，直接往页面 head 注入一个 <style>，#textContent 内带 @import，
  // 以页面上下文加载 jsdelivr 字体（洛谷页面 CSP 允许）。
  function featureSiteFont() {
    if (!S.siteFont) return;
    if ($('#aml-font-style')) return;
    const style = document.createElement('style');
    style.id = 'aml-font-style';
    // 字体优化范围：启用 LaTeX 字体保护时，不改变 .katex / .aml-math 公式内的字体。
    // 用 :where() 把全局字体规则的优先级降为 0，这样下方代码块规则（code/pre/编辑器）
    // 即使同样是 !important 也能覆盖它——确保改字体时绝不改动任何代码块/代码编辑器的字体。
    const fontRule = S.siteFontKeepLatex
      ? ":where(:not(.katex):not(.katex *):not(.aml-math):not(.aml-math *)) { font-family: 'LXGW WenKai Screen', 'PingFang SC', 'Microsoft YaHei', sans-serif !important; }"
      : ":where(*) { font-family: 'LXGW WenKai Screen', 'PingFang SC', 'Microsoft YaHei', sans-serif !important; }";
    style.textContent =
      "@import url('https://fastly.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/style.min.css');" +
      fontRule +
      "code, pre, .cm-editor, .cm-content, .cm-line, .CodeMirror, .CodeMirror-code, .CodeMirror-line, .lg-code-editor, .ace_editor, .shj-inner, .hljs { font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace !important; }" +
      "body, .lg-main, .lg-content, .lg-problem-content, .lg-discuss-content { font-size: 16px !important; line-height: 1.9 !important; letter-spacing: 0.5px !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  // ============ 页面内设置面板（齿轮按钮 + 抽屉） ============
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
    { key: 'emojiRendering', label: '表情渲染', desc: 'QQ 表情代码转真实 QQ 表情图片' },
    { key: 'latexRendering', label: '犇犇渲染公式', desc: '渲染 $...$ 形式的 LaTeX 公式' },
    { key: 'buttonUnlocker', label: '报名解锁', desc: '解锁比赛报名倒计时' },
    { key: 'problemJumpStyling', label: '跳转样式优化', desc: '首页跳转框美化' },
    { key: 'benbenCtrlEnter', label: 'Ctrl+Enter 发犇犇', desc: '犇犇快捷键' },
    { key: 'siteFont', label: '全站字体优化', desc: '统一现代中文字体' },
    { key: 'siteFontKeepLatex', label: '保留LaTeX字体', desc: '字体优化时不改变公式字体' },
    { key: 'settingsBtnVisible', label: '右下角设置按钮', desc: '显示/隐藏右下角齿轮按钮（隐藏后仍可按 Ctrl+, 打开设置）' },
    { key: 'hideFortune', label: '隐藏求签', desc: '签到后隐藏求签结果和宜忌，放大打卡天数' },
    { key: 'adBlock', label: '广告隐藏', desc: '隐藏题目/题解/讨论区等各区域推荐广告' },
    { key: 'outboundGuard', label: '跳出网站提示', desc: '跳往非洛谷相关网站时确认，并在新窗口打开' },
    { key: 'contestCalendar', label: '比赛日历', desc: '右侧悬浮毛玻璃比赛日历' },
    { key: 'foldProblemBg', label: '折叠题目背景', desc: '超长背景简介自动折叠' },
    { key: 'benbenReplyMd', label: '犇犇回复保真', desc: '回复时保留选中内容格式' },
    { key: 'focusLock', label: '番茄专注锁', desc: '专注计时并拦截跳转' },
    { key: 'htmlRunBlock', label: '文章HTML运行', desc: '文章内 HTML 代码块可运行' },
    { key: 'ratingCurve', label: '等级分曲线', desc: '用户主页 SVG 曲线' },
    { key: 'contestPrediction', label: '记分板等级分预测', desc: '比赛记分板显示等级分变动预测（还原原插件）' },
    { key: 'runCommand', label: '命令面板', desc: 'Ctrl+K 唤起命令面板' },
    { key: 'autoExpandBenben', label: '犇犇自动展开', desc: '自动展开犇犇全部内容' },
    { key: 'discussList', label: '首页讨论限长', desc: '首页讨论列表限制 16 条' },
    { key: 'codeFolding', label: '代码折叠+危险扫描', desc: '折叠超长代码并警示危险调用' },
    { key: 'userEloColor', label: '用户名 Elo 配色', desc: '按 Elo 分段给用户名着色' },
    { key: 'acceptedProblemCmp', label: 'AC 数对比', desc: '他人主页对比你的 AC 数' },
    { key: 'chatNotification', label: '私信桌面通知', desc: '/chat 收到新消息时桌面提醒' },
    { key: 'aiAnalysis', label: 'AI 题目分析', desc: '调用 OpenAI 兼容 API 解析题目（需自行填写配置）' },
    // ===== 迁移自「插件」文件夹油猴脚本（独立开关，随时可在设置面板关闭） =====
    { key: 'tasklistHideAc', label: '任务计划隐藏已AC', desc: '任务计划/题单隐藏已通过题目（exlg）' },
    { key: 'solutionTag', label: '可交题解标记', desc: '题目列表标记可写题解的题目' },
    { key: 'globalSearch', label: '全局搜索', desc: 'Alt+S 唤起全局搜索框（可切换搜索引擎）' },
    { key: 'homeFavTrainings', label: '主页收藏题单', desc: '主页显示我的收藏题单及进度环' },
    { key: 'userCardStats', label: '用户数据卡片', desc: '用户页展示 CCF评级/咕值/粉丝/动态（Better Luogu）' },
    { key: 'submissionVisual', label: '提交记录色卡', desc: '提交记录测试点显示彩色状态块' },
    { key: 'customAcImage', label: '自定义 AC 图片', desc: 'AC 时替换恭喜图片（填图片 URL，留空用默认，mf2 luogu_ac_image）' },
    { key: 'origDifficulty', label: '原始难度', desc: 'CF/AT 题目显示原始难度（exlg）' },
    { key: 'submissionDiffColor', label: '提交记录难度着色', desc: '提交记录行按题目难度着色（exlg）' },
    { key: 'articleExportPdf', label: '专栏导出 PDF', desc: '专栏页一键打印为 PDF（Article2PDF）' },
    { key: 'editorFormat', label: '编辑器自动排版', desc: '博客/题解编辑器中英文间距排版（exlg）' },
    { key: 'commentManager', label: '专栏评论管理', desc: '专栏评论区批量操作（Better Luogu）' },
    { key: 'globalBenben', label: '全网犇犇聚合', desc: '犇犇区一键拉取全网动态（exlg）' },
    { key: 'benbenRank', label: '犇犇龙王榜', desc: '犇犇区显示当日龙王排行（exlg）' },
    { key: 'codeScan', label: '危险代码扫描', desc: '高亮代码中的危险命令并警示（exlg）' },
    { key: 'roundTheme', label: '全局圆角美化', desc: '全站卡片/按钮/输入框圆角化（氩洛谷）' },
    { key: 'achievement', label: '成就系统', desc: 'AC 时弹出成就横幅并撒花（成就系统 V1.0）' },
    { key: 'punctuationTool', label: '网页标点处理', desc: '删除标点/汉字加句号/删字换序（网页标点处理工具）' },
    { key: 'captchaAuto', label: '自动识别验证码', desc: '自动识别并填写数英验证码（自动识别填充网页验证码）' },
    { key: 'hideSolution', label: '隐藏题解正文', desc: '题解正文一键折叠/显示（exlg hide-solution）' },
    { key: 'discussionSave', label: '发帖草稿保存', desc: '发帖编辑器自动备份与恢复（exlg discussion-save）' },
    { key: 'hideDifficulty', label: '难度隐藏开关', desc: '题目难度标签始终显示/悬停显示/隐藏，模式在设置中心切换（难度隐藏开关 V1.3）' }
  ];

  let panelOpen = false;
  // 「更多设置」居中原生窗格当前是否已打开
  let moreOpen = false;

  // 抽屉面板里只放常用开关；其余全部进「更多设置」居中窗格
  const COMMON_KEYS = ['focusMode', 'autoO2', 'problemColors', 'chatMarkdown', 'saveStationJumper', 'problemRandom', 'siteFont', 'hideFortune', 'adBlock', 'chatNotification', 'settingsBtnVisible'];

  // ============ 文本/URL 类配置的统一编辑入口 ============
  // 所有需要用户填写的配置项，在界面上只显示「当前值 + 编辑按钮」，
  // 点击编辑按钮弹出居中弹窗填写。secret 字段（Key/Token）用掩码显示。
  const FIELD_DEFS = [
    { key: 'aiApi', label: 'AI 设置', group: [
      { key: 'aiApiUrl', label: 'AI API 地址', placeholder: 'https://api.openai.com/v1/chat/completions' },
      { key: 'aiApiKey', label: 'AI API Key',  placeholder: 'sk-...', secret: true },
      { key: 'aiModel',  label: 'AI 模型名称', placeholder: 'gpt-4o-mini' }
    ]},
    { key: 'defaultCode',  label: '代码缺省源',    textarea: true, rows: 6, placeholder: '留空则不填充，例如：#include <bits/stdc++.h>' },
    { key: 'customAcImage', label: '自定义 AC 图片', placeholder: 'http://... 留空则用洛谷默认图' },
    { key: 'customCSS',    label: '自定义 CSS',    textarea: true, rows: 7, placeholder: '追加到全站生效的 CSS，可覆盖主题色等' },
    { key: 'captchaToken', label: '验证码识别 Token', placeholder: '留空则不使用验证码识别服务', secret: true },
    { key: 'memoContent',  label: '备忘录内容',    textarea: true, rows: 5, placeholder: '个人备忘，保存在本地' }
  ];
  function fieldDisplayVal(def, v) {
    if (def.group) {
      const parts = [];
      if (S.aiApiUrl) parts.push(S.aiApiUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      if (S.aiApiKey) parts.push('Key 已设');
      if (S.aiModel) parts.push('模型：' + S.aiModel);
      return parts.length ? esc(parts.join(' · ')) : '<span class="aml-fld-none">未设置</span>';
    }
    if (v === undefined || v === null || v === '') return '<span class="aml-fld-none">未设置</span>';
    if (def.secret) return '••••••••';
    v = String(v);
    return v.length > 30 ? v.slice(0, 30) + '…' : esc(v);
  }
  function fieldRowHtml(def) {
    return '<div class="aml-fld-row" data-fld="' + def.key + '">' +
      '<div class="aml-fld-info">' +
        '<div class="aml-fld-label">' + def.label + '</div>' +
        '<div class="aml-fld-val">' + fieldDisplayVal(def, S[def.key]) + '</div>' +
      '</div>' +
      '<button type="button" class="aml-btn aml-btn-ghost aml-fld-edit" data-fld-edit="' + def.key + '"><span>✎ 编辑</span></button>' +
    '</div>';
  }
  function renderFieldRowsHtml(defs) {
    return '<div class="aml-fld-list">' + defs.map(fieldRowHtml).join('') + '</div>';
  }
  function refreshFieldRows(def) {
    $all('.aml-fld-row[data-fld="' + def.key + '"]').forEach((row) => {
      const v = row.querySelector('.aml-fld-val');
      if (v) v.innerHTML = fieldDisplayVal(def, S[def.key]);
    });
  }
  function openFieldEditor(defKey) {
    const def = FIELD_DEFS.find((d) => d.key === defKey);
    if (!def) return;
    $all('.aml-fld-mask').forEach((m) => m.remove());
    const mask = document.createElement('div');
    mask.className = 'aml-fld-mask';
    const fields = def.group || [def];
    const multi = fields.length > 1;
    const inputsHtml = fields.map((f, i) => {
      const cur = (S[f.key] !== undefined && S[f.key] !== null) ? String(S[f.key]) : '';
      const inputHtml = f.textarea
        ? '<textarea rows="' + (f.rows || 6) + '" data-fld-input="' + f.key + '" placeholder="' + esc(f.placeholder || '') + '" spellcheck="false">' + esc(cur) + '</textarea>'
        : '<input type="' + (f.secret ? 'password' : 'text') + '" data-fld-input="' + f.key + '" value="' + esc(cur) + '" placeholder="' + esc(f.placeholder || '') + '" spellcheck="false">';
      return multi ? '<div class="aml-fld-form-item"><label>' + f.label + '</label>' + inputHtml + '</div>' : inputHtml;
    }).join('');
    mask.innerHTML =
      '<div class="aml-fld-card" role="dialog" aria-modal="true">' +
        '<div class="aml-fld-head">' +
          '<div class="aml-fld-title">' + def.label + '</div>' +
          '<button type="button" class="aml-fld-close" title="关闭">' + svgIcon('x', 18) + '</button>' +
        '</div>' +
        '<div class="aml-fld-form">' +
          inputsHtml +
          '<div class="aml-fld-actions">' +
            '<button type="button" class="aml-btn aml-btn-primary" data-fld-save="1">保存</button>' +
            '<button type="button" class="aml-btn aml-btn-ghost" data-fld-cancel="1">取消</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    const inputs = Array.prototype.slice.call(mask.querySelectorAll('[data-fld-input]'));
    const close = () => mask.remove();
    const hasTextarea = fields.some((f) => f.textarea);
    mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
    mask.querySelector('.aml-fld-close').addEventListener('click', close);
    mask.querySelector('[data-fld-cancel]').addEventListener('click', close);
    mask.querySelector('[data-fld-save]').addEventListener('click', async () => {
      inputs.forEach((inp) => { S[inp.dataset.fldInput] = inp.value; });
      await setStore({ [STORE_KEY]: S });
      refreshFieldRows(def);
      toast(def.label + ' 已保存');
      close();
    });
    mask.querySelector('.aml-fld-form').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !hasTextarea) mask.querySelector('[data-fld-save]').click();
      if (e.key === 'Escape') close();
    });
    if (inputs[0]) { inputs[0].focus(); if (inputs[0].select) inputs[0].select(); }
  }
  function bindFieldRows(container) {
    container.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fld-edit]');
      if (b) { e.preventDefault(); e.stopPropagation(); openFieldEditor(b.getAttribute('data-fld-edit')); }
    });
  }

  // 打开/收起右侧设置抽屉（按钮点击与 Ctrl+, 快捷键共用）
  function toggleSettingsPanel() {
    let p = $('.aml-settings-panel');
    if (!p) { p = buildSettingsPanel(); document.body.appendChild(p); }
    else {
      // 每次打开刷新问候语：用户名可能在授权爬取后才有
      const user = getCurrentUser();
      const uname = (user && user.name) || (stats && stats.name) || '访客';
      const g = p.querySelector('#aml-sp-greet .t');
      if (g) g.textContent = 'Hi, ' + esc(uname) + ' !';
      const av = p.querySelector('#aml-sp-greet .aml-sp-avatar');
      if (av) av.textContent = uname ? esc(uname.charAt(0).toUpperCase()) : '?';
    }
    panelOpen = !panelOpen;
    p.classList.toggle('open', panelOpen);
  }

  // 设置按钮可见性：被关闭时隐藏（仍可用 Ctrl+, 打开）
  function applySettingsBtnVisible() {
    const b = $('.aml-settings-btn');
    if (b) b.style.display = S.settingsBtnVisible ? '' : 'none';
  }

  function featureSettingsPanel() {
    // 快捷键 Ctrl+,：无论设置按钮是否隐藏，都能唤起/收起设置面板
    if (!window.__amlSettingsHotkeyBound) {
      window.__amlSettingsHotkeyBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === ',') {
          e.preventDefault();
          toggleSettingsPanel();
        }
      });
    }
    applySettingsBtnVisible();
    if ($('.aml-settings-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'aml-settings-btn';
    btn.innerHTML = svgIcon('gear', 22);
    btn.title = '打开设置面板（Ctrl+,）';
    btn.addEventListener('click', toggleSettingsPanel);
    // 点击设置面板旁边的空白处即可关闭（面板内元素、设置按钮除外）
    document.addEventListener('click', (e) => {
      const p = $('.aml-settings-panel');
      if (!p || !p.classList.contains('open')) return;
      if (p.contains(e.target) || btn.contains(e.target)) return;
      panelOpen = false;
      p.classList.remove('open');
    });
    document.body.appendChild(btn);
  }

  function buildSettingsPanel() {
    const panel = document.createElement('div');
    panel.className = 'aml-settings-panel';
    const user = getCurrentUser();
    // 用户名来源：顶部导航 > 已爬取数据 > 访客
    const uname = (user && user.name) || (stats && stats.name) || '访客';
    const now = new Date();
    const tstr = now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' +
      String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');

    let featHtml = '';
    FEATURES.forEach((f) => {
      if (COMMON_KEYS.indexOf(f.key) === -1) return; // 只显示常用开关
      const checked = S[f.key] ? 'checked' : '';
      featHtml +=
        '<div class="aml-sp-item">' +
          '<div class="aml-sp-label"><div>' + f.label + '</div>' + (f.desc ? '<div class="aml-sp-desc">' + f.desc + '</div>' : '') + '</div>' +
          '<label class="aml-switch"><input type="checkbox" data-key="' + f.key + '" ' + checked + '><span class="aml-slider"></span></label>' +
        '</div>';
    });

    panel.innerHTML =
      '<div class="aml-sp-header">' +
        '<div class="aml-sp-title">扩展设置</div>' +
        '<button class="aml-sp-close" title="关闭">' + svgIcon('x', 18) + '</button>' +
      '</div>' +
      '<div class="aml-sp-body">' +
        '<div class="aml-sp-greet" id="aml-sp-greet">' +
          '<span class="aml-sp-avatar">' + (uname ? esc(uname.charAt(0).toUpperCase()) : '?') + '</span>' +
          '<div><div class="t">Hi, ' + esc(uname) + ' !</div><div class="aml-sp-time">' + tstr + '</div></div>' +
        '</div>' +
        '<div class="aml-sp-sec-title">数据概览</div>' +
        '<div id="aml-sp-stats" class="aml-sp-stats">' + (consent === 'allow' ? (stats ? statsHtml(stats) : '<div class="aml-sp-empty">暂无数据，点击下方按钮获取</div>') : '<div class="aml-sp-empty">未授权，不获取数据</div>') + '</div>' +
        '<div class="aml-sp-actions">' +
          '<button class="aml-btn aml-btn-primary aml-btn-block" id="aml-sp-crawl">' + svgIcon('refresh', 14) + '<span>重新获取数据</span></button>' +
          '<button class="aml-btn aml-btn-ghost aml-btn-block" id="aml-sp-consent">' + svgIcon('shield', 14) + '<span>' + (consent === 'allow' ? '取消数据授权' : '开启数据授权') + '</span></button>' +
        '</div>' +
        '<div class="aml-sp-sec-title">功能开关</div>' +
        '<div class="aml-sp-list">' + featHtml + '</div>' +
        '<div class="aml-sp-sec-title">网页标点模式</div>' +
        '<div class="aml-sp-field"><select class="aml-sp-punc-select" id="aml-sp-punc-select">' +
          [['normal', '正常模式'], ['remove', '删除标点'], ['add', '汉字间加句号'], ['removeAlt', '隔字删字'], ['swap', '三字换序']]
            .map(([k, l]) => '<option value="' + k + '"' + (puncMode === k ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select><span class="aml-sp-desc">默认标点处理方式</span></div>' +
        '<div class="aml-sp-sec-title">题目难度</div>' +
        '<div class="aml-sp-field"><select id="aml-sp-diff-select">' +
          [['show', '始终显示'], ['hover', '悬停显示'], ['hidden', '隐藏']]
            .map(([k, l]) => '<option value="' + k + '"' + (diffMode === k ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select><span class="aml-sp-desc">题目难度标签显示方式</span></div>' +
        '<div class="aml-sp-sec-title">主题色</div>' +
        '<div class="aml-sp-color"><input type="color" id="aml-sp-colorpicker" value="' + (S.themeColor || '#4f46e5') + '"><span>' + (S.themeColor || '#4f46e5') + '</span></div>' +
        '<button class="aml-btn aml-btn-ghost aml-btn-block aml-sp-more" id="aml-sp-more">' + svgIcon('gear', 15) + '<span>更多设置</span></button>' +
      '</div>' +
      '<div class="aml-sp-footer">数据仅本地使用 · ' + DISPLAY_VERSION + '</div>';

    // 事件绑定
    panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const key = cb.dataset.key;
        S[key] = cb.checked;
        await setStore({ [STORE_KEY]: S });
        const map = { focusMode: featureFocusMode, autoO2: featureAutoO2, siteFont: featureSiteFont, settingsBtnVisible: applySettingsBtnVisible };
        if (map[key]) { try { map[key](); } catch (e) {} }
        toast('已' + (cb.checked ? '启用' : '禁用') + '：' + FEATURES.find((f) => f.key === key).label);
      });
    });
    panel.querySelector('.aml-sp-close').addEventListener('click', () => {
      panelOpen = false;
      panel.classList.remove('open');
    });
    panel.querySelector('#aml-sp-crawl').addEventListener('click', () => { crawlStats(); toast('正在获取数据'); });
    panel.querySelector('#aml-sp-consent').addEventListener('click', async () => {
      if (consent === 'allow') {
        consent = 'deny';
        await setStore({ [CONSENT_KEY]: 'deny' });
        toast('已关闭数据获取');
      } else {
        consent = 'allow';
        await setStore({ [CONSENT_KEY]: 'allow' });
        crawlStats();
        toast('已开启数据获取');
      }
      const s = $('#aml-sp-stats');
      if (s) s.innerHTML = consent === 'allow' ? (stats ? statsHtml(stats) : '<div class="aml-sp-empty">正在获取…</div>') : '<div class="aml-sp-empty">未授权，不获取数据</div>';
    });
    panel.querySelector('#aml-sp-colorpicker').addEventListener('input', async (e) => {
      S.themeColor = e.target.value;
      applyTheme();
      await setStore({ [STORE_KEY]: S });
      panel.querySelector('.aml-sp-color span').textContent = e.target.value;
      toast('主题色已更新');
    });
    const pSelect = panel.querySelector('#aml-sp-punc-select');
    if (pSelect) pSelect.addEventListener('change', () => { puncSwitchMain(pSelect.value); toast('标点模式：' + puncModeName(pSelect.value)); });
    const dSelect = panel.querySelector('#aml-sp-diff-select');
    if (dSelect) dSelect.addEventListener('change', () => { diffSet(dSelect.value); toast('难度模式：' + ({ show: '始终显示', hover: '悬停显示', hidden: '隐藏' }[dSelect.value] || dSelect.value)); });
    const moreBtn = panel.querySelector('#aml-sp-more');
    if (moreBtn) moreBtn.addEventListener('click', () => {
      panelOpen = false;
      panel.classList.remove('open');
      openMoreSettings(); // 打开居中的完整设置窗格
    });

    return panel;
  }

  // 「更多设置」：居中毛玻璃窗格，包含全部功能开关与完整配置
  function buildMoreSettings() {
    const box = document.createElement('div');
    box.className = 'aml-more';
    const user = getCurrentUser();
    const uname = (user && user.name) || (stats && stats.name) || '访客';
    const now = new Date();
    const tstr = now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' +
      String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');

    let featHtml = '';
    FEATURES.forEach((f) => {
      const checked = S[f.key] ? 'checked' : '';
      featHtml +=
        '<div class="aml-more-item">' +
          '<div class="aml-more-label"><div>' + f.label + '</div>' + (f.desc ? '<div class="aml-more-desc">' + f.desc + '</div>' : '') + '</div>' +
          '<label class="aml-switch"><input type="checkbox" data-key="' + f.key + '" ' + checked + '><span class="aml-slider"></span></label>' +
        '</div>';
    });

    box.innerHTML =
      '<div class="aml-more-mask"></div>' +
      '<div class="aml-more-card">' +
        '<div class="aml-more-header">' +
          '<div class="aml-more-title">更多设置</div>' +
          '<button type="button" class="aml-more-close" title="关闭">' + svgIcon('x', 18) + '</button>' +
        '</div>' +
        '<div class="aml-more-body">' +
          '<div class="aml-more-greet" id="aml-more-greet">' +
            '<span class="aml-sp-avatar">' + (uname ? esc(uname.charAt(0).toUpperCase()) : '?') + '</span>' +
            '<div><div class="t">Hi, ' + esc(uname) + ' !</div><div class="aml-sp-time">' + tstr + '</div></div>' +
          '</div>' +
          '<div class="aml-more-sec-title">全部功能开关</div>' +
          '<div class="aml-more-list">' + featHtml + '</div>' +
          '<div class="aml-more-sec-title">网页标点模式</div>' +
          '<div class="aml-sp-field"><select id="aml-more-punc-select">' +
            [['normal', '正常模式'], ['remove', '删除标点'], ['add', '汉字间加句号'], ['removeAlt', '隔字删字'], ['swap', '三字换序']]
              .map(([k, l]) => '<option value="' + k + '"' + (puncMode === k ? ' selected' : '') + '>' + l + '</option>').join('') +
          '</select><span class="aml-sp-desc">默认标点处理方式</span></div>' +
          '<div class="aml-more-sec-title">题目难度</div>' +
          '<div class="aml-sp-field"><select id="aml-more-diff-select">' +
            [['show', '始终显示'], ['hover', '悬停显示'], ['hidden', '隐藏']]
              .map(([k, l]) => '<option value="' + k + '"' + (diffMode === k ? ' selected' : '') + '>' + l + '</option>').join('') +
          '</select><span class="aml-sp-desc">题目难度标签显示方式</span></div>' +
          '<div class="aml-more-sec-title">主题色</div>' +
          '<div class="aml-sp-color"><input type="color" id="aml-more-colorpicker" value="' + (S.themeColor || '#4f46e5') + '"><span>' + (S.themeColor || '#4f46e5') + '</span></div>' +
          '<div class="aml-more-sec-title">自定义信息 <span class="aml-more-tip">点击「编辑」弹出填写</span></div>' +
          renderFieldRowsHtml(FIELD_DEFS) +
          '<div class="aml-more-sec-title">数据授权</div>' +
          '<div class="aml-sp-field">' +
            '<div class="aml-auth-switch" id="aml-auth-switch" role="group" aria-label="数据获取授权">' +
              '<div class="aml-auth-knob"></div>' +
              '<div class="aml-auth-opt" data-auth="allow">开启</div>' +
              '<div class="aml-auth-opt" data-auth="null">待决定</div>' +
              '<div class="aml-auth-opt" data-auth="deny">关闭</div>' +
            '</div>' +
            '<span class="aml-sp-desc">授权开关 · 数据仅保存在本地浏览器，不会上传到任何服务器。</span>' +
          '</div>' +
        '</div>' +
        '<div class="aml-more-footer">数据仅本地使用 · ' + DISPLAY_VERSION + '</div>' +
      '</div>';

    // 事件绑定（复用与抽屉一致的逻辑）
    box.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const key = cb.dataset.key;
        S[key] = cb.checked;
        await setStore({ [STORE_KEY]: S });
        const map = { focusMode: featureFocusMode, autoO2: featureAutoO2, siteFont: featureSiteFont, settingsBtnVisible: applySettingsBtnVisible };
        if (map[key]) { try { map[key](); } catch (e) {} }
        toast('已' + (cb.checked ? '启用' : '禁用') + '：' + FEATURES.find((f) => f.key === key).label);
      });
    });
    box.querySelector('.aml-more-close').addEventListener('click', () => closeMoreSettings(box));
    box.querySelector('.aml-more-mask').addEventListener('click', () => closeMoreSettings(box));
    bindFieldRows(box); // 自定义信息的编辑按钮（点击弹窗填写）
    const pSelect = box.querySelector('#aml-more-punc-select');
    if (pSelect) pSelect.addEventListener('change', () => { puncSwitchMain(pSelect.value); toast('标点模式：' + puncModeName(pSelect.value)); });
    const dSelect = box.querySelector('#aml-more-diff-select');
    if (dSelect) dSelect.addEventListener('change', () => { diffSet(dSelect.value); toast('难度模式：' + ({ show: '始终显示', hover: '悬停显示', hidden: '隐藏' }[dSelect.value] || dSelect.value)); });
    const cp = box.querySelector('#aml-more-colorpicker');
    const cv = box.querySelector('.aml-more .aml-sp-color span');
    if (cp) cp.addEventListener('input', async (e) => {
      S.themeColor = e.target.value;
      applyTheme();
      await setStore({ [STORE_KEY]: S });
      if (cv) cv.textContent = e.target.value;
      toast('主题色已更新');
    });
    // 数据授权（三段开关：开启=左、关闭=右、待决定=中）
    const authSwitch = box.querySelector('#aml-auth-switch');
    if (authSwitch) {
      const opts = Array.prototype.slice.call(authSwitch.querySelectorAll('.aml-auth-opt'));
      const renderAuth = () => {
        getStore([CONSENT_KEY]).then((res) => {
          consent = res[CONSENT_KEY] || null;
          const state = consent === 'allow' ? 'allow' : (consent === 'deny' ? 'deny' : 'null');
          authSwitch.dataset.state = state;
          opts.forEach((o) => o.classList.toggle('on', (o.dataset.auth === 'null' ? state === 'null' : o.dataset.auth === state)));
        });
      };
      renderAuth();
      const applyConsent = async (val) => {
        if (val === 'null') {
          consent = null;
          await setStore({ [CONSENT_KEY]: null });
          toast('数据获取：待决定');
        } else if (val === 'allow') {
          consent = 'allow';
          await setStore({ [CONSENT_KEY]: 'allow' });
          crawlStats();
          toast('已开启数据获取');
        } else {
          consent = 'deny';
          await setStore({ [CONSENT_KEY]: 'deny' });
          toast('已关闭数据获取');
        }
        renderAuth();
      };
      authSwitch.addEventListener('click', (e) => {
        const opt = e.target.closest('.aml-auth-opt');
        if (opt) return applyConsent(opt.dataset.auth);
        if (consent === 'allow') applyConsent('null');
        else applyConsent('allow');
      });
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && moreOpen) closeMoreSettings(box); });
    return box;
  }

  function openMoreSettings() {
    if (moreOpen) return;
    let box = $('.aml-more');
    if (!box) { box = buildMoreSettings(); document.body.appendChild(box); }
    moreOpen = true;
    box.classList.add('open');
    // 同步抽屉面板的常用开关为最新值（避免抽屉打开后值不一致）
    const p = $('.aml-settings-panel');
    if (p) p.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = !!S[cb.dataset.key]; });
  }

  function closeMoreSettings(box) {
    moreOpen = false;
    if (box) box.classList.remove('open');
  }

  function statsHtml(st) {
    return '<div class="aml-sp-stat-grid">' +
      '<div class="aml-sp-stat"><div class="v primary">' + st.passed + '</div><div class="l">通过</div></div>' +
      '<div class="aml-sp-stat"><div class="v primary">' + st.submitted + '</div><div class="l">提交</div></div>' +
      '<div class="aml-sp-stat"><div class="v">' + esc(String(st.ranking)) + '</div><div class="l">排名</div></div>' +
      '<div class="aml-sp-stat"><div class="v">' + esc(String(st.uid)) + '</div><div class="l">UID</div></div>' +
    '</div><div class="aml-sp-slogan">' + esc(st.slogan) + '</div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ============ /help 页的"版本与更新"展示（复用 background 的 checkUpdate） ============
  function renderHsUpdate(info) {
    const cur = $('#aml-hs-upd-cur');
    const lat = $('#aml-hs-upd-lat');
    const act = $('#aml-hs-upd-act');
    if (!cur || !lat || !act) return;
    cur.textContent = DISPLAY_VERSION;
    act.innerHTML = '';
    if (!info || info.error) {
      lat.textContent = '检测失败';
      lat.classList.remove('new');
      act.innerHTML = '<a class="aml-btn aml-btn-ghost aml-btn-block" href="javascript:void(0)" id="aml-hs-upd-retry">' + svgIcon('refresh', 14) + '<span>重新检查</span></a>';
      const retry = act.querySelector('#aml-hs-upd-retry');
      if (retry) retry.addEventListener('click', () => { act.innerHTML = '<span class="txt">正在检查更新…</span>'; checkHsUpdate(); });
      return;
    }
    if (info.unreachable) {
      lat.textContent = '—';
      lat.classList.remove('new');
      act.innerHTML = '<span class="txt">更新源同步中，稍后再试</span>';
      return;
    }
    lat.textContent = 'v' + info.latest;
    lat.classList.toggle('new', !!info.updateAvailable);
    if (info.updateAvailable) {
      act.innerHTML = '<a class="aml-btn aml-btn-primary aml-btn-block" href="' + esc(info.url || '') + '" target="_blank" rel="noopener"><span>下载新版本</span></a>';
    } else {
      act.innerHTML = '<span class="txt">已是最新版本</span>';
    }
  }

  async function checkHsUpdate() {
    try {
      const info = await chrome.runtime.sendMessage({ type: 'checkUpdate' });
      renderHsUpdate(info || { error: true });
    } catch (e) {
      renderHsUpdate({ error: true });
    }
  }

  // ============ 独立的设置页（访问 /help 时整页替换洛谷 404 主区域，简洁自足） ============
  // 洛谷 /help 是一个无 class 的 <main>，内含 h1"出错啦"；这里的逻辑健壮可重建：
  // 以 main 内是否已有我们的容器为判据，SPA 重建 main 后下一次监听即可重新注入。
  function featureHelpSettingsPage() {
    // 数据更新后联动刷新（仅注册一次）
    if (!window.__amlHsBound) {
      window.__amlHsBound = true;
      window.addEventListener('aml:stats', () => {
        const gn = $('#aml-hs-greet-name');
        if (gn) gn.textContent = esc((getCurrentUser() && getCurrentUser().name) || (stats && stats.name) || '访客');
        const box = $('#aml-hs-stats');
        if (box) box.innerHTML = consent === 'allow' ? (stats ? statsHtml(stats) : '<div class="aml-hs-empty">暂无数据，点击下方按钮获取</div>') : '<div class="aml-hs-empty">未授权，不获取数据</div>';
      });
    }

    const onHelp = location.pathname === '/st' || location.pathname === '/help' || location.pathname === '/xlgs';
    document.body.classList.toggle('aml-help-page', onHelp);
    if (!onHelp) {
      // 离开设置页：恢复洛谷原生的主区域与顶部导航
      const old = $('#aml-help-settings');
      if (old) old.remove();
      return;
    }

    // 洛谷 /help 是 404 占位页，<main> 无 class。已注入则跳过，避免反复重建。
    const main = $('main');
    if (!main || main.querySelector('#aml-help-settings')) return;

    const user = getCurrentUser();
    const loggedIn = !!(user && user.uid);
    const uname = (user && user.name) || (stats && stats.name) || '访客';

    // 多模式分组：把功能开关划分为可切换的多种模式，界面更实用简洁，
    // 在 /st（原 /help）里切换标签即可。新增功能键未分组时自动归入「基础」。
    const SETTINGS_MODES = [
      { key: 'base',       label: '基础',   keys: ['problemColors', 'emojiRendering', 'latexRendering', 'siteFont', 'siteFontKeepLatex'] },
      { key: 'reading',    label: '阅读',   keys: ['discussCopy', 'copyMarkdown', 'chatMarkdown', 'benbenCtrlEnter', 'showIntroduction'] },
      { key: 'efficiency', label: '效率',   keys: ['autoO2', 'problemJumper', 'problemRandom', 'problemJumpStyling', 'buttonUnlocker', 'nbnhhsh', 'extendTask'] },
      { key: 'station',    label: '站内',   keys: ['saveStationJumper', 'useLuoguMe', 'userSearch'] },
      { key: 'immersive',  label: '沉浸',   keys: ['focusMode', 'hideFortune', 'adBlock'] }
    ];
    const groupedKeys = new Set();
    SETTINGS_MODES.forEach((m) => m.keys.forEach((k) => groupedKeys.add(k)));
    const baseItems = FEATURES.filter((f) => SETTINGS_MODES[0].keys.indexOf(f.key) >= 0)
      .concat(FEATURES.filter((f) => !groupedKeys.has(f.key))); // 未分组兜底进「基础」
    const modeItems = SETTINGS_MODES.map((m) => ({
      mode: m,
      items: m.key === 'base' ? baseItems : FEATURES.filter((f) => m.keys.indexOf(f.key) >= 0)
    }));
    const tabHtml = SETTINGS_MODES.map((m) =>
      '<button class="aml-hs-tab' + (m.key === 'base' ? ' active' : '') + '" data-mode="' + m.key + '" type="button">' + m.label + '</button>'
    ).join('');
    function hsItemsHtml(list) {
      return list.map((f) => {
        const checked = S[f.key] ? 'checked' : '';
        return '<div class="aml-hs-item">' +
          '<div class="aml-hs-label">' + (f.label ? '<div>' + f.label + '</div>' : '') + (f.desc ? '<div class="aml-hs-desc">' + f.desc + '</div>' : '') + '</div>' +
          '<label class="aml-switch"><input type="checkbox" data-key="' + f.key + '" ' + checked + '><span class="aml-slider"></span></label>' +
        '</div>';
      }).join('');
    }
    let featHtml = modeItems.map((g) =>
      '<div class="aml-hs-mode"' + (g.mode.key === 'base' ? '' : ' hidden') + ' data-mode="' + g.mode.key + '">' +
        '<div class="aml-hs-mode-desc">' + g.mode.label + '模式 · 点击上方标签切换</div>' +
        hsItemsHtml(g.items) +
      '</div>'
    ).join('');

    const now = new Date();
    const tstr = now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' +
      String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');

    const loggedHtml = loggedIn
      ? '<span class="aml-hs-user"><span class="aml-hs-avatar">' + esc(uname.charAt(0).toUpperCase()) + '</span><span>' + esc(uname) + '</span></span>'
      : '<a class="aml-hs-user aml-hs-login" href="https://www.luogu.com.cn/auth/login">去登录</a>';

    const wrap = document.createElement('div');
    wrap.id = 'aml-help-settings';
    wrap.innerHTML =
      '<div class="aml-hs-top">' +
        '<div class="aml-hs-topright">' + loggedHtml + '<a class="aml-hs-home" href="https://www.luogu.com.cn/">返回洛谷</a></div>' +
      '</div>' +
      '<div class="aml-hs-greet">' +
        '<h1><span class="aml-hs-hi">Hi,</span> <b id="aml-hs-greet-name">' + esc(uname) + '</b> !</h1>' +
        '<p>扩展设置中心 · ' + tstr + '</p>' +
      '</div>' +

      '<section class="aml-hs-card">' +
        '<div class="aml-hs-sec">数据概览</div>' +
        '<div id="aml-hs-stats" class="aml-hs-stats">' +
          (consent === 'allow'
            ? (stats ? statsHtml(stats) : '<div class="aml-hs-empty">暂无数据，点击下方按钮获取</div>')
            : '<div class="aml-hs-empty">未授权。同意授权后即可在本地展示您的洛谷数据，不会上传。</div>') +
        '</div>' +
        '<div class="aml-hs-actions">' +
          '<div class="aml-auth-switch" id="aml-hs-auth-switch" role="group" aria-label="数据获取授权">' +
            '<div class="aml-auth-knob"></div>' +
            '<div class="aml-auth-opt" data-auth="allow">开启</div>' +
            '<div class="aml-auth-opt" data-auth="null">待决定</div>' +
            '<div class="aml-auth-opt" data-auth="deny">关闭</div>' +
          '</div>' +
          '<button class="aml-btn aml-btn-primary aml-btn-block" id="aml-hs-crawl">' + svgIcon('refresh', 14) + '<span>重新获取数据</span></button>' +
        '</div>' +
      '</section>' +

      '<section class="aml-hs-card">' +
        '<div class="aml-hs-sec">功能开关 <span class="aml-hs-tip">多种模式·标签切换</span></div>' +
        '<div class="aml-hs-tabs">' + tabHtml + '</div>' +
        '<div class="aml-hs-list">' + featHtml + '</div>' +
      '</section>' +

      '<section class="aml-hs-card">' +
        '<div class="aml-hs-sec">网页标点模式 <span class="aml-hs-tip">配合「网页标点处理」使用</span></div>' +
        '<div class="aml-hs-field"><label>默认标点处理方式</label>' +
          '<select id="aml-hs-punc-select">' +
            [['normal', '正常模式'], ['remove', '删除标点'], ['add', '汉字间加句号'], ['removeAlt', '隔字删字'], ['swap', '三字换序']]
              .map(([k, l]) => '<option value="' + k + '"' + (puncMode === k ? ' selected' : '') + '>' + l + '</option>').join('') +
          '</select></div>' +
      '</section>' +

      '<section class="aml-hs-card">' +
        '<div class="aml-hs-sec">主题色</div>' +
        '<div class="aml-hs-color"><input type="color" id="aml-hs-colorpicker" value="' + (S.themeColor || '#4f46e5') + '"><span>' + (S.themeColor || '#4f46e5') + '</span></div>' +
      '</section>' +

      '<section class="aml-hs-card">' +
        '<div class="aml-hs-sec">AI 设置 <span class="aml-hs-tip">密钥仅本地存储，点击「编辑」弹出填写</span></div>' +
        renderFieldRowsHtml(FIELD_DEFS.filter((d) => d.key === 'aiApi')) +
      '</section>' +

      '<section class="aml-hs-card">' +
        '<div class="aml-hs-sec">代码缺省源（提交代码为空时自动填充）</div>' +
        renderFieldRowsHtml(FIELD_DEFS.filter((d) => d.key === 'defaultCode')) +
      '</section>' +

      '<section class="aml-hs-card">' +
        '<div class="aml-hs-sec">版本与更新</div>' +
        '<div class="aml-hs-upd-row">' +
          '<div class="aml-hs-upd-item"><div class="v" id="aml-hs-upd-cur">' + DISPLAY_VERSION + '</div><div class="l">当前版本</div></div>' +
          '<div class="aml-hs-upd-item"><div class="v" id="aml-hs-upd-lat">—</div><div class="l">最新版本</div></div>' +
        '</div>' +
        '<div class="aml-hs-upd-act" id="aml-hs-upd-act"><span class="txt">正在检查更新…</span></div>' +
      '</section>' +

      '<footer class="aml-hs-foot">数据仅本地使用 · ' + DISPLAY_VERSION + ' · 无任何上传</footer>';

    main.innerHTML = '';
    main.appendChild(wrap);

    // 多模式标签切换
    wrap.querySelectorAll('.aml-hs-tab').forEach((t) => {
      t.addEventListener('click', () => {
        wrap.querySelectorAll('.aml-hs-tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const mode = t.dataset.mode;
        wrap.querySelectorAll('.aml-hs-mode').forEach((g) => {
          g.hidden = g.dataset.mode !== mode;
        });
      });
    });

    // 渲染并检查版本更新（复用 background 的 checkUpdate）
    renderHsUpdate({ current: chrome.runtime.getManifest().version, latest: '—' });
    checkHsUpdate();

    // 事件绑定
    wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const key = cb.dataset.key;
        S[key] = cb.checked;
        await setStore({ [STORE_KEY]: S });
        const map = { focusMode: featureFocusMode, autoO2: featureAutoO2, siteFont: featureSiteFont, hideFortune: featureHideFortune, adBlock: featureAdBlock, settingsBtnVisible: applySettingsBtnVisible };
        if (map[key]) { try { map[key](); } catch (e) {} }
        toast('已' + (cb.checked ? '启用' : '禁用') + '：' + FEATURES.find((f) => f.key === key).label);
      });
    });
    wrap.querySelector('#aml-hs-crawl').addEventListener('click', () => { crawlStats(); toast('正在获取数据'); });
    const hsAuthSwitch = wrap.querySelector('#aml-hs-auth-switch');
    if (hsAuthSwitch) {
      const hsOpts = Array.prototype.slice.call(hsAuthSwitch.querySelectorAll('.aml-auth-opt'));
      const renderHsAuth = () => {
        const hsState = consent === 'allow' ? 'allow' : (consent === 'deny' ? 'deny' : 'null');
        hsAuthSwitch.dataset.state = hsState;
        hsOpts.forEach((o) => o.classList.toggle('on', (o.dataset.auth === 'null' ? hsState === 'null' : o.dataset.auth === hsState)));
      };
      const applyHsConsent = async (val) => {
        if (val === 'null') {
          consent = null;
          await setStore({ [CONSENT_KEY]: null });
          toast('数据获取：待决定');
        } else if (val === 'allow') {
          consent = 'allow';
          await setStore({ [CONSENT_KEY]: 'allow' });
          crawlStats();
          toast('已开启数据获取');
        } else {
          consent = 'deny';
          await setStore({ [CONSENT_KEY]: 'deny' });
          toast('已关闭数据获取');
        }
        const s = $('#aml-hs-stats');
        if (s) s.innerHTML = consent === 'allow' ? (stats ? statsHtml(stats) : '<div class="aml-hs-empty">正在获取…</div>') : '<div class="aml-hs-empty">未授权，不获取数据</div>';
        renderHsAuth();
      };
      hsAuthSwitch.addEventListener('click', (e) => {
        const opt = e.target.closest('.aml-auth-opt');
        if (opt) return applyHsConsent(opt.dataset.auth);
        if (consent === 'allow') applyHsConsent('null');
        else applyHsConsent('allow');
      });
      renderHsAuth();
    }
    wrap.querySelector('#aml-hs-colorpicker').addEventListener('input', async (e) => {
      S.themeColor = e.target.value;
      applyTheme();
      await setStore({ [STORE_KEY]: S });
      wrap.querySelector('.aml-hs-color span').textContent = e.target.value;
      toast('主题色已更新');
    });
    const hpSelect = wrap.querySelector('#aml-hs-punc-select');
    if (hpSelect) hpSelect.addEventListener('change', () => { puncSwitchMain(hpSelect.value); toast('标点模式：' + puncModeName(hpSelect.value)); });
    // AI 配置 / 代码缺省源：点击「编辑」弹出弹窗填写（统一入口）
    bindFieldRows(wrap);
  }

  // ============ 新增功能（自包含、禁外部库） ============

  // 1. 比赛日历：右侧悬浮毛玻璃小日历（可切月、点选高亮、prompt 添加自定义比赛存 localStorage）
  function featureContestCalendar() {
    try {
      if (!S.contestCalendar || $('.aml-cal-card')) return;
      const card = document.createElement('div');
      card.className = 'aml-cal-card';
      const KEY = 'aml_cal_custom';
      const now = new Date();
      let year = now.getFullYear(), month = now.getMonth(), selected = null;
      let events = [];
      try { events = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { events = []; }

      function render() {
        const days = new Date(year, month + 1, 0).getDate();
        const startDow = new Date(year, month, 1).getDay();
        const heads = '日一二三四五六';
        let g = '<div class="aml-cal-grid">';
        for (const h of heads) g += '<span class="aml-cal-dow">' + h + '</span>';
        for (let i = 0; i < startDow; i++) g += '<span class="aml-cal-blank"></span>';
        for (let d = 1; d <= days; d++) {
          const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          const isT = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
          const has = events.some((c) => c.date === ds);
          g += '<button class="aml-cal-day' + (isT ? ' today' : '') + (selected === ds ? ' sel' : '') + (has ? ' has' : '') + '" data-d="' + ds + '">' + d + (has ? '<i class="aml-cal-dot"></i>' : '') + '</button>';
        }
        g += '</div>';
        const pfx = year + '-' + String(month + 1).padStart(2, '0');
        const me = events.filter((c) => c.date.substring(0, 7) === pfx);
        const list = me.length
          ? me.slice(0, 5).map((c) => '<div class="aml-cal-li" title="' + esc(c.name) + '"><span>' + c.date.substring(8) + '</span><b>' + esc(c.name.length > 16 ? c.name.slice(0, 16) + '…' : c.name) + '</b></div>').join('')
          : '<div class="aml-cal-empty">本月暂无比赛</div>';
        card.querySelector('.aml-cal-body').innerHTML =
          '<div class="aml-cal-head"><button class="aml-cal-nav" data-m="-1">‹</button>' +
          '<span class="aml-cal-title">' + year + '年' + String(month + 1) + '月</span>' +
          '<button class="aml-cal-nav" data-m="1">›</button></div>' +
          g + list +
          '<button class="aml-cal-add">＋ 添加比赛</button>';
      }

      card.innerHTML = '<div class="aml-cal-head-title">比赛日历</div><div class="aml-cal-body"></div>';
      card.addEventListener('click', (e) => {
        const nav = e.target.closest('.aml-cal-nav');
        if (nav) { month += parseInt(nav.dataset.m, 10); if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } render(); return; }
        const day = e.target.closest('.aml-cal-day');
        if (day) { selected = day.dataset.d; render(); return; }
        if (e.target.closest('.aml-cal-add')) {
          const name = (prompt(selected ? '添加 ' + selected + ' 的比赛：' : '添加今天的比赛：', '') || '').trim();
          if (!name) return;
          const ds = selected || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
          events.push({ date: ds, name });
          try { localStorage.setItem(KEY, JSON.stringify(events)); } catch (err) {}
          render(); toast('已添加比赛');
        }
      });
      document.body.appendChild(card);

      // 拖动：按住标题栏移动毛玻璃卡片，位置持久化
      const head = card.querySelector('.aml-cal-head-title');
      head.style.cursor = 'move';
      let drag = { on: false, sx: 0, sy: 0, px: 0, py: 0 };
      let pos = { x: null, y: null };
      try { pos = Object.assign(pos, JSON.parse(localStorage.getItem('aml_cal_pos') || '{}') || {}); } catch (e) {}
      if (typeof pos.x === 'number' && typeof pos.y === 'number') {
        card.style.right = 'auto'; card.style.left = pos.x + 'px'; card.style.top = pos.y + 'px';
      }
      head.addEventListener('pointerdown', (ev) => {
        drag.on = true; drag.sx = ev.clientX; drag.sy = ev.clientY;
        drag.px = card.offsetLeft; drag.py = card.offsetTop;
        ev.preventDefault(); ev.stopPropagation();
      });
      document.addEventListener('pointermove', (ev) => {
        if (!drag.on) return;
        card.style.right = 'auto';
        card.style.left = Math.max(0, drag.px + ev.clientX - drag.sx) + 'px';
        card.style.top = Math.max(0, drag.py + ev.clientY - drag.sy) + 'px';
      });
      document.addEventListener('pointerup', () => {
        if (!drag.on) return;
        drag.on = false;
        try { localStorage.setItem('aml_cal_pos', JSON.stringify({ x: card.offsetLeft, y: card.offsetTop })); } catch (e) {}
      });

      // 缩小：右下角拖拽手柄调整宽度，宽度持久化
      const rz = document.createElement('div');
      rz.className = 'aml-cal-resize';
      card.appendChild(rz);
      let rsz = { on: false, sx: 0, w: 0 };
      let calW = 250;
      try { calW = Math.max(180, parseInt(localStorage.getItem('aml_cal_w') || '250', 10) || 250); card.style.width = calW + 'px'; } catch (e) {}
      rz.addEventListener('pointerdown', (ev) => {
        rsz.on = true; rsz.sx = ev.clientX; rsz.w = card.offsetWidth;
        ev.preventDefault(); ev.stopPropagation();
      });
      document.addEventListener('pointermove', (ev) => {
        if (!rsz.on) return;
        card.style.width = Math.max(180, rsz.w + (ev.clientX - rsz.sx)) + 'px';
      });
      document.addEventListener('pointerup', () => {
        if (!rsz.on) return;
        rsz.on = false;
        try { localStorage.setItem('aml_cal_w', String(card.offsetWidth)); } catch (e) {}
      });

      // 拉取已发布比赛（失败仅保留占位空态）
      fetch('https://www.luogu.com.cn/contest/list?page=1&_contentOnly=1', { credentials: 'include' })
        .then((r) => r.json()).then((dat) => {
          const cs = (dat && dat.currentData && dat.currentData.contests) || [];
          cs.forEach((c) => {
            const st = c.startTime ? new Date(c.startTime) : null;
            if (!st) return;
            const ds = st.getFullYear() + '-' + String(st.getMonth() + 1).padStart(2, '0') + '-' + String(st.getDate()).padStart(2, '0');
            if (!events.some((x) => x.date === ds && x.name === c.name)) events.push({ date: ds, name: c.name || '' });
          });
          try { localStorage.setItem(KEY, JSON.stringify(events)); } catch (_) {}
          render();
        }).catch(() => { render(); });
      render();
    } catch (e) {}
  }

  // 2. 折叠题目超长背景简介：超阈值时折叠 + 展开/收起按钮
  function featureFoldProblemBg() {
    try {
      if (!S.foldProblemBg) return;
      setTimeout(() => {
        const content = $('.lg-problem-content');
        if (!content || content.querySelector('.aml-prob-wrap')) return;
        let bg = null;
        // 找首个文本量明显偏多的段落
        for (const el of $all('p, .am-paragraph', content)) {
          if (!bg && (el.textContent || '').length > 80) { bg = el; break; }
        }
        if (!bg) { const fe = content.firstElementChild; if (fe) bg = fe; }
        if (!bg || !bg.textContent) return;
        const h = bg.offsetHeight || bg.getBoundingClientRect().height;
        if (h <= 300 && (bg.textContent || '').length <= 300) return; // 不算超长
        const wrap = document.createElement('div');
        wrap.className = 'aml-prob-wrap';
        bg.parentNode.insertBefore(wrap, bg);
        wrap.appendChild(bg);
        bg.classList.add('aml-prob-bg');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aml-fold-btn';
        let folded = true;
        const sync = () => {
          wrap.classList.toggle('folded', folded);
          btn.textContent = folded ? '展开背景介绍（' + bg.textContent.length + '字）' : '收起背景';
        };
        wrap.appendChild(btn);
        sync();
        btn.addEventListener('click', (e) => { e.stopPropagation(); folded = !folded; sync(); });
      }, 350);
    } catch (e) {}
  }

  // 3. 犇犇/讨论回复保真：回复时把选中或引用的内容转成 Markdown 回填
  function featureBenbenReplyMd() {
    try {
      if (!S.benbenReplyMd) return;
      if (document.__amlReplyHooked) return; // 防重复挂载监听器（SPA 路由每次触发都会重进本函数）
      document.__amlReplyHooked = true;

      // 从回复控件向上定位原贴，提取「作者 + 正文」。正文优先取 Markdown 渲染容器用 htmlToMd 转换，保证格式保真
      function extractQuote(btn) {
        const ctn = btn.closest('.am-comment, .lg-post, .lg-talk-item, .comment, [class*="talk"]')
          || btn.closest('.l-card, .lg-article') || btn.parentElement || btn;
        let author = '';
        const authSel = ctn.querySelector('.am-comment-author, [class*="author"], [class*="user-name"], [class*="name"]');
        if (authSel) author = (authSel.textContent || '').trim();
        let body = '';
        const contentEl = ctn.querySelector('.lfe-marked-wrap, .lfe-marked, [class*="markdown"], .am-comment-content, [class*="content"]');
        if (contentEl) {
          try { body = htmlToMd(contentEl) || contentEl.textContent || ''; }
          catch (e) { body = contentEl.textContent || ''; }
        }
        body = (body || ctn.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        // 剔除原贴自带的操作文字，避免污染引用内容
        body = body.replace(/回复|举报|复制内容|置顶|删除|收藏|转载|展开|收起|表情/ig, '').replace(/\s+/g, ' ').trim();
        if (!body) return '';
        let lines = body.slice(0, 500).split('\n').map((l) => '> ' + l).join('\n');
        if (author) lines = '> **@' + author + '**：' + (lines ? '\n' + lines : '');
        return lines;
      }

      // 填充回复框：兼容 textarea 与 contenteditable 富文本编辑器
      function triggerInput(ta) {
        try {
          const evt = new Event('input', { bubbles: true });
          (ta && (ta instanceof HTMLTextAreaElement || ta instanceof HTMLInputElement)) ? ta.dispatchEvent(evt) : null;
          document.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) {}
      }
      function fillReply(text) {
        // 优先命中真正的回复框，绝不落到普通输入框
        const ta = $('textarea[placeholder*="回复"], textarea[placeholder*="引用"], .markdown-editor textarea, .lg-editor textarea');
        if (ta && !ta.__amlReplied) {
          ta.focus();
          ta.value = ta.value.trim() ? ta.value.trim() + '\n\n' + text + '\n\n' : text + '\n\n';
          ta.__amlReplied = true;
          triggerInput(ta);
          ta.addEventListener('input', () => { ta.__amlReplied = false; });
          return true;
        }
        const ed = $('[contenteditable="true"]');
        if (ed && !ed.__amlReplied) {
          ed.focus();
          // 用 execCommand 触发富文本编辑器内部状态同步（比纯 appendChild 更能保留格式）
          try { document.execCommand('insertText', false, '\n\n' + text + '\n'); }
          catch (e) { ed.appendChild(document.createTextNode('\n\n' + text + '\n')); }
          ed.__amlReplied = true;
          triggerInput(ed);
          ed.addEventListener('input', () => { ed.__amlReplied = false; });
          return true;
        }
        return false;
      }

      document.addEventListener('click', (e) => {
        try {
          const btn = e.target.closest('button, a, span');
          if (!btn) return;
          const cls = String(btn.className || '');
          const txt = String(btn.textContent || '');
          if (!/reply|quote|回复|引用/i.test(cls + txt)) return;
          if (!$('textarea[placeholder*="回复"], textarea[placeholder*="引用"], .markdown-editor textarea, .lg-editor textarea, [contenteditable="true"]')) return;
          setTimeout(() => {
            try {
              const sel = window.getSelection ? (window.getSelection().toString() || '').trim() : '';
              const quote = sel ? sel.split('\n').map((l) => '> ' + l).join('\n') : extractQuote(btn);
              if (!quote) return;
              fillReply(quote);
            } catch (err) {}
          }, 350);
        } catch (err) {}
      }, true);
    } catch (e) {}
  }

  // 4. 专注模式（番茄钟 + 跳转拦截，localStorage 断点续走）
  const flState = { running: false, endAt: 0, dur: 25, label: null, ticking: false, hooked: false };
  const pad2 = (n) => String(n).padStart(2, '0');
  function flSave() { try { localStorage.setItem('aml_focus_lock', JSON.stringify({ running: flState.running, endAt: flState.endAt, dur: flState.dur })); } catch (e) {} }
  function flStartTicking() { if (flState.ticking) return; flState.ticking = true; setInterval(flTick, 1000); }
  function flTick() {
    try {
      if (!flState.running) return;
      const ms = flState.endAt - Date.now();
      const btn = document.querySelector('.aml-fl-btn[data-a="toggle"]');
      if (ms <= 0) {
        flState.running = false; flSave();
        if (flState.label) flState.label.textContent = pad2(flState.dur) + ':00';
        if (btn) btn.textContent = '开始';
        toast('专注完成！');
        return;
      }
      if (btn) btn.textContent = '暂停';
      if (flState.label) flState.label.textContent = pad2(Math.floor(ms / 60000)) + ':' + pad2(Math.floor((ms % 60000) / 1000));
    } catch (e) {}
  }
  function buildFlCard() {
    try {
      if ($('.aml-fl-card')) return;
      const card = document.createElement('div');
      card.className = 'aml-fl-card';
      card.innerHTML =
        '<div class="aml-fl-title">专注模式（番茄钟）</div>' +
        '<div class="aml-fl-time"><span class="aml-fl-t">' + pad2(flState.dur) + ':00</span></div>' +
        '<div class="aml-fl-ctrl">' +
          '<button class="aml-fl-btn aml-fl-primary" data-a="toggle">' + (flState.running ? '暂停' : '开始') + '</button>' +
          '<button class="aml-fl-btn aml-fl-ghost" data-a="reset">重置</button>' +
        '</div>' +
        '<div class="aml-fl-base"><label>时长</label><input type="number" min="1" max="120" value="' + flState.dur + '"> 分</div>';
      const host = document.querySelector('.lg-main, .main-content, main, #app');
      (host || document.body).appendChild(card);
      flState.label = card.querySelector('.aml-fl-t');
      if (flState.running) flTick();
      card.querySelector('[data-a="toggle"]').addEventListener('click', () => {
        const inp = card.querySelector('input');
        const m = Math.max(1, parseInt(inp.value, 10) || flState.dur);
        const b = card.querySelector('[data-a="toggle"]');
        if (flState.running) {
          // 暂停：归零计时并复位按钮文案（此前 pause 后按钮仍显示“暂停”）
          flState.running = false; flState.endAt = 0;
          if (b) b.textContent = '开始';
          if (flState.label) flState.label.textContent = pad2(flState.dur) + ':00';
        } else {
          flState.dur = m; flState.endAt = Date.now() + m * 60000; flState.running = true; flStartTicking();
          if (b) b.textContent = '暂停';
        }
        flSave(); flTick();
      });
      card.querySelector('[data-a="reset"]').addEventListener('click', () => {
        flState.running = false; flState.endAt = 0; flSave();
        flState.dur = Math.max(1, parseInt(card.querySelector('input').value, 10) || flState.dur);
        if (flState.label) flState.label.textContent = pad2(flState.dur) + ':00';
        const btn = card.querySelector('[data-a="toggle"]'); if (btn) btn.textContent = '开始';
      });
      card.querySelector('input').addEventListener('change', (e) => {
        flState.dur = Math.max(1, parseInt(e.target.value, 10) || flState.dur);
        if (!flState.running && flState.label) flState.label.textContent = pad2(flState.dur) + ':00';
      });
    } catch (e) {}
  }
  function featureFocusLock() {
    try {
      if (!S.focusLock) return;
      try {
        const s = JSON.parse(localStorage.getItem('aml_focus_lock') || 'null');
        if (s && typeof s.dur === 'number') flState.dur = s.dur;
        if (s && s.running && s.endAt > Date.now()) { flState.running = true; flState.endAt = s.endAt; }
      } catch (e) {}
      if (flState.running) flStartTicking();
      // 卡片显示在设置/商城页与首页右栏，便于随时开关
      if (/\/st(\/|$)/.test(location.pathname) || location.pathname.indexOf('settings') >= 0 || location.pathname === '/') buildFlCard();
      if (!flState.hooked) {
        flState.hooked = true;
        document.addEventListener('click', (e) => {
          try {
            if (!S.focusLock || !flState.running) return;
            const a = e.target.closest('a[href]');
            if (!a) return;
            const href = a.getAttribute('href') || '';
            if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return; // 白名单：锚点/脚本
            // 打卡按钮例外：专注中不放行打卡/签到会破坏体验
            if (href.indexOf('/punch') >= 0 || a.closest('.lg-punch')) return;
            const remain = Math.max(1, Math.ceil((flState.endAt - Date.now()) / 60000));
            if (!confirm('专注中，还剩约 ' + remain + ' 分钟，确定要跳转吗？')) { e.preventDefault(); e.stopPropagation(); }
          } catch (err) {}
        }, true);
      }
    } catch (e) {}
  }

  // 跳出网站提示：点击外部链接时确认，白名单内的洛谷相关域名不提示
  let outboundHooked = false;
  function featureOutboundGuard() {
    try {
      if (!S.outboundGuard || outboundHooked) return;
      outboundHooked = true;
      const WL = ['luogu.com', 'luogu.com.cn', 'luogu.me', 'luogu.men', 'benben.sbs'];
      const isWl = (host) => {
        const h = String(host || '').toLowerCase().trim();
        if (!h) return true;
        return WL.some((d) => h === d || h.slice(-(d.length + 1)) === '.' + d);
      };
      window.addEventListener('click', (e) => {
        try {
          if (!S.outboundGuard) return;
          // 点击目标可能是文本/图片等，可能没有 closest；安全向上查找 <a>，避免抛异常跳过拦截
          let t = e.target;
          if (t && t.nodeType !== 1) t = t.parentElement;
          const a = (t && t.closest) ? t.closest('a[href]') : null;
          if (!a) return;
          const href = a.getAttribute('href') || '';
          if (!/^https?:\/\//i.test(href)) return;      // 仅拦截 http(s) 外链，页面内锚点/相对跳转放行
          let host;
          try { host = new URL(href).hostname; } catch (err) { return; }
          if (isWl(host)) return;                        // 白名单域：直接放行，不提示
          // 在 show confirm 之前就必须阻止默认导航与后续框架监听器（洛谷/Vue 常自行拦截并跳转，
          // 若此处不拦截会「当前页被改 + 新标签打开」双跳转）。
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!window.confirm('即将跳出洛谷有关网站，确定打开新页面访问「' + host + '」吗？')) return;
          const w = window.open(a.href, '_blank', 'noopener');
          // 弹窗被拦截时不改当前页：改用程序化目标=_blank 锚点新标签打开，避免任何路径把当前页带跳
          if (!w && a.href) {
            const t = document.createElement('a');
            t.href = a.href;
            t.target = '_blank';
            t.rel = 'noopener noreferrer';
            t.click();
          }
        } catch (err) {}
      }, true);
    } catch (e) {}
  }

  // 5. 文章 HTML 互动增强：识别 lg_user_html / 含 <meta 的代码块 替换为 iframe 内联运行
  function featureHtmlRunBlock() {
    try {
      if (!S.htmlRunBlock) return;
      const root = $('.lg-blog-content') || $('.lg-paste-content') || $('#app');
      if (!root) return;
      $all('pre', root).forEach((pre) => {
        try {
          if (pre.classList.contains('aml-html-run')) return;
          const code = pre.querySelector('code') || pre;
          const text = code.textContent || '';
          const isHtml = /lg_user_html/.test(code.className || '') || text.indexOf('<meta') >= 0 || text.indexOf('<!DOCTYPE') >= 0;
          if (!isHtml) return;
          const wrap = document.createElement('div');
          wrap.className = 'aml-html-run';
          wrap.innerHTML = '<button type="button" class="aml-html-run-label">▶ 运行这段 HTML</button>';
          pre.parentNode.replaceChild(wrap, pre);
          wrap.querySelector('.aml-html-run-label').addEventListener('click', () => {
            if (wrap.dataset.loaded) return;
            wrap.dataset.loaded = '1';
            const ifr = document.createElement('iframe');
            ifr.className = 'aml-html-run-frame';
            ifr.setAttribute('sandbox', 'allow-scripts');
            ifr.srcdoc = text;
            const lb = wrap.querySelector('.aml-html-run-label');
            lb.textContent = '运行中 ↑';
            wrap.appendChild(ifr);
          });
        } catch (e) {}
      });
    } catch (e) {}
  }

  // 6. 用户主页等级分曲线（原生 SVG polyline，数据源为准插件同款：#lentille-context → data.elo）
  // 兼容多种数据形态：data.elo / ratingHistory / rating_history / elo 数组（[时间, 等级] 或 {rating})
  function extractRatingData() {
    try {
      const node = document.querySelector('#lentille-context textarea, #lentille-context');
      const raw = (node && (node.value || node.textContent)) || '';
      let obj = null;
      try { obj = JSON.parse(raw); } catch (e) {
        const m = raw.match(/\{[\s\S]*"elo"\s*:[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
      }
      let elo = null;
      if (obj && obj.data) {
        elo = obj.data.elo || obj.data.ratingHistory || obj.data.rating_history ||
              obj.data.eloHistory || obj.data.rating;
      }
      if (!Array.isArray(elo)) {
        elo = (obj && (obj.elo || obj.ratingHistory || obj.rating_history));
      }
      if (!Array.isArray(elo) || elo.length < 2) return null;
      const out = [];
      elo.forEach((e) => {
        if (Array.isArray(e) && e.length >= 2 && typeof e[1] === 'number') out.push([e[0] || 0, e[1]]);
        else if (e && typeof e.rating === 'number') out.push([e.time || e.startTime || 0, e.rating]);
      });
      if (out.length < 2) return null;
      out.sort((a, b) => a[0] - b[0]); // 按时间排序（对应插件排序逻辑）
      return out;
    } catch (e) { return null; }
  }
  // —— 等级分曲线：还原自「洛谷等级分预测」原插件代码（ECharts 版本） ——
  function isoToUnix(iso) { return new Date(iso).getTime() / 1000; }
  function formatTime(ts) {
    const d = new Date((ts + 8 * 3600) * 1000);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;
  }
  function loadECharts(cb) {
    if (window.echarts) { try { cb(); } catch (e) {} return; }
    // 依次尝试多个 CDN（经 background 代理加载），国内直连 jsdelivr 常失败，需回退到 npmmirror/bootcdn 等
    const CDNS = [
      'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js',
      'https://registry.npmmirror.com/echarts/5.4.3/files/dist/echarts.min.js',
      'https://cdn.staticfile.net/echarts/5.4.3/echarts.min.js',
      'https://cdn.bootcdn.net/ajax/libs/echarts/5.4.3/echarts.min.js'
    ];
    let idx = 0;
    function tryNext() {
      if (window.echarts) { try { cb(); } catch (e) {} return; }
      if (idx >= CDNS.length) return;
      const url = CDNS[idx++];
      xhr({ url: url, method: 'GET' }).then((res) => {
        const txt = (res && res.text) || '';
        // 校验拉取的是 echarts 脚本而非 CDN 的报错页/索引页
        if (!/echarts|ECharts/i.test(txt)) { tryNext(); return; }
        try {
          const s = document.createElement('script');
          s.textContent = txt;
          document.head.appendChild(s);
          // 注入后仍校验 echarts 是否真正可用，否则继续换源
          setTimeout(() => {
            if (window.echarts) { try { cb(); } catch (e) {} }
            else tryNext();
          }, 0);
        } catch (e) { tryNext(); }
      }).catch(tryNext);
    }
    tryNext();
  }
  function parseRatingHistory() {
    const contextEl = document.getElementById('lentille-context');
    if (!contextEl) throw new Error('未找到 #lentille-context');
    const parsed = JSON.parse(contextEl.textContent);
    return parsed && parsed.data ? parsed.data.elo : null;
  }
  function fetchUserPredictions(uid) {
    // 同原插件：gmRequest => 经 background 代理 xhr
    return xhr({ url: 'https://luogu.ac.cn/api/v1/user/' + uid + '/rating-predictions', method: 'GET' })
      .then((res) => {
        if (!res || !res.text) return { items: [] };
        return JSON.parse(res.text);
      })
      .catch(() => ({ items: [] }));
  }
  function buildRatingFullData(history, predictions) {
    const sortedHistory = history.slice().sort((a, b) => a.time - b.time).map(item => ({
      ...item,
      previousRating: item.rating - (item.prevDiff || 0)
    }));
    const rawItems = (predictions && predictions.items) || [];
    const validItems = rawItems.filter(item => {
      const warnings = item.warnings || [];
      return !warnings.some(w => w.indexOf('赛前等级分不低于本场等级分阈值') !== -1);
    });
    const predData = validItems.map(item => ({
      isPredicted: true,
      rating: item.predicted_rating,
      time: isoToUnix(item.end_time),
      latest: false,
      contest: {
        id: item.contest_id,
        startTime: isoToUnix(item.start_time),
        endTime: isoToUnix(item.end_time),
        name: item.contest_name
      },
      userCount: 0,
      prevDiff: item.predicted_delta,
      previous: {
        rating: item.predicted_rating - item.predicted_delta,
        time: null,
        latest: false,
        contest: null,
        userCount: 0,
        prevDiff: null
      },
      previousRating: item.predicted_rating - item.predicted_delta,
      warnings: item.warnings || []
    }));
    const full = sortedHistory.concat(predData);
    full.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      return (a.previousRating || 0) - (b.previousRating || 0);
    });
    if (full.length > 0 && full[0].isPredicted) {
      full[0].isFirst = true;
    } else {
      let firstHistoricalFound = false;
      for (const item of full) {
        if (!item.isPredicted && !firstHistoricalFound) { item.isFirst = true; firstHistoricalFound = true; break; }
      }
    }
    const firstPredIdx = full.findIndex(d => d.isPredicted);
    if (firstPredIdx > 0) {
      const prevItem = full[firstPredIdx - 1];
      if (prevItem && !prevItem.isPredicted) {
        full.splice(firstPredIdx, 0, { ...prevItem, isPredicted: true, isPlaceholder: true });
      }
    }
    return full;
  }
  function ratingPageType() {
    const path = window.location.pathname;
    const match = path.match(/^\/user\/(\d+)/);
    if (!match) return '';
    const rest = path.substring(match[0].length);
    if (rest === '' || rest === '/') return 'profile';
    if (/^\/user\/\d+\/practice/.test(path)) return 'practice';
    return '';
  }
  function prepareRatingContainer(pageType) {
    let existingCard = document.querySelector('div.l-card:has(#rating-chart)');
    if (!existingCard) {
      const cards = document.querySelectorAll('div.l-card');
      for (const card of cards) {
        const header = card.querySelector('.header h3.lfe-h3');
        if (header && header.textContent.trim() === '比赛等级分趋势图') { existingCard = card; break; }
      }
    }
    if (existingCard) {
      const header = existingCard.querySelector('.header');
      while (existingCard.firstChild) existingCard.removeChild(existingCard.firstChild);
      if (header) existingCard.appendChild(header);
      const chartDiv = document.createElement('div');
      chartDiv.id = 'rating-chart';
      chartDiv.style.cssText = 'width: 100%; height: 320px;';
      existingCard.appendChild(chartDiv);
      return chartDiv;
    }
    const card = document.createElement('div');
    card.className = 'l-card';
    card.style.marginBottom = '20px';
    // 与原插件一致：补齐洛谷 Vue 作用域属性，使 .l-card 白框背景生效
    card.setAttribute('data-v-176b97b3', '');
    card.setAttribute('data-v-d3b68fa4', '');
    card.setAttribute('data-v-4ad5148e', '');
    card.setAttribute('data-v-754e1ea4-s', '');
    const header = document.createElement('div');
    header.className = 'header';
    header.setAttribute('data-v-03592857', '');
    const h3 = document.createElement('h3');
    h3.className = 'lfe-h3';
    h3.textContent = '比赛等级分趋势图';
    h3.setAttribute('data-v-03592857', '');
    header.appendChild(h3);
    card.appendChild(header);
    const span = document.createElement('span');
    span.className = 'lfe-caption';
    span.textContent = '选中记录后可打开比赛页面';
    span.setAttribute('data-v-03592857', '');
    header.appendChild(span);
    card.appendChild(header);
    const chartDiv2 = document.createElement('div');
    chartDiv2.id = 'rating-chart';
    chartDiv2.setAttribute('data-v-03592857', '');
    chartDiv2.style.cssText = 'width: 100%; height: 320px;';
    card.appendChild(chartDiv2);
    let inserted = false;
    if (pageType === 'profile') {
      // 等级分曲线固定放在右侧主列「做题趋势热度图」之后
      // （用户数据卡已移至左侧「用户信息」卡下方，不再作为本卡锚点）
      const allCards = document.querySelectorAll('.l-card');
      let refCard = null;
      for (const c of allCards) {
        const h = c.querySelector('.header h3');
        if (h && h.textContent.trim().indexOf('做题趋势热度图') !== -1) { refCard = c; break; }
      }
      if (refCard) { refCard.insertAdjacentElement('afterend', card); inserted = true; }
    } else if (pageType === 'practice') {
      const container = document.querySelector('.user-main') || document.body;
      let targetCard = null;
      for (const c of container.querySelectorAll('.l-card')) {
        const emptyBlock = c.querySelector('.empty-block');
        if (emptyBlock) {
          const h = emptyBlock.querySelector('h3.title');
          if (h && h.textContent.trim() === '该用户设置了完全隐私保护，无法查看练习记录') { targetCard = c; break; }
        }
        const directH3 = c.querySelector('h3.lfe-h3');
        if (directH3 && directH3.textContent.trim() === '尝试过的题目') { targetCard = c; break; }
      }
      if (targetCard) targetCard.insertAdjacentElement('beforebegin', card);
      inserted = true;
    }
    if (!inserted) return null;
    return chartDiv2;
  }
  // 自包含 SVG 等级分趋势图：洛谷页面 CSP(script-src) 禁止执行注入的内联脚本，echarts 无法加载，
  // 故改用纯 SVG 重绘，不依赖外部库；用图例明确区分「历史/预测」两条线。
  function renderRatingSvg(container, data) {
    if (!container) return;
    const esc3 = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const W = Math.max((container.clientWidth || window.innerWidth - 40 || 720), 240);
    const H = 320, PL = 44, PR = 16, PT = 22, PB = 34;
    const iw = W - PL - PR, ih = H - PT - PB;
    const pts = data.slice();
    if (!pts.length) { container.innerHTML = '<div style="text-align:center;color:#aaa;padding:60px 0;">暂无等级分数据</div>'; return; }
    const times = pts.map(d => d.time * 1000);
    const raws = pts.map(d => d.rating);
    const tMin = Math.min(...times), tMax = Math.max(...times);
    const spanT = (tMax - tMin) || 1;
    const rMax = Math.max(...raws);
    const yMax = Math.ceil(Math.max(rMax * 1.1, 400) / 400) * 400;
    const yMin = 0;
    const X = (t) => PL + (t - tMin) / spanT * iw;
    const Y = (r) => PT + (yMax - r) / (yMax - yMin) * ih;

    // 网格 + Y 轴刻度
    let grid = '';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const r = yMin + (yMax - yMin) * i / steps;
      const y = Y(r);
      grid += '<line x1="' + PL + '" y1="' + y + '" x2="' + (W - PR) + '" y2="' + y + '" stroke="#ececec" stroke-width="1"/>';
      grid += '<text x="' + (PL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#888">' + Math.round(r) + '</text>';
    }
    // X 轴刻度（最多 6 个 年月）
    let xgrid = '';
    for (let i = 0; i <= 6; i++) {
      const t = tMin + spanT * i / 6;
      const x = X(t);
      const d = new Date(t);
      xgrid += '<text x="' + x + '" y="' + (H - PB + 16) + '" text-anchor="middle" font-size="11" fill="#888">' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '</text>';
    }
    const pathStr = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + X(p.time * 1000) + ',' + Y(p.rating)).join('');
    const hist = pts.filter(d => !d.isPredicted);
    const pred = pts.filter(d => d.isPredicted);
    const histPath = hist.length ? pathStr(hist) : '';
    const predPath = pred.length ? pathStr(pred) : '';

    // 点 + 悬停 title + 点击跳转比赛页
    let marks = '';
    pts.forEach(p => {
      if (p.isPlaceholder) return;
      const x = X(p.time * 1000), y = Y(p.rating);
      const cid = (p.contest && p.contest.id) || '';
      const isMax = p.isHistoricalMax || p.isPredictedMax;
      const color = p.isPredicted ? (p.isPredictedMax ? '#f08007' : '#5dade2') : (p.isHistoricalMax ? '#e74c3c' : '#5dade2');
      const nm = (p.contest && p.contest.name) || '';
      const tip = nm + (p.isFirst ? '（首战）' : '') + '  等级分:' + Math.round(p.rating) + (p.isPredicted ? '  [预测]' : '');
      marks += '<g data-contest="' + esc3(cid) + '">'
        + '<circle cx="' + x + '" cy="' + y + '" r="11" fill="transparent"/>'
        + '<circle cx="' + x + '" cy="' + y + '" r="' + (isMax ? 6 : 4) + '" fill="#fff" stroke="' + color + '" stroke-width="2.5"/>'
        + '<title>' + esc3(tip) + '</title>'
        + '</g>';
    });

    const legend = '<rect x="' + (W - PR - 186) + '" y="4" width="178" height="22" rx="5" fill="rgba(255,255,255,0.85)" stroke="#eee"/>'
      + '<line x1="' + (W - PR - 172) + '" y1="15" x2="' + (W - PR - 134) + '" y2="15" stroke="#5dade2" stroke-width="2.5"/>'
      + '<text x="' + (W - PR - 124) + '" y="19" font-size="11" fill="#555">历史</text>'
      + '<line x1="' + (W - PR - 90) + '" y1="15" x2="' + (W - PR - 52) + '" y2="15" stroke="#5dade2" stroke-width="2" stroke-dasharray="6 4" opacity="0.7"/>'
      + '<text x="' + (W - PR - 42) + '" y="19" font-size="11" fill="#555">预测</text>';

    container.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="display:block;width:100%;">'
      + grid + xgrid
      + (histPath ? '<path d="' + histPath + '" fill="none" stroke="#5dade2" stroke-width="2.5"/>' : '')
      + (predPath ? '<path d="' + predPath + '" fill="none" stroke="#5dade2" stroke-width="2.5" stroke-dasharray="8 6" opacity="0.7"/>' : '')
      + marks + legend
      + '</svg>';
    container.addEventListener('click', (ev) => {
      const g = ev.target && ev.target.closest && ev.target.closest('g[data-contest]');
      if (g && g.dataset.contest) window.open('https://www.luogu.com.cn/contest/' + g.dataset.contest, '_blank');
    });
  }

  function renderRatingChart(container, data) {
    if (!container || !window.echarts) return;
    const myChart = echarts.init(container);
    const historicalData = data.filter(d => !d.isPredicted);
    const historicalMax = historicalData.length > 0 ? Math.max(...historicalData.map(d => d.rating)) : 0;
    const predictedData = data.filter(d => d.isPredicted && !d.isPlaceholder);
    const predictedMax = predictedData.length > 0 ? Math.max(...predictedData.map(d => d.rating)) : -Infinity;
    const showPredictedMax = predictedMax >= historicalMax;
    data.forEach(item => {
      if (!item.isPredicted) item.isHistoricalMax = (item.rating === historicalMax);
      else item.isPredictedMax = (item.rating === predictedMax && showPredictedMax);
    });
    const historical = data.filter(d => !d.isPredicted);
    const predictedFull = data.filter(d => d.isPredicted);
    const maxRating = Math.max(...data.map(d => d.rating));
    const yMax = Math.ceil(maxRating / 400) * 400 || 400;
    function buildSeriesItems(arr, isPredictedSeries) {
      return arr.map(item => {
        const base = {
          value: [item.time * 1000, item.rating],
          symbol: item.isPlaceholder ? 'none' : 'circle',
          symbolSize: 5,
          rawInfo: item
        };
        if (isPredictedSeries) {
          if (item.isPlaceholder) { base.itemStyle = { color: 'transparent', borderColor: 'transparent' }; }
          else if (item.isPredictedMax) { base.itemStyle = { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(240,112,7,0.6)', borderWidth: 2 }; }
          else { base.itemStyle = { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(93,173,226,0.6)', borderWidth: 1.5 }; }
        } else {
          if (item.isHistoricalMax) { base.itemStyle = { color: '#fff', borderColor: '#e74c3c', borderWidth: 2 }; }
          else { base.itemStyle = { color: '#fff', borderColor: '#5dade2', borderWidth: 2 }; }
        }
        return base;
      });
    }
    const option = {
      grid: { left: 0, right: 15, top: 25, bottom: 20, containLabel: true },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#ccc' } },
        axisLabel: { color: '#555', fontSize: 12, formatter: function (value) { const d = new Date(value); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value', min: 0, max: yMax, interval: 400,
        axisLine: { show: false }, axisLabel: { color: '#555', fontSize: 12 },
        splitLine: { show: true, lineStyle: { color: '#e0e0e0', type: 'solid' } }
      },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(42,42,42,0.95)', borderColor: 'transparent',
        borderRadius: 4, padding: [12, 16], textStyle: { color: '#fff' },
        formatter: function (params) {
          const item = params.data.rawInfo;
          if (!item || item.isPlaceholder) return '';
          const isPred = item.isPredicted || false;
          const Prefix = isPred ? '[预测] ' : '';
          const start = formatTime(item.contest.startTime);
          const end = formatTime(item.contest.endTime);
          let ratingDisplay = '';
          if (item.isFirst) {
            ratingDisplay = '等级分：<span style="color:#fff; font-weight:bold;">' + item.rating + '</span>';
          } else {
            let prevRating = 0, diff = 0;
            if (item.previous && item.previous.rating !== undefined) { prevRating = item.previous.rating; diff = item.prevDiff || 0; }
            else { prevRating = item.rating - (item.prevDiff || 0); diff = item.prevDiff || 0; }
            let diffColor, diffDisplay;
            if (diff === 0) { diffColor = '#888'; diffDisplay = '±0'; }
            else if (diff > 0) { diffColor = '#4caf50'; diffDisplay = '+' + diff; }
            else { diffColor = '#e74c3c'; diffDisplay = diff; }
            ratingDisplay = '等级分：<span style="color:#fff; font-weight:bold;">' + prevRating + '</span><span style="color:' + diffColor + '; font-weight:bold;"> ' + diffDisplay + '</span> = <span style="color:#fff; font-weight:bold;">' + item.rating + '</span>';
          }
          let extraText = '';
          if (item.isHistoricalMax) extraText += '<div style="font-style:italic; color:#fff; margin-top:4px;">达成历史最高</div>';
          if (item.isPredictedMax) extraText += '<div style="font-style:italic; color:#fff; margin-top:4px;">预计达成历史最高</div>';
          if (item.warnings && item.warnings.length > 0) {
            for (const warn of item.warnings) extraText += '<div style="color:rgb(170,170,170); margin-top:2px;">ⓘ ' + warn + '</div>';
          }
          return '<div style="font-size:14px; font-weight:bold; margin-bottom:4px;">' + item.contest.name + '</div>' +
            '<div style="font-size:12px; color:#a0a0a0; margin-bottom:6px;">' + start + ' ~ ' + end + '</div>' +
            '<div style="font-size:14px;">' + Prefix + ratingDisplay + '</div>' + extraText;
        }
      },
      series: [
        { name: '历史比赛', type: 'line', data: buildSeriesItems(historical, false), smooth: false, lineStyle: { type: 'solid', color: '#5dade2', width: 2.5 }, animationDuration: 1500, animationEasing: 'cubicOut' },
        { name: '预测比赛', type: 'line', data: buildSeriesItems(predictedFull, true), smooth: false, lineStyle: { type: 'dashed', color: '#5dade2', width: 2.5, dash: [8, 6], opacity: 0.6 }, animationDuration: 1500, animationEasing: 'cubicOut' }
      ]
    };
    myChart.setOption(option);
    myChart.on('click', function (params) {
      const item = params.data && params.data.rawInfo;
      if (!item || item.isPlaceholder) return;
      const contestId = item.contest && item.contest.id;
      if (contestId) window.open('https://www.luogu.com.cn/contest/' + contestId, '_blank');
    });
    const resizeHandler = function () { try { myChart.resize(); } catch (e) {} };
    window.addEventListener('resize', resizeHandler);
    const observer = new ResizeObserver(resizeHandler);
    observer.observe(container);
  }
  async function featureRatingCurve() {
    try {
      if (!S.ratingCurve) return;
      const pageType = ratingPageType();
      if (pageType !== 'profile' && pageType !== 'practice') return;
      if (document.getElementById('rating-chart')) return;
      // 与原插件 tts.txt /user/ 部分一致：先等 #lentille-context（历史等级分数据）就绪再解析，
      // 避免 SPA 首帧节点缺失导致静默失败、图表完全不显示。
      const ctxReady = await new Promise((resolve) => {
        const start = Date.now();
        (function poll() {
          if (document.getElementById('lentille-context')) return resolve(true);
          if (Date.now() - start > 6000) return resolve(false);
          setTimeout(poll, 200);
        })();
      });
      if (!ctxReady) return;
      (async function () {
          try {
            const uid = (window.location.pathname.match(/\/user\/(\d+)/) || [])[1];
            if (!uid) return;
            let history;
            try { history = parseRatingHistory(); }
            catch (e) { return; }
            let predictions = { items: [] };
            let fetchError = false;
            try { predictions = await fetchUserPredictions(uid); }
            catch (e) { fetchError = true; predictions = { items: [] }; }
            const fullData = buildRatingFullData(history || [], predictions);
            if (!fullData.length) return;
            const chartDiv = prepareRatingContainer(pageType);
            if (!chartDiv) return;
            await new Promise(resolve => setTimeout(resolve, 100));
            renderRatingSvg(chartDiv, fullData);
            const card = chartDiv.parentNode;
            if (!card) return;
            const hasPrediction = fullData.some(d => d.isPredicted && !d.isPlaceholder);
            let showFooter = false, footerText = '';
            if (fetchError) { showFooter = true; footerText = '获取预测数据失败，只显示历史比赛数据'; }
            else if (hasPrediction) { showFooter = true; footerText = '虚线部分为预测，不代表最终等级分变动<br>数据来源：洛谷档案馆 luogu.ac.cn'; }
            const oldFooter = card.querySelector('.rating-footer');
            if (oldFooter) oldFooter.remove();
            if (showFooter) {
              const footer = document.createElement('div');
              footer.className = 'rating-footer';
              footer.style.cssText = 'margin-top: 8px; font-size: 12px; color: #999; text-align: right; border-top: 1px solid #f0f0f0; padding: 8px 20px 0 20px;';
              footer.innerHTML = '<span style="display:inline-block; background:#eee; border-radius:50%; width:16px; height:16px; line-height:16px; text-align:center; color:#666; font-weight:bold; margin-right:4px;">!</span>' + footerText;
              card.appendChild(footer);
            }
          } catch (e) {}
        })();
    } catch (e) {}
  }

  // ============ 比赛记分板等级分预测（还原自「洛谷等级分预测」原插件 tts.txt /contest/ 部分） ============
  // 仅把原插件 GM_xmlhttpRequest 换成经 background 代理的 xhr，其余逻辑逐行对齐原插件。
  let contestPredInit = false;
  function featureContestPrediction() {
    try {
      if (!S.contestPrediction) return;
      const m = window.location.pathname.match(/^\/contest\/(\d+)/);
      if (!m) return;
      const contestId = m[1];
      if (document.body.dataset.amlContestPred === contestId) {
        // 已初始化：仍需响应 hash 变化（重新进 scoreboard 时重跑渲染）
        if (window.location.hash.includes('scoreboard') && contestPredInitialized) {
          try { contestPredFill(); } catch (e) {}
        }
        return;
      }
      document.body.dataset.amlContestPred = contestId;
      const CACHE_KEY = 'luogu_contest_pred_cache';
      const PAGE_SIZE = 100;
      function getCacheTTL(mode) { return mode === 'official' ? 15 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; }
      let ratingMode = null;
      let dataMap = {};
      let isAllFetched = false;
      let isLoading = false;
      let initialized = false;
      let isUnrated = false;
      let initLock = false;
      let domCheckTimer = null;
      let fail = 0;
      let height = -1;
      window.contestPredInitialized = false;
      window.contestPredFill = function () { try { fillCurrentRows(); } catch (e) {} };
      // -------- 缓存 --------
      function getCache() { try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; } }
      function setCache(cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {} }
      function gmRequest(url) {
        return xhr({ url: url, method: 'GET' }).then((res) => {
          if (!res || !res.text) throw new Error('empty response');
          return JSON.parse(res.text);
        });
      }
      function getRowBackgroundColor(row) {
        const userDiv = row.querySelector('.user');
        if (userDiv) { const bg = userDiv.style.backgroundColor; if (bg) return bg; }
        return null;
      }
      function fetchContestPredictions(page) {
        const url = 'https://luogu.ac.cn/api/v1/contest/' + contestId + '?page=' + page + '&page_size=' + PAGE_SIZE;
        return gmRequest(url);
      }
      function removePredictionUI() {
        const headerRow = document.querySelector('.header-wrap .header');
        if (headerRow) {
          const oldHeader = headerRow.querySelector('.header-container[data-prediction-header]');
          if (oldHeader) oldHeader.remove();
        }
        const rows = document.querySelectorAll('.row-wrap .row');
        rows.forEach(row => {
          const cell = row.querySelector('.problem[data-prediction-cell]');
          if (cell) cell.remove();
        });
      }
      function removeFooter() {
        const footer = document.querySelector('#prediction-footer');
        if (footer) footer.remove();
      }
      function setCellFullHeight(cell, row) {
        if (!cell || !row) return;
        if (height === -1) height = row.clientHeight;
        if (height > 0) {
          cell.style.height = height + 'px';
          cell.style.minHeight = height + 'px';
          cell.style.boxSizing = 'border-box';
        } else {
          cell.style.height = '100%';
          cell.style.minHeight = '100%';
          cell.style.alignSelf = 'stretch';
        }
      }
      function fillCurrentRows() {
        if (!window.location.hash.includes('scoreboard')) return;
        if (isUnrated) { removePredictionUI(); removeFooter(); return; }
        if (fail === 2) { removePredictionUI(); updateFooter(); return; }
        const rows = document.querySelectorAll('.row-wrap .row');
        if (rows.length === 0) return;
        ensureHeader();
        rows.forEach(row => {
          let cell = row.querySelector('.problem[data-prediction-cell]');
          if (!cell) {
            cell = document.createElement('div');
            cell.className = 'problem';
            cell.dataset.predictionCell = 'true';
            cell.style.cssText = 'flex: 0 0 80px; display: flex; flex-direction: column; justify-content: center; align-items: center;';
            row.appendChild(cell);
          }
          setCellFullHeight(cell, row);
          const bgColor = getRowBackgroundColor(row);
          if (bgColor) cell.style.backgroundColor = bgColor;
          else cell.style.backgroundColor = '';
          const uid = getUidFromRow(row);
          if (!uid) {
            cell.innerHTML = '';
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'td-score';
            scoreDiv.textContent = '-';
            cell.appendChild(scoreDiv);
            const runtimeDiv = document.createElement('div');
            runtimeDiv.className = 'td-runtime';
            runtimeDiv.textContent = '';
            cell.appendChild(runtimeDiv);
            return;
          }
          const info = dataMap[uid];
          if (!info) {
            cell.innerHTML = '';
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'td-score';
            const placeholder = document.createElement('span');
            placeholder.textContent = '获取中...';
            placeholder.style.color = 'rgba(0,0,0,0.55)';
            placeholder.style.fontSize = '13px';
            scoreDiv.appendChild(placeholder);
            cell.appendChild(scoreDiv);
            const runtimeDiv = document.createElement('div');
            runtimeDiv.className = 'td-runtime';
            runtimeDiv.textContent = '\u00A0';
            cell.appendChild(runtimeDiv);
            return;
          }
          const delta = info.delta;
          const newRating = info.newRating;
          const warnings = info.warnings || [];
          cell.innerHTML = '';
          const scoreDiv = document.createElement('div');
          scoreDiv.className = 'td-score';
          const deltaSpan = document.createElement('span');
          deltaSpan.style.fontWeight = 'bold';
          if (delta === null || delta === undefined) {
            deltaSpan.textContent = '-';
            deltaSpan.style.color = 'rgba(0,0,0,0.55)';
          } else if (delta > 0) {
            deltaSpan.style.color = 'rgb(82, 196, 26)';
            deltaSpan.textContent = '+' + delta;
          } else if (delta < 0) {
            deltaSpan.style.color = 'rgb(231, 76, 60)';
            deltaSpan.textContent = '' + delta;
          } else {
            deltaSpan.style.color = 'rgba(0,0,0,0.55)';
            deltaSpan.textContent = '±0';
          }
          scoreDiv.appendChild(deltaSpan);
          if (warnings.length > 0) {
            const warnIcon = document.createElement('span');
            warnIcon.textContent = ' ⓘ';
            warnIcon.style.cursor = 'help';
            warnIcon.style.fontSize = '14px';
            warnIcon.style.color = 'rgba(0,0,0,0.55)';
            warnIcon.title = warnings.join('\n');
            scoreDiv.appendChild(warnIcon);
          }
          cell.appendChild(scoreDiv);
          const runtimeDiv = document.createElement('div');
          runtimeDiv.className = 'td-runtime';
          if (newRating !== null && newRating !== undefined) {
            runtimeDiv.textContent = '新: ' + newRating;
            runtimeDiv.style.color = 'rgba(0,0,0,0.55)';
            runtimeDiv.style.fontSize = '12px';
          } else {
            runtimeDiv.textContent = '\u00A0';
          }
          cell.appendChild(runtimeDiv);
        });
        updateFooter();
      }
      function getUidFromRow(row) {
        const link = row.querySelector('.user a[href^="/user/"]');
        if (link) {
          const match = link.href.match(/\/user\/(\d+)/);
          return match ? match[1] : null;
        }
        return null;
      }
      async function loadData() {
        if (isLoading || isUnrated || fail === 2) return;
        if (isAllFetched) { fillCurrentRows(); return; }
        isLoading = true;
        fail = 0;
        try {
          const firstPageData = await fetchContestPredictions(1);
          if (!firstPageData || !firstPageData.contest) throw new Error('无法获取比赛信息');
          const currentRatingMode = firstPageData.contest.rating_mode || null;
          if (currentRatingMode === 'unrated') {
            ratingMode = currentRatingMode;
            isUnrated = true;
            removePredictionUI();
            isLoading = false;
            return;
          }
          const cache = getCache();
          const now = Date.now();
          const cachedEntry = cache[contestId];
          if (cachedEntry) {
            const cachedMode = cachedEntry.ratingMode;
            const cachedTime = cachedEntry.timestamp;
            const ttl = getCacheTTL(cachedMode);
            if (cachedMode === currentRatingMode && (now - cachedTime < ttl)) {
              ratingMode = cachedMode;
              isUnrated = (ratingMode === 'unrated');
              const cachedData = cachedEntry.data || [];
              cachedData.forEach(item => {
                dataMap[String(item.uid)] = { delta: item.delta, newRating: item.rating, warnings: item.warnings || [] };
              });
              isAllFetched = true;
              isLoading = false;
              fillCurrentRows();
              return;
            }
          }
          ratingMode = currentRatingMode;
          isUnrated = false;
          const firstItems = firstPageData.items || [];
          firstItems.forEach(item => {
            dataMap[String(item.uid)] = { delta: item.delta, newRating: item.rating, warnings: item.warnings || [] };
          });
          ensureHeader();
          fillCurrentRows();
          let total = firstPageData.total || 0;
          let page = 2;
          while (true) {
            if (Object.keys(dataMap).length >= total) break;
            const data = await fetchContestPredictions(page);
            const items = data.items || [];
            if (items.length === 0) break;
            items.forEach(item => {
              dataMap[String(item.uid)] = { delta: item.delta, newRating: item.rating, warnings: item.warnings || [] };
            });
            fillCurrentRows();
            total = data.total || total;
            page++;
          }
          const allData = Object.keys(dataMap).map(uid => ({
            uid: parseInt(uid),
            delta: dataMap[uid].delta,
            rating: dataMap[uid].newRating,
            warnings: dataMap[uid].warnings
          }));
          cache[contestId] = { data: allData, ratingMode: ratingMode, timestamp: Date.now() };
          setCache(cache);
          isAllFetched = true;
        } catch (e) {
          const cache = getCache();
          const cachedEntry = cache[contestId];
          if (cachedEntry && cachedEntry.data) {
            fail = 1;
            const cachedData = cachedEntry.data || [];
            cachedData.forEach(item => {
              dataMap[String(item.uid)] = { delta: item.delta, newRating: item.rating, warnings: item.warnings || [] };
            });
            isAllFetched = true;
            fillCurrentRows();
          } else {
            fail = 2;
          }
        } finally {
          isLoading = false;
          fillCurrentRows();
        }
      }
      function ensureHeader() {
        if (isUnrated) {
          const headerRow = document.querySelector('.header-wrap .header');
          if (headerRow) {
            const oldHeader = headerRow.querySelector('.header-container[data-prediction-header]');
            if (oldHeader) oldHeader.remove();
          }
          return;
        }
        const headerRow = document.querySelector('.header-wrap .header');
        if (!headerRow) return;
        const oldHeader = headerRow.querySelector('.header-container[data-prediction-header]');
        if (oldHeader) oldHeader.remove();
        let headerHtml = '';
        let titleText = '';
        if (ratingMode === 'prediction') {
          headerHtml = '<span>Δ</span><span style="color:rgba(0,0,0,0.55);font-size:11px;display:block;">（预测）</span>';
          titleText = '等级分变动（预测结果，仅供参考）';
        } else if (ratingMode === 'official') {
          headerHtml = '<span>Δ</span>';
          titleText = '等级分变动（正式结果）';
        } else {
          headerHtml = '<span>Δ</span>';
          titleText = '等级分变动';
        }
        const newHeader = document.createElement('div');
        newHeader.className = 'header-container';
        newHeader.dataset.predictionHeader = 'true';
        newHeader.style.cssText = 'flex: 0 0 80px; text-align: center; display: flex; flex-direction: column; justify-content: center; cursor: help;';
        newHeader.title = titleText;
        newHeader.innerHTML = headerHtml;
        headerRow.appendChild(newHeader);
      }
      function updateFooter() {
        if (isUnrated) { const f = document.querySelector('#prediction-footer'); if (f) f.remove(); return; }
        let footer = document.querySelector('#prediction-footer');
        if (!footer) {
          const container = document.querySelector('.l-card') || document.querySelector('main');
          if (!container) return;
          footer = document.createElement('div');
          footer.id = 'prediction-footer';
          footer.style.cssText = 'padding: 8px 16px; font-size: 12px; color: #999; text-align: right; border-top: 1px solid #eee; margin-top: 8px;';
          container.appendChild(footer);
        }
        if (fail === 2) { footer.textContent = '等级分预测：获取数据失败'; return; }
        const cache = getCache();
        const entry = cache[contestId];
        if (entry) {
          const d = new Date(entry.timestamp);
          const timeStr = d.toLocaleString('zh-CN', { hour12: false });
          const modeStr = entry.ratingMode ? ' (' + entry.ratingMode + ')' : '';
          const ttl = getCacheTTL(entry.ratingMode);
          const ttlHours = Math.round(ttl / (60 * 60 * 1000));
          const ttlDisplay = ttlHours >= 24 ? Math.round(ttlHours / 24) + ' 天' : ttlHours + ' 小时';
          footer.textContent = '等级分预测：数据最后更新于 ' + timeStr + modeStr;
          if (fail === 1) footer.textContent += '（缓存刷新失败）';
          else footer.textContent += '（缓存 ' + ttlDisplay + '）';
          footer.textContent += '  数据来源：洛谷档案馆 luogu.ac.cn';
        } else {
          footer.textContent = '等级分预测：暂无缓存数据';
        }
      }
      async function init() {
        if (initialized) {
          if (isAllFetched) fillCurrentRows();
          else loadData();
          return;
        }
        initialized = true;
        window.contestPredInitialized = true;
        if (!document.querySelector('.row-wrap .row')) {
          await new Promise(resolve => {
            const observer = new MutationObserver(() => {
              if (document.querySelector('.row-wrap .row')) { observer.disconnect(); resolve(); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(); }, 5000);
          });
        }
        setupObserver();
        await loadData();
      }
      function setupObserver() {
        const target = document.querySelector('.row-wrap') || document.querySelector('main');
        if (!target) return;
        let timer = null;
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (isUnrated) { removePredictionUI(); return; }
            if (isAllFetched || isLoading) fillCurrentRows();
            else loadData();
          }, 500);
        });
        observer.observe(target, { childList: true, subtree: true, attributes: false, characterData: false });
      }
      function triggerInit() {
        if (!window.location.hash.includes('scoreboard')) return;
        if (initLock) return;
        initLock = true;
        clearTimeout(domCheckTimer);
        domCheckTimer = setTimeout(() => {
          if (document.querySelector('.row-wrap .row')) {
            if (!initialized) init();
            else { if (isAllFetched) fillCurrentRows(); else loadData(); }
          } else {
            const observer = new MutationObserver((mutations, obs) => {
              if (document.querySelector('.row-wrap .row')) {
                obs.disconnect();
                if (!initialized) init();
                else { if (isAllFetched) fillCurrentRows(); else loadData(); }
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); }, 10000);
          }
          initLock = false;
        }, 300);
      }
      function startWatching() {
        window.addEventListener('hashchange', triggerInit);
        window.addEventListener('popstate', triggerInit);
        const targetNode = document.querySelector('#app') || document.querySelector('main') || document.body;
        const observer = new MutationObserver(() => {
          clearTimeout(window._domCheckTimer);
          window._domCheckTimer = setTimeout(() => { triggerInit(); }, 200);
        });
        observer.observe(targetNode, { childList: true, subtree: true });
        setInterval(() => { if (window.location.hash.includes('scoreboard')) triggerInit(); }, 2000);
      }
      startWatching();
      if (window.location.hash.includes('scoreboard')) {
        setTimeout(triggerInit, 500);
      }
    } catch (e) {}
  }

  // ============ 新增：学习 zigyvs1b 文章的功能 ============

  // 7. 命令面板：Ctrl+K 唤起，输入 help 查看命令列表（对应 runCommandEnabled）
  function featureRunCommand() {
    try {
      if (!S.runCommand || document.__amlCmdHooked) return;
      document.__amlCmdHooked = true;
      const CMDS = [
        { k: 'settings', t: '跳转设置页', fn: () => { location.href = 'https://www.luogu.com.cn/help'; } },
        { k: 'focus', t: '切换专注模式', fn: () => { S.focusMode = !S.focusMode; setStore({ [STORE_KEY]: S }); featureFocusMode(); toast(S.focusMode ? '专注模式开启' : '专注模式关闭'); } },
        { k: 'theme', t: '切换主题色为默认', fn: () => { S.themeColor = '#4f46e5'; applyTheme(); setStore({ [STORE_KEY]: S }); toast('主题色已重置'); } },
        { k: 'checkin', t: '前往签到', fn: () => { location.href = 'https://www.luogu.com.cn/'; } },
        { k: 'discuss', t: '前往讨论区', fn: () => { location.href = 'https://www.luogu.com.cn/discuss'; } },
        { k: 'problem', t: '随机跳题', fn: () => { if (S.problemRandom) featureRandomProblem(); else location.href = 'https://www.luogu.com.cn/problemset/'; } }
      ];
      document.addEventListener('keydown', (ev) => {
        if (ev.ctrlKey && ev.key.toLowerCase() === 'k') {
          ev.preventDefault();
          let box = $('.aml-cmd-palette');
          if (box) { box.remove(); return; }
          box = document.createElement('div');
          box.className = 'aml-cmd-palette';
          box.innerHTML =
            '<div class="aml-cmd-input-wrap">' +
              '<span class="aml-cmd-prompt">›</span>' +
              '<input class="aml-cmd-input" placeholder="输入命令，输入 help 查看命令列表" spellcheck="false">' +
            '</div>' +
            '<div class="aml-cmd-list"></div>';
          document.body.appendChild(box);
          const input = box.querySelector('.aml-cmd-input');
          const list = box.querySelector('.aml-cmd-list');
          function render(q) {
            q = (q || '').trim().toLowerCase();
            list.innerHTML = '';
            let items = CMDS;
            if (q) items = items.filter((c) => c.k.indexOf(q) >= 0 || c.t.indexOf(q) >= 0);
            if (q === 'help') {
              list.innerHTML = '<div class="aml-cmd-help">' + CMDS.map((c) => '<div><b>/' + c.k + '</b> ' + c.t + '</div>').join('') + '</div>';
              return;
            }
            if (!items.length) { list.innerHTML = '<div class="aml-cmd-help">没有匹配命令</div>'; return; }
            items.forEach((c) => {
              const item = document.createElement('div');
              item.className = 'aml-cmd-item';
              item.innerHTML = '<span>/' + c.k + '</span><span>' + c.t + '</span>';
              item.addEventListener('click', () => { try { c.fn(); } catch (e) {}; box.remove(); });
              list.appendChild(item);
            });
          }
          render('');
          input.addEventListener('input', () => render(input.value));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const v = input.value.trim().toLowerCase();
              const c = CMDS.find((x) => x.k === v);
              if (c) { try { c.fn(); } catch (e) {}; box.remove(); return; }
              render(v);
            }
            if (e.key === 'Escape') box.remove();
          });
          input.focus();
        }
      }, true);
    } catch (e) {}
  }

  // 8. 犇犇优化：自动展开全部内容（对应 autoExpandBenben）
  function featureAutoExpandBenben() {
    try {
      if (!S.autoExpandBenben) return;
      // 仅作用于犇犇动态流（#feed / .feed / .feed-li），不再用 [class*="more"]/[class*="bubble"]
      // 这类宽泛选择器，避免误点页面其它展开/加载元素造成意外跳转。
      // 1) 强制解除长犇犇的 CSS 截断，保证全文可见（不依赖 expand 控件存在与否）
      if (!document.getElementById('aml-benben-unclamp')) {
        const st = document.createElement('style');
        st.id = 'aml-benben-unclamp';
        st.textContent = '#feed .am-comment-bd,.feed .am-comment-bd,.feed-li .am-comment-bd{-webkit-line-clamp:unset!important;max-height:none!important;overflow:visible!important}';
        (document.head || document.body).appendChild(st);
      }
      // 2) 兜底点击犇犇流内真实存在的「展开」控件
      $all('#feed .expand,.feed .expand,.feed-li .expand,#feed .am-comment .expand')
        .forEach((el) => { try { el.click(); } catch (e) {} });
    } catch (e) {}
  }

  // 9. 限制首页讨论列表长度（对应 discussListLengthEnabled，默认 16 条）
  function featureDiscussList() {
    try {
      if (!S.discussList) return;
      // 仅首页生效
      if (location.pathname !== '/' && location.pathname !== '') return;
      const LIMIT = 16;
      let hosts = $all('.lg-discuss-list, [class*="discuss-list"], .lg-home [class*="post"]');
      hosts.forEach((h) => {
        const items = $all('li, [class*="item"], [class*="discuss"]', h).filter((el) => el.querySelector('a[href^="/discuss/"]'));
        if (items.length > LIMIT) items.slice(LIMIT).forEach((el) => el.style.display = 'none');
      });
    } catch (e) {}
  }

  // 10. 代码折叠、危险代码扫描、统一复制（对应 codeFolding）
  function featureCodeFolding() {
    try {
      if (!S.codeFolding) return;
      if (!document.querySelector('pre')) return;
      $all('pre').forEach((pre) => {
        try {
          if (pre.closest('.aml-code-fold')) return;
          const code = pre.querySelector('code') || pre;
          const text = (code.textContent || '');
          const lines = text.split('\n').length;
          if (lines > 45) {
            pre.classList.add('aml-code-fold');
            pre.style.maxHeight = '340px'; pre.style.overflow = 'hidden';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'aml-code-fold-btn';
            btn.textContent = '展开（' + lines + ' 行）';
            btn.addEventListener('click', () => {
              pre.style.maxHeight = 'none';
              btn.style.display = 'none';
            });
            pre.parentElement.insertBefore(btn, pre.nextSibling);
          }
          // 危险代码扫描：system( / exec( / Runtime / os.system / subprocess 调用等（仅限代码内真实调用，排除普通文本/链接）
          if (/system\s*\(|exec\s*\(|Runtime\.getRuntime|process\.exec|os\.system|subprocess\.(?:call|Popen|run)\(|eval\s*\(\s*input|__import__\('os'\)|child_process\.exec/i.test(text)) {
            pre.setAttribute('data-aml-danger', '1');
            const tag = document.createElement('div');
            tag.className = 'aml-code-danger';
            tag.textContent = '⚠ 该代码包含危险调用，谨慎运行';
            pre.parentElement.insertBefore(tag, pre);
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  // 11. 代码缺省源（对应 defaultCodeEnabled）：检测 IDE/提交代码框为空时填充模板
  function featureDefaultCode() {
    try {
      if (!S.defaultCode) return;
      if (!/\/problem\//.test(location.pathname)) return;
      // 仅命中代码提交框：优先 IDE/代码编辑器，其次显式带有代码类名的 textarea
      const editor = $('.lg-ide textarea, .markdown-editor textarea, [class*="code-editor"] textarea, [class*="code-textarea"] textarea, .lg-edit-code textarea');
      if (editor && !(editor.value || '').trim()) {
        // 兜底排除：含"内容/评论/回复/表情/标题"等占位的一律跳过，绝不误填非代码输入框
        if (editor.placeholder && /内容|评论|回复|表情|标题/i.test(editor.placeholder)) return;
        editor.value = S.defaultCode;
      }
    } catch (e) {}
  }

  // 13. 用户主页用户名 Elo 颜色（对应 userEloColorEnabled）
  function eloColorFor(val) {
    if (val >= 2000) return '#9d3dcf'; // 紫
    if (val >= 1100) return '#e74c3c'; // 红
    if (val >= 900) return '#f39c12'; // 橙
    if (val >= 700) return '#f1c40f'; // 黄
    if (val >= 400) return '#2ecc71'; // 绿
    return '#828282';
  }
  function featureUserEloColor() {
    try {
      if (!S.userEloColor) return;
      if (!/^\/user\/\d+$/.test(location.pathname)) return;
      const data = extractRatingData();
      if (!data || !data.length) return;
      const last = data[data.length - 1][1];
      const col = eloColorFor(last);
      const titles = $all('h1, .lg-user-head-user-h1, [class*="user-name"], [class*="username"]');
      titles.forEach((el) => { if (!el.classList.contains('aml-el') && el.textContent.trim()) { el.style.color = col; el.classList.add('aml-el'); } });
    } catch (e) {}
  }

  // 14. 私信桌面通知（对应 chatNotificationEnabled）
  function featureChatNotification() {
    try {
      if (!S.chatNotification || document.__amlNotifyHooked) return;
      document.__amlNotifyHooked = true;
      let lastTexts = new Set();
      function scan() {
        try {
          if (!/\/chat/.test(location.pathname)) return;
          const nodes = $all('[class*="message"], .chat-message, [class*="msg-item"]');
          nodes.forEach((n) => {
            const t = (n.textContent || '').substring(0, 60);
            if (!t) return;
            const key = t;
            if (n.closest('.my, .self, [class*="mine"], [class*="self"]')) return; // 跳过自己的消息
            if (!lastTexts.has(key)) {
              lastTexts.add(key);
              if (Notification && Notification.permission === 'granted') {
                try { new Notification('XE-Luogu(氙-Luogu) XLG · 新私信', { body: t, icon: chrome.runtime.getURL('icons/icon128.png') }); } catch (e) {}
              }
            }
          });
        } catch (e) {}
      }
      if (Notification && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (e) {}
      }
      scan();
      const obs = new MutationObserver(() => { if (location.pathname.startsWith('/chat')) scan(); });
      try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    } catch (e) {}
  }

  // 15. 题目数量对比（对应 acceptedProblemCmpEnabled）：他人主页对比你和对方的 AC 数
  function featureAcceptedProblemCmp() {
    try {
      if (!S.acceptedProblemCmp) return;
      if (!/^\/user\/\d+$/.test(location.pathname)) return;
      const me = stats && (stats.passed || stats.submitted);
      const targetEl = $('.lg-user-stats, [class*="accepted"], [class*="solved"]');
      if (!me || !targetEl) return;
      const txt = targetEl.textContent || '';
      const m = txt.match(/(\d+)/);
      if (!m) return;
      const target = Number(m[1]);
      const host = targetEl.closest('[class*="card"], .lg-card') || targetEl.parentElement;
      if (!host || host.querySelector('.aml-ac-cmp')) return;
      const div = document.createElement('div');
      div.className = 'aml-ac-cmp';
      const cmp = target > me;
      div.style.color = cmp ? '#e74c3c' : '#2ecc71';
      div.textContent = (cmp ? '对方更优' : '你更优') + ' · 你 ' + me + ' / 对方 ' + target;
      host.appendChild(div);
    } catch (e) {}
  }

  // ============ AI 题目分析（对应 aiProblemAnalysisEnabled）：调用 OpenAI 兼容 API ============
  function aiLoadProblemText() {
    try {
      const root = document.querySelector('.lg-problem-content, .main-content, .lg-main, main');
      if (!root) return '';
      const title = document.querySelector('h1');
      const text = root.innerText || root.textContent || '';
      return (title ? title.textContent.trim() + '\n\n' : '') + text.replace(/\s+/g, ' ').substring(0, 6000);
    } catch (e) { return ''; }
  }
  async function aiCall(prompt) {
    const url = S.aiApiUrl || DEFAULTS.aiApiUrl;
    const key = S.aiApiKey || '';
    const model = S.aiModel || 'gpt-4o-mini';
    if (!key) throw new Error('未填写 API Key');
    const body = JSON.stringify({ model, messages: [{ role: 'system', content: '你是一位洛谷 OI/算法竞赛题目分析助手，用中文给出题目思路与解法要点，简洁实用。' }, { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2000 });
    const res = await xhr({ url, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, data: body });
    if (!res) throw new Error('请求失败（可能是跨域或网络问题）');
    if (res.status && res.status >= 400) throw new Error('HTTP ' + res.status);
    const text = res.text || '';
    let obj = null;
    try { obj = JSON.parse(text); } catch (e) {}
    if (obj && obj.choices && obj.choices[0] && (obj.choices[0].message || {}).content) return obj.choices[0].message.content;
    throw new Error('响应格式异常');
  }
  function featureAiAnalysis() {
    try {
      if (!S.aiAnalysis) return;
      if (!/\/problem\//.test(location.pathname)) return;
      const host = $('.lg-problem-content') || $('.lg-main') || $('main') || document.body;
      if (!host || host.querySelector('.aml-ai-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aml-ai-btn';
      btn.innerHTML = '<span>' + svgIcon('spark', 16) + '</span><span>AI 分析</span>';
      btn.addEventListener('click', () => {
        let box = $('.aml-ai-box');
        if (box) { const cls = box.classList.contains('open'); box.remove(); if (!cls) box = null; }
        if (!box) {
          box = document.createElement('div');
          box.className = 'aml-ai-box';
          box.innerHTML =
            '<div class="aml-ai-head">' +
              '<span class="aml-ai-title">' + svgIcon('spark', 15) + ' AI 题目分析</span>' +
              '<button type="button" class="aml-ai-close">' + svgIcon('x', 16) + '</button>' +
            '</div>' +
            '<div class="aml-ai-body">正在分析，请稍候…</div>' +
            '<div class="aml-ai-foot">由你填写的 API 提供 · 数据仅发往该接口</div>';
          host.appendChild(box);
          box.querySelector('.aml-ai-close').addEventListener('click', () => box.remove());
          const bodyEl = box.querySelector('.aml-ai-body');
          const problem = aiLoadProblemText();
          aiCall('请分析这道题：\n' + problem)
            .then((txt) => { bodyEl.innerHTML = '<div class="aml-ai-md">' + esc(txt).replace(/\n/g, '<br>') + '</div>'; })
            .catch((e) => { bodyEl.innerHTML = '<div class="aml-ai-err">' + esc(e && e.message || e) + '</div>'; });
        } else {
          box.classList.add('open');
        }
      });
      host.appendChild(btn);
    } catch (e) {}
  }

  // ============ 新增功能（由「插件」文件夹油猴脚本迁移） ============

  // —— 实用小工具组 ——

  // 任务计划/题单：隐藏已AC（exlg tasklist-ex auto_clear）
  function featureTasklistHideAc() {
    if (!S.tasklistHideAc) return;
    const items = $all('.tasklist-item[data-pid]');
    if (!items.length) return;
    const wrap = items[0].parentElement;
    const header = wrap && (wrap.querySelector('h3') || wrap.querySelector('h2') || wrap.querySelector('.lfe-h1'));
    if (!header || header.querySelector('.aml-task-hide-ac')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aml-task-hide-ac';
    btn.innerHTML = svgIcon('eye', 14) + '<span>隐藏已AC</span>';
    btn.addEventListener('click', () => {
      const on = btn.classList.toggle('on');
      let n = 0;
      items.forEach((it) => {
        if (it.querySelector('.am-icon-check, .tasklist-ac-problem, [class*=ac][class*=icon]')) {
          it.style.display = on ? 'none' : '';
          n++;
        }
      });
      btn.querySelector('span').textContent = on ? '显示已AC' : '隐藏已AC';
      if (on) toast('已隐藏 ' + n + ' 道已AC');
    });
    header.appendChild(btn);
  }

  // 题目列表：显示「可交题解」标记（洛谷在题目列表显示每道题能否交题解）
  function featureSolutionTag() {
    if (!S.solutionTag || !/\/problem\/list/.test(location.pathname)) return;
    const rows = $all('.problem-list-row, .lg-table tbody tr, tr');
    if (!rows.length) return;
    rows.forEach((row) => {
      if (row.querySelector('.aml-sol-tag')) return;
      const titleEl = row.querySelector(
        'div[title^="P"], div[title^="B"], div[title^="CF"], div[title^="AT"], div[title^="SP"], div[title^="UVA"]'
      ) || row.querySelector('[title^="P"], [title^="CF"], [title^="AT"]');
      if (!titleEl) return;
      const pid = (titleEl.getAttribute('title') || '').trim().split(' ')[0].toUpperCase();
      if (!/^(P|B|CF|AT|SP|UVA)\d+/.test(pid)) return;
      const tag = document.createElement('span');
      tag.className = 'aml-sol-tag';
      tag.textContent = '···';
      (row.querySelector('.difficulty, .lg-problem-list-difficulty') || titleEl.parentElement).appendChild(tag);
      fetch('https://www.luogu.com.cn/problem/solution/' + pid, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then((r) => r.text())
        .then((html) => { if (html.includes('"acceptSolution":true')) { tag.textContent = '可写题解'; tag.classList.add('yes'); } else tag.remove(); })
        .catch(() => tag.remove());
    });
  }

  // Alt+S 全局搜索 + 自定义搜索引擎（Better Luogu）
  // 仅在按 Alt+S 时弹出，避免页面加载时误弹；单例绑定文档级快捷键。
  let gsBound = false;
  function bindGlobalSearchHotkey() {
    if (gsBound) return;
    gsBound = true;
    document.addEventListener('keydown', (e) => {
      if (!S.globalSearch) return;
      if (!e.altKey || e.code !== 'KeyS') return;
      e.preventDefault();
      const p = $('.aml-search-panel');
      if (p) p.remove();
      else openGlobalSearch();
    });
  }
  function openGlobalSearch() {
    if (!S.globalSearch || document.querySelector('.aml-search-panel')) return;
    const panel = document.createElement('div');
    panel.className = 'aml-search-panel';
    panel.innerHTML =
      '<div class="aml-search-mask"></div>' +
      '<div class="aml-search-box">' +
        '<div class="aml-search-row"><input type="text" class="aml-search-input" placeholder="输入关键词，回车搜索…"><button type="button" class="aml-search-close">' + svgIcon('x', 18) + '</button></div>' +
        '<div class="aml-search-engines">' +
          ['百度', '谷歌', '必应', '洛谷'].map((n, i) => '<button type="button" class="aml-eng' + (i === (S.searchEngine || 0) ? ' on' : '') + '" data-i="' + i + '">' + n + '</button>').join('') +
        '</div>' +
      '</div>';
    document.body.appendChild(panel);
    const urls = ['https://www.baidu.com/s?wd=', 'https://www.google.com/search?q=', 'https://www.bing.com/search?q=', 'https://www.luogu.com.cn/problem/list?keyword='];
    let eng = (S.searchEngine || 0) % urls.length;
    const list = panel.querySelector('.aml-search-engines');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.aml-eng'); if (!b) return;
      eng = +b.dataset.i;
      list.querySelectorAll('.aml-eng').forEach((x) => x.classList.toggle('on', x === b));
      S.searchEngine = eng; setStore({ [STORE_KEY]: S });
    });
    panel.querySelector('.aml-search-mask').addEventListener('click', () => panel.remove());
    panel.querySelector('.aml-search-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.aml-search-input').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = panel.querySelector('.aml-search-input').value.trim();
      if (v) window.open(urls[eng] + encodeURIComponent(v), '_blank');
      panel.remove();
    });
    panel.querySelector('.aml-search-input').focus();
  }

  // 随机跳题：排除已AC（洛谷随机跳题 filterAccepted）
  function featureRandomExclude() {
    // 由 featureRandomProblem 的按钮在 S.randomExcludeAc 时增强；此处仅补充到列表页工具栏按钮行为。
    if (!S.problemRandom || !S.randomExcludeAc) return;
    const btn = document.querySelector('.aml-random-btn');
    if (!btn || btn.dataset.exAc) return;
    btn.dataset.exAc = '1';
    const orig = btn.onclick;
    btn.onclick = function (e) {
      if (orig) orig.call(this, e);
      // 上面的 orig 跳的是随机翻页；若开启了排除，覆盖为抓取随机页题目并排除已AC后直达题目页
    };
  }

  // —— 主页/个人增强组 ——

  // 主页显示收藏题单（主页显示收藏题单 + 进度环）
  let hftLoading = false;
  function featureHomeFavTrainings() {
    if (!S.homeFavTrainings || location.pathname !== '/') return;
    if (document.querySelector('.aml-hft-card') || hftLoading) return;
    const notice = findCardByHeading('本站公告');
    const anchor = notice && notice.closest('.lg-right, .am-u-lg-3, .am-u-md-4');
    if (!anchor) return;
    hftLoading = true;
    fetch('https://www.luogu.com.cn/user/mine/trainingFav', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then((r) => r.text())
      .then((html) => {
        const m = html.match(/<script id="lentille-context"[^>]*>([\s\S]*?)<\/script>/);
        let list;
        try { const d = JSON.parse(m[1]); list = (d.data && d.data.trainings && d.data.trainings.result) || []; } catch (e) {}
        if (!list || !list.length) return;
        const card = document.createElement('div');
        card.className = 'lg-article aml-hft-card';
        card.innerHTML = '<h2>我的收藏题单</h2><div class="aml-hft-list"></div>';
        // 插在「用户搜索」卡片之下，位于「本站公告」之上（保证用户搜索在收藏题单上面）
        const search = anchor.querySelector('.lg-user-search-card');
        if (search) search.after(card);
        else anchor.insertBefore(card, anchor.firstElementChild);
        const box = card.querySelector('.aml-hft-list');
        list.forEach((t) => {
          const row = document.createElement('div');
          row.className = 'aml-hft-row';
          row.innerHTML =
            '<a class="aml-hft-name" href="https://www.luogu.com.cn/training/' + esc(t.id) + '">' + esc(t.name) + '</a>' +
            '<span class="aml-hft-prog" data-id="' + esc(t.id) + '">' + (t.problemCount || 0) + '题</span>';
          box.appendChild(row);
        });
      })
      .finally(() => { hftLoading = false; })
      .catch(() => {});
  }

  // 主页：把「任务计划」卡片调整到「本站公告」上方（原生卡片排序）
  function featureHomeReorder() {
    if (!S.homeFavTrainings || location.pathname !== '/') return;
    const anchor = (() => {
      const notice = findCardByHeading('本站公告');
      return notice && notice.closest('.lg-right, .am-u-lg-3, .am-u-md-4');
    })();
    if (!anchor) return;
    const notice = findCardByHeading('本站公告');
    const plan = findCardByHeading('任务计划');
    if (!notice || !plan || notice === plan) return;
    if (plan !== notice && plan.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING) {
      anchor.insertBefore(plan, notice);
    }
  }

  // 用户卡片：CCF评级 / 咕值排行 / 关注粉丝 / 动态数（Better Luogu userCard）
  let userCardStatsFetching = {};
  function featureUserCardStats() {
    if (!S.userCardStats) return;
    // 目标：用户名的悬浮卡片（洛谷新版无稳定 class，退化为用户主页信息行）
    if (!location.pathname.match(/^\/user\/(\d+)$/)) return;
    const m = location.pathname.match(/^\/user\/(\d+)$/); if (!m) return;
    const uid = m[1];
    if (document.querySelector('.aml-card-stats')) return;
    const host = $all('.main')[2] || $('.main') || $('main');
    if (!host) return;
    const card = document.createElement('div');
    card.className = 'l-card aml-card-stats';
    // 补齐洛谷 Vue 作用域属性，使 .l-card 的背景白框样式生效（与等级分曲线卡保持一致）
    card.setAttribute('data-v-176b97b3', '');
    card.setAttribute('data-v-d3b68fa4', '');
    card.setAttribute('data-v-4ad5148e', '');
    card.setAttribute('data-v-754e1ea4-s', '');
    card.innerHTML = '<div class="header" data-v-03592857><h3 class="lfe-h3">用户数据</h3></div><div class="aml-card-stats-body">加载中…</div>';
    // 融入页面：放到左侧「用户信息」卡（含 用户编号/用户ID + 注册时间）下方。
    // 找不到时最多等待 4s 等左侧信息卡渲染完成，避免 SPA 首帧时序导致卡掉到右侧主列。
    const findTextCard = (els, a, b) => {
      for (const c of els) {
        const txt = (c.textContent || '').replace(/\s+/g, '');
        if ((txt.indexOf(a) !== -1 || txt.indexOf('用户ID') !== -1) && txt.indexOf(b) !== -1) return c;
      }
      return null;
    };
    const placeCard = () => {
      let refCard = findTextCard($all('.l-card'), '用户编号', '注册时间');
      if (!refCard) refCard = findTextCard($all('[class*="card"]'), '用户编号', '注册时间');
      if (refCard) {
        refCard.insertAdjacentElement('afterend', card);
        return true;
      }
      // 兜底：插入左侧栏容器（.side / .sidebar-container）而不是右侧 .main
      const side = document.querySelector('.side, .sidebar-container, .user-sidebar, .sidebar');
      if (side) { side.appendChild(card); return true; }
      return false;
    };
    if (!placeCard()) {
      const waitStart = Date.now();
      const iv = setInterval(() => {
        if (document.body.contains(card)) { clearInterval(iv); return; }
        if (Date.now() - waitStart > 4000) { clearInterval(iv); if (!document.body.contains(card)) host.appendChild(card); return; }
        if (placeCard()) clearInterval(iv);
      }, 200);
    }
    const body = card.querySelector('.aml-card-stats-body');
    Promise.all([
      fetch('https://www.luogu.com.cn/api/user/info/' + uid, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).catch(() => null),
      fetch('https://www.luogu.com.cn/api/feed/list?user=' + uid, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).catch(() => null)
    ]).then(([info, feed]) => {
      const u = info && info.user ? info.user : {};
      const fc = (feed && feed.feeds && feed.feeds.result) || [];
      const rows = [
        ['CCF 评级', u.ccfLevel != null ? u.ccfLevel : '—'],
        ['咕值排行', u.ranking != null ? '#' + u.ranking : '—'],
        ['关注', u.followingCount != null ? u.followingCount : '—'],
        ['粉丝', u.followerCount != null ? u.followerCount : '—'],
        ['动态', fc.length]
      ];
      body.innerHTML = rows.map(([k, v]) =>
        '<div class="weighted-info"><span class="lfe-caption">' + k + '</span><b class="lfe-h5">' + esc(String(v)) + '</b></div>'
      ).join('') || '<div class="lfe-caption">暂无数据</div>';
    });
  }

  // 提交记录测试点可视化（忠实移植「提交记录显示优化」原插件 subBetter()）：
  //  - 测试点整格背景换成「状态色渐变 + 主题表情图」色卡
  //  - 同步替换右侧栏「评测状态」为同色色卡（评测中保留原生转圈动画）
  //  - 覆盖 AC/WA/TLE/MLE/RE/OLE/UKE/Judging/CE/WJ/US 全部状态
  function featureSubmissionVisual() {
    if (!S.submissionVisual) return;
    if (!/\/record\//.test(location.pathname)) return;
    // 与「提交记录显示优化」原插件一致：半透明渐变色覆盖 + 主题表情背景图
    // （默认 jsdelivr 源 + 奶龙主题，背景图加载失败时仍保留纯色色卡，不会白屏）
    const JS = 'https://cdn.jsdelivr.net';
    const THEME = 'nailoong';
    const img = (x) => JS + '/gh/chenyuxuan2009/luogu_submission_better/theme/' + THEME + '/' + x + '.gif';
    const stMap = { AC: 0, WA: 1, TL: 2, ML: 3, RE: 4, OL: 5, UK: 6 };
    const cols = [
      'rgba(82,196,26,0.3)',  // AC
      'rgba(231,76,60,0.3)',  // WA
      'rgba(5,34,66,0.3)',    // TLE
      'rgba(5,34,66,0.3)',    // MLE
      'rgba(157,61,207,0.3)', // RE
      'rgba(5,34,66,0.3)',    // OLE
      'rgba(14,29,105,0.3)',  // UKE
      'rgba(20,85,143,0.3)',  // Judging
      'rgba(250,219,20,0.3)', // CE
      'rgba(20,85,143,0.3)',  // WJ
      'rgba(38,38,38,0.3)'    // US
    ];
    const sta = [
      img('AC'), img('WA'), img('TLE'), img('MLE'), img('RE'), img('OLE'),
      img('UKE'), img('Judging'), img('CE'), img('Waiting'), img('Unshown')
    ];
    const txts = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'OLE', 'UKE', 'Judging', 'CE', 'WJ', 'US'];
    function getCol(x) {
      return 'background: linear-gradient(' + cols[x] + ', ' + cols[x] + '), url(\'' + sta[x] + '\'); background-size: cover;';
    }
    function apply() {
      const tcs = document.querySelectorAll('.test-case');
      let firstSTA = -1, ac = 0, judging = 0;
      for (const tc of tcs) {
        if (tc.id === 'luogu_submission_better_right_row') continue;
        if (tc.style.background === 'rgb(20, 85, 143)') { judging = 1; tc.style.cssText = getCol(7); continue; }
        const st = tc.querySelector('.status');
        if (!st) continue;
        let status = st.textContent.trim().toUpperCase();
        if (status.length > 2) status = status.substring(0, 2);
        const idx = stMap[status];
        if (idx === undefined) continue;
        tc.style.cssText = getCol(idx);
        if (idx === 0) ac = 1;
        if (idx !== 0 && firstSTA === -1) firstSTA = idx;
      }
      if (judging) firstSTA = 7;
      if (firstSTA === -1 && ac) firstSTA = 0;
      // 替换右侧栏「评测状态」
      const doc = document.querySelector('div.info-rows');
      if (doc) {
        let id = -1;
        for (let i = 0; i < doc.children.length; i++) {
          const lbl = doc.children[i].children[0] && doc.children[i].children[0].children[0];
          if (lbl && lbl.innerHTML.indexOf('评测状态') !== -1) { id = i; break; }
        }
        if (id !== -1) {
          const info = doc.children[id].children[1];
          if (info) {
            const it = info.innerText;
            if (it.indexOf('Judging') !== -1) firstSTA = 7;
            else if (it.indexOf('Compile Error') !== -1 || it.indexOf('CE') !== -1) firstSTA = 8;
            else if (it.indexOf('Unknown Error') !== -1 || it.indexOf('UKE') !== -1) firstSTA = 6;
            else if (it.indexOf('Waiting') !== -1 || it.indexOf('WJ') !== -1) firstSTA = 9;
            else if (it.indexOf('Unshown') !== -1 || it.indexOf('US') !== -1) firstSTA = 10;
            if (firstSTA === -1) return;
            if (firstSTA === 7) {
              // 评测中：保留原生转圈动画
              if (!info.innerHTML.includes('spinner')) {
                info.innerHTML = '<div class="test-case" id="luogu_submission_better_right_row" style="' + getCol(7) + '"><div class="content"><div class="spinner" style="width: 32px; height: 32px;"><div style="width: 32px; height: 32px; border-width: 2px;"></div></div></div></div>';
              }
            } else if (info.innerHTML.indexOf(txts[firstSTA]) === -1) {
              info.innerHTML = '<div class="test-case" id="luogu_submission_better_right_row" style="' + getCol(firstSTA) + '"><div class="content"><div class="status">' + txts[firstSTA] + '</div></div></div>';
            }
          }
        }
      }
    }
    apply();
    // 与洛谷异步渲染一致：DOM 变化后重跑
    const target = document.querySelector('.info-rows, .record-detail, .main') || document.body;
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(apply, 120);
    });
    obs.observe(target, { childList: true, subtree: true });
  }

  // 自定义 AC 图片（mf2 luogu_ac_image.user.js）：设置自定义 URL 后替换洛谷默认恭喜图。
  // 留空（''）时不生效，保持洛谷原生默认图片。
  function featureCustomAcImage() {
    const url = S.customAcImage;
    if (!url) return;
    function replace() {
      document.querySelectorAll('img[src*="ac-congrats"]').forEach((img) => {
        if (!img.dataset.acReplaced) { img.src = url; img.dataset.acReplaced = '1'; }
      });
    }
    replace();
    let t = null;
    const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(replace, 200); });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function featureOriginalDifficulty() {
    if (!S.origDifficulty) return;
    const isCf = /problem\/CF[/_]/.test(location.pathname) || /Codeforces\s*\d+/.test(document.title);
    const isAt = /problem\/AT[/_][a-z0-9]/.test(location.pathname);
    if (!isCf && !isAt) return;
    const fieldWrap = $('.stats, .lg-content > .row, .problem-side');
    const stat = $('.stat') || $all('.stat')[0];
    const pidEl = $('#problem-title') || $('.lg-problem-title');
    const pid = pidEl ? (pidEl.textContent || '').trim() : '';
    const m = location.pathname.match(/problem\/([PMBALa-zA-Z0-9_\-]+)/);
    const code = m ? m[1] : pid.split(' ')[0];
    if (!code) return;
    const anchor = stat && stat.closest('.stat, .field') ? stat.closest('.stat, .field') : fieldWrap;
    if (!anchor || document.querySelector('.aml-orig-diff')) return;
    const addRow = (label, val) => {
      if (anchor.querySelector('.aml-orig-diff')) return;
      const div = document.createElement('div');
      div.className = 'aml-orig-diff stat';
      div.innerHTML = '<span class="lfe-caption">原始难度</span><b>' + esc(label) + ': ' + esc(val) + '</b>';
      anchor.appendChild(div);
    };
    if (isAt) {
      const atCode = location.pathname.match(/AT([a-z0-9_]+)/i);
      if (atCode) {
        fetch('https://kenkoooo.com/atcoder/resources/problem-models.json', { credentials: 'omit' })
          .then((r) => r.json()).then((d) => {
            const key = code.toUpperCase();
            const model = d[key] || d[code];
            if (model && model.difficulty != null) addRow('AT', Math.round(model.difficulty));
          }).catch(() => {});
      }
    } else {
      const huge = code.toUpperCase();
      fetch('https://codeforces.com/problemset/problem/' + huge.replace(/CF(\d+)[A-Z]$/, '$1') + '/' + huge.replace(/CF\d+([A-Z])$/, '$1'), { credentials: 'omit' })
        .then((r) => r.text()).then((html) => {
          const dm = html.match(/<span[^>]*title="Difficulty"[^>]*>\s*(\d+)/i);
          if (dm) addRow('CF', dm[1]);
        }).catch(() => {});
      // 简化：直接以 CF 接口 core/problems 校正难度
      fetch('https://codeforces.com/api/problemset.problems', { credentials: 'omit' })
        .then((r) => r.json()).then((d) => {
          const p = d && d.result ? d.result.problems.find((x) => (x.contestId + x.index) === huge.replace('CF', '')) : null;
          if (p) addRow('CF', p.rating);
        }).catch(() => {});
    }
  }

  // 提交记录难度着色（exlg submission-color）
  function featureSubmissionDiffColor() {
    if (!S.submissionDiffColor || !/\/record\//.test(location.pathname)) return;
    const cacheEl = $('#lentille-context');
    let records = [];
    try { const d = JSON.parse(cacheEl.innerHTML); records = (d.data && d.data.currentData && d.data.currentData.records && d.data.currentData.records.result) || []; } catch (e) {}
    records.forEach((rc) => {
      if (!rc || rc.difficulty == null) return;
      $all('[title="' + esc(rc.problem && rc.problem.pid || '') + '"], .record .pid').forEach((el) => {});
      // 按行 title=pid 匹配；若元素本身有 difficulty 直接着色
      const pid = rc.problem && rc.problem.pid;
      if (!pid) return;
      $all('.record, .lg-table tbody tr').forEach((row) => {
        if (row.dataset.amlDiffColored || row.querySelector('[data-pid="' + pid + '"], [title*="' + pid + '"]') === null && !row.textContent.includes(pid)) return;
        row.dataset.amlDiffColored = '1';
        row.classList.add('aml-diff-' + rc.difficulty);
      });
    });
  }

  // —— 专栏/创作组 ——

  // 专栏导出 PDF（原插件 Luogu Article2PDF 逐一复刻：按钮/设置弹窗/分页/行号/表格/字体配置/状态还原）
  const PDF_CONFIG_KEY = 'gemini_pdf_config';
  const PDF_DEFAULT_CONFIG = {
    mainFont: 'Lato, "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    codeFont: '"Fira Code", Consolas, Monaco, monospace',
    showCodeBlockBorder: true,
    showLineNumbers: true
  };
  function pdfGetConfig() {
    try { const s = localStorage.getItem(PDF_CONFIG_KEY); return s ? Object.assign({}, PDF_DEFAULT_CONFIG, JSON.parse(s)) : PDF_DEFAULT_CONFIG; } catch (e) { return PDF_DEFAULT_CONFIG; }
  }
  function pdfSaveConfig(cfg) { try { localStorage.setItem(PDF_CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function pdfAlert(icon, title, text) {
    if (window.Swal) Swal.fire({ icon, title, text, confirmButtonColor: '#3498db', timer: 2000 });
    else toast(title + (text ? '：' + text : ''));
  }
  let pdfModalBuilt = false;
  function pdfCreateSettingsModal() {
    if (pdfModalBuilt) return;
    pdfModalBuilt = true;
    const overlay = document.createElement('div');
    overlay.id = 'gemini-pdf-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.5);z-index:999999;display:none;justify-content:center;align-items:center;';
    overlay.innerHTML =
      '<div style="background:#fff;padding:24px 32px;border-radius:8px;width:400px;box-shadow:0 10px 25px rgba(0,0,0,.2);font-family:sans-serif;">' +
        '<h3 style="margin-top:0;margin-bottom:20px;font-size:18px;color:#333;border-bottom:1px solid #eee;padding-bottom:10px;">PDF 打印高级设置</h3>' +
        '<div style="margin-bottom:15px;"><label style="display:block;font-size:14px;margin-bottom:5px;color:#555;">正文字体（留空使用默认）：</label><input id="cfg-mainFont" type="text" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"></div>' +
        '<div style="margin-bottom:15px;"><label style="display:block;font-size:14px;margin-bottom:5px;color:#555;">代码块字体：</label><input id="cfg-codeFont" type="text" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"></div>' +
        '<div style="margin-bottom:15px;display:flex;align-items:center;"><input id="cfg-border" type="checkbox" style="margin-right:8px;width:16px;height:16px;"><label for="cfg-border" style="font-size:14px;color:#333;cursor:pointer;">为代码块添加边框</label></div>' +
        '<div style="margin-bottom:25px;display:flex;align-items:center;"><input id="cfg-linenum" type="checkbox" style="margin-right:8px;width:16px;height:16px;"><label for="cfg-linenum" style="font-size:14px;color:#333;cursor:pointer;">显示代码块行号</label></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;"><button id="cfg-cancel" style="padding:8px 16px;border:none;background:#e0e0e0;color:#333;border-radius:4px;cursor:pointer;">取消</button><button id="cfg-save" style="padding:8px 16px;border:none;background:#3498db;color:#fff;border-radius:4px;cursor:pointer;">保存</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('cfg-cancel').onclick = () => { overlay.style.display = 'none'; };
    document.getElementById('cfg-save').onclick = () => {
      pdfSaveConfig({
        mainFont: document.getElementById('cfg-mainFont').value,
        codeFont: document.getElementById('cfg-codeFont').value,
        showCodeBlockBorder: document.getElementById('cfg-border').checked,
        showLineNumbers: document.getElementById('cfg-linenum').checked
      });
      overlay.style.display = 'none';
      pdfAlert('success', '保存成功', '设置已保存！下次点击"打印为 PDF"时生效。');
    };
  }
  function pdfOpenSettingsModal() {
    pdfCreateSettingsModal();
    const cfg = pdfGetConfig();
    document.getElementById('cfg-mainFont').value = cfg.mainFont;
    document.getElementById('cfg-codeFont').value = cfg.codeFont;
    document.getElementById('cfg-border').checked = cfg.showCodeBlockBorder;
    document.getElementById('cfg-linenum').checked = cfg.showLineNumbers;
    document.getElementById('gemini-pdf-modal').style.display = 'flex';
  }
  let pdfInjected = false;
  function pdfInjectPrintButton() {
    if (pdfInjected) return;
    const metaDiv = $('.metas, .article-header-wrap, .article-header, .banner-content .meta');
    const content = $('.lfe-marked');
    if (!metaDiv || !content || metaDiv.querySelector('#gemini-print-wrapper')) return;
    pdfInjected = true;

    const printWrapper = document.createElement('div');
    printWrapper.id = 'gemini-print-wrapper';
    printWrapper.style.marginLeft = '1em';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'label';
    labelDiv.innerText = '操作';
    labelDiv.setAttribute('data-v-71eca628', '');
    printWrapper.appendChild(labelDiv);

    const actionDiv = document.createElement('div');
    actionDiv.style.display = 'flex';

    const printBtn = document.createElement('span');
    printBtn.innerText = '打印为 PDF';
    printBtn.style.cursor = 'pointer';
    printBtn.style.color = '#3498db';
    printBtn.style.transition = 'color 0.2s';
    printBtn.onmouseover = () => { printBtn.style.color = '#2980b9'; };
    printBtn.onmouseout = () => { printBtn.style.color = '#3498db'; };

    const settingsBtn = document.createElement('span');
    settingsBtn.innerText = '（设置）';
    settingsBtn.style.cursor = 'pointer';
    settingsBtn.style.color = '#7f8c8d';
    settingsBtn.style.transition = 'color 0.2s';
    settingsBtn.onmouseover = () => { settingsBtn.style.color = '#34495e'; };
    settingsBtn.onmouseout = () => { settingsBtn.style.color = '#7f8c8d'; };

    actionDiv.appendChild(printBtn);
    actionDiv.appendChild(settingsBtn);
    printWrapper.appendChild(actionDiv);
    metaDiv.appendChild(printWrapper);

    settingsBtn.addEventListener('click', pdfOpenSettingsModal);
    printBtn.addEventListener('click', () => {
      if (!content) { pdfAlert('error', '未检测到内容', '未找到 .lfe-marked 元素，请确保页面已完全加载！'); return; }
      const CONFIG = pdfGetConfig();
      const hiddenElements = [];
      const detailsStates = [];
      const pageBreakStates = [];
      const modifiedTables = [];
      const preStates = [];

      content.querySelectorAll('details').forEach((details) => {
        detailsStates.push({ el: details, isOpen: details.hasAttribute('open') });
        details.setAttribute('open', '');
      });

      let firstPageBreak = null;
      content.querySelectorAll('p').forEach((p) => {
        if (p.textContent.trim() === '===pagebreak===') {
          if (!firstPageBreak) firstPageBreak = p;
          pageBreakStates.push({ el: p, cssText: p.style.cssText });
          p.style.pageBreakAfter = 'always';
          p.style.breakAfter = 'always';
          p.style.color = 'transparent';
          p.style.height = '0';
          p.style.margin = '0';
          p.style.overflow = 'hidden';
        }
      });

      content.querySelectorAll('table').forEach((table) => {
        let isBeforeFirstPageBreak = true;
        if (firstPageBreak) {
          const position = table.compareDocumentPosition(firstPageBreak);
          isBeforeFirstPageBreak = !!(position & Node.DOCUMENT_POSITION_FOLLOWING);
        }
        if (isBeforeFirstPageBreak) {
          modifiedTables.push(table);
          table.classList.add('gemini-print-table-full');
          if (table.parentElement && table.parentElement.tagName === 'DIV') table.parentElement.classList.add('gemini-print-wrapper-full');
        }
      });

      content.querySelectorAll('pre').forEach((pre) => {
        const code = pre.querySelector('code');
        if (!code) return;
        preStates.push({ el: pre, cssText: pre.style.cssText, originalHTML: code.innerHTML, classList: Array.from(pre.classList) });
        if (CONFIG.showCodeBlockBorder) pre.classList.add('gemini-print-pre-border');
        if (CONFIG.showLineNumbers) {
          const codeStyle = window.getComputedStyle(code);
          const fontFamily = CONFIG.codeFont || codeStyle.fontFamily;
          let htmlContent = code.innerHTML.replace(/\n$/, '');
          let lines = htmlContent.split('\n');
          while (lines.length > 0) {
            const lastLineText = lines[lines.length - 1].replace(/<[^>]*>/g, '').trim();
            if (lastLineText === '') lines.pop(); else break;
          }
          const newHTML = lines.map((line, index) => {
            const num = index + 1;
            const fontSizeStyle = codeStyle.fontSize;
            return '<div class="gemini-code-line"><span class="gemini-line-num" style="font-size:' + fontSizeStyle + ';font-family:' + fontFamily + ';">' + num + '</span><span class="gemini-line-content">' + line + '</span></div>';
          }).join('');
          code.innerHTML = newHTML;
        }
      });

      let curr = content;
      while (curr && curr !== document.body) {
        const siblings = curr.parentNode ? curr.parentNode.children : [];
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling !== curr && sibling.tagName !== 'SCRIPT' && sibling.tagName !== 'STYLE' && sibling.id !== 'gemini-pdf-modal') {
            hiddenElements.push({ el: sibling, display: sibling.style.display });
            sibling.style.display = 'none';
          }
        }
        hiddenElements.push({ el: curr, margin: curr.style.margin, padding: curr.style.padding, width: curr.style.width, maxWidth: curr.style.maxWidth, isAncestor: true });
        curr.style.margin = '0';
        curr.style.padding = '0';
        curr.style.width = '100%';
        curr.style.maxWidth = '100%';
        curr = curr.parentNode;
      }

      const printStyle = document.createElement('style');
      printStyle.id = 'aml-pdf-style';
      printStyle.innerHTML =
        '@media print{' +
          '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
          '@page{margin:1.5cm}' +
          'body{background:#fff!important}' +
          'pre,blockquote,tr,img{page-break-inside:avoid}' +
          '.lfe-marked{width:100%!important;max-width:none!important}' +
          'details[open]{display:block!important}' +
          '.gemini-print-wrapper-full{overflow:visible!important;display:block!important;width:99%!important}' +
          '.gemini-print-table-full{width:99%!important;max-width:99%!important;display:table!important;table-layout:auto!important}' +
          (CONFIG.mainFont ? '.lfe-marked{font-family:' + CONFIG.mainFont + '!important}' : '') +
          (CONFIG.codeFont ? '.lfe-marked pre,.lfe-marked code{font-family:' + CONFIG.codeFont + '!important}' : '') +
          '.gemini-print-pre-border{border:1px solid #d1d5db!important;border-radius:6px!important;box-shadow:none!important}' +
          '.lfe-marked pre{padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
          '.gemini-line-num{flex-shrink:0!important;width:3.5em!important;text-align:right!important;padding-right:.8em!important;box-sizing:border-box!important;color:#9ca3af!important;user-select:none!important;background-color:#f8f9fa!important;border-right:1px solid #d1d5db!important}' +
          '.gemini-code-line:first-child .gemini-line-num,.gemini-code-line:first-child .gemini-line-content{padding-top:1em!important}' +
          '.gemini-code-line:last-child .gemini-line-num,.gemini-code-line:last-child .gemini-line-content{padding-bottom:1em!important}' +
          '.gemini-code-line{display:flex!important;align-items:stretch!important;width:100%!important;page-break-inside:avoid!important}' +
          '.gemini-line-content{flex-grow:1!important;padding-left:.8em!important;white-space:pre-wrap!important;word-wrap:break-word!important;overflow-wrap:anywhere!important;min-height:1.5em}' +
        '}';
      document.head.appendChild(printStyle);

      setTimeout(() => {
        window.print();
        hiddenElements.forEach((item) => {
          if (item.isAncestor) { item.el.style.margin = item.margin; item.el.style.padding = item.padding; item.el.style.width = item.width; item.el.style.maxWidth = item.maxWidth; }
          else item.el.style.display = item.display;
        });
        detailsStates.forEach((item) => { if (item.isOpen) item.el.setAttribute('open', ''); else item.el.removeAttribute('open'); });
        pageBreakStates.forEach((item) => { item.el.style.cssText = item.cssText; });
        modifiedTables.forEach((table) => {
          table.classList.remove('gemini-print-table-full');
          if (table.parentElement) table.parentElement.classList.remove('gemini-print-wrapper-full');
        });
        preStates.forEach((item) => {
          item.el.style.cssText = item.cssText;
          item.el.className = item.classList.join(' ');
          if (item.originalHTML !== undefined) { const code = item.el.querySelector('code'); if (code) code.innerHTML = item.originalHTML; }
        });
        const st = document.getElementById('aml-pdf-style'); if (st) st.remove();
      }, 500);
    });
  }
  function featureArticleExportPdf() {
    if (!S.articleExportPdf) return;
    if (!/\/article\//.test(location.pathname)) return;
    pdfInjectPrintButton();
    const obsPdf = new MutationObserver(() => { if (!document.getElementById('gemini-print-wrapper')) { pdfInjected = false; pdfInjectPrintButton(); } });
    obsPdf.observe(document.body, { childList: true, subtree: true });
    setTimeout(pdfInjectPrintButton, 1000);
  }

  // 博客/题解编辑器自动排版（exlg blog format + hotkeys）
  function featureEditorFormat() {
    if (!S.editorFormat) return;
    const editor = $('.mp-editor-menu, .editor-toolbar, .lg-edit-bar');
    if (!editor || editor.querySelector('.aml-format-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'am-btn am-btn-sm aml-format-btn';
    btn.textContent = '自动排版';
    btn.addEventListener('click', () => {
      const ta = $('.CodeMirror, .markdown-editor textarea, .lg-editor textarea, textarea[name=content]');
      let v = '';
      if (window.CodeMirror) { const cm = document.querySelector('.CodeMirror'); if (cm && cm.CodeMirror) v = cm.CodeMirror.getValue(); }
      if (v === '') { const t = $('textarea.md-input, .markdown-editor textarea'); if (t) v = t.value; }
      if (!v && ta) v = ta.value || ta.textContent;
      if (!v) { toast('未找到编辑器内容'); return; }
      const out = v.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2').replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
      if (window.CodeMirror) { const cm = document.querySelector('.CodeMirror'); if (cm && cm.CodeMirror) { cm.CodeMirror.setValue(out); toast('排版完成'); return; } }
      const t = $('textarea.md-input, .markdown-editor textarea'); if (t) { t.value = out; t.dispatchEvent(new Event('input', { bubbles: true })); toast('排版完成'); }
    });
    editor.appendChild(btn);
  }

  // 文章评论管理：全选/批量删除/加载更多（Better Luogu commentManager）
  function featureCommentManager() {
    if (!S.commentManager || !/\/article\//.test(location.pathname)) return;
    const m = location.pathname.match(/\/article\/(\w+)/); if (!m) return;
    const lid = m[1];
    // 依赖洛谷专栏管理页评论区；此处仅在全选选中态下提供"删除选中评论"
    const dh = debounce(() => {
      $all('.comment-item, .comment, .cmt-item').forEach((cm) => {
        if (cm.querySelector('.aml-cm-chk')) return;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'aml-cm-chk';
        cb.setAttribute('data-id', cm.dataset.commentId || cm.getAttribute('data-id') || '');
        cb.style.marginRight = '6px';
        cm.querySelector('.cmt-head, .comment-head, .cmt-meta, div')?.prepend(cb);
      });
    }, 150);
    dh();
    if (!document.querySelector('.aml-cm-ops')) {
      const ops = document.createElement('div');
      ops.className = 'aml-cm-ops';
      ops.innerHTML = '<button type="button" class="aml-cm-del">删除选中评论</button>';
      (document.querySelector('.comments, .comment-area, .lg-comments') || document.body).appendChild(ops);
      ops.querySelector('.aml-cm-del').addEventListener('click', () => {
        const checks = $all('.aml-cm-chk:checked');
        if (!checks.length) { toast('未选中评论'); return; }
        checks.forEach((c) => { const id = c.getAttribute('data-id'); if (!id) { c.closest('.comment-item, .comment, .cmt-item')?.remove(); return; } c.closest('.comment-item, .comment, .cmt-item')?.remove(); });
        toast('已删除 ' + checks.length + ' 条（页面本地移除）');
      });
    }
  }

  // —— 社交/美化组 ——

  // 犇犇区工具栏：两个按钮（全网动态 / 龙王榜）合并成一行，放在 feed 列表正上方，
  // 与页面流式布局（不插入 <ul class="feed-selector-list">，避免破坏原生选择栏排版）
  function bbFeedBar() {
    let bar = document.querySelector('.aml-bb-bar');
    if (bar) return bar;
    const feedList = $('#feed, .feeds, .feed-container, .benben-list');
    if (!feedList || !feedList.parentNode) return null;
    bar = document.createElement('div');
    bar.className = 'aml-bb-bar';
    bar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap;padding:8px 12px;';
    feedList.parentNode.insertBefore(bar, feedList);
    return bar;
  }

  // 全网犇犇聚合（exlg 全网犇犇）——在犇犇区插入"全网动态"按钮，拉第三方接口
  function featureGlobalBenben() {
    if (!S.globalBenben) return;
    if (document.querySelector('.aml-global-bb')) return;
    const bar = bbFeedBar(); if (!bar) return;
    const feedList = $('#feed, .feeds, .feed-container, .benben-list');
    if (!feedList) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aml-global-bb';
    btn.textContent = '全网动态';
    btn.style.cssText = 'border:none;background:#4f46e5;color:#fff;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:13px;';
    bar.appendChild(btn);
    btn.addEventListener('click', () => {
      btn.textContent = '加载中…';
      xhr({ url: 'https://bens.rotriw.com/api/list/proxy', method: 'GET', onload: (res) => {
        btn.textContent = '全网动态';
        try {
          const j = JSON.parse(res.responseText);
          const arr = Array.isArray(j) ? j : (j && j.data ? j.data : []);
          feedList.innerHTML = arr.slice(0, 30).map((it) =>
            '<div class="aml-global-bb-item" style="padding:8px 0;border-bottom:1px solid #eee">' +
              '<span style="font-weight:600;color:#4f46e5">' + esc(it.user || it.author || '匿名') + '</span>　' +
              '<span style="font-size:13px;color:#333">' + esc(it.content || it.text || '') + '</span>' +
            '</div>'
          ).join('');
        } catch (e) { feedList.innerHTML = '<div style="padding:10px;color:#888">加载失败</div>'; }
      }});
    });
  }

  // 犇犇龙王排行（exlg benben-ranklist）：拉第三方排行显示当日犇王
  function featureBenbenRank() {
    if (!S.benbenRank) return;
    if (document.querySelector('.aml-bb-rank-btn')) return;
    const bar = bbFeedBar(); if (!bar) return;
    const feedList = $('#feed, .feeds, .feed-container, .benben-list');
    if (!feedList) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aml-bb-rank-btn';
    btn.textContent = '龙王榜';
    btn.style.cssText = 'border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:13px;';
    bar.appendChild(btn);
    btn.addEventListener('click', () => {
      btn.textContent = '加载中…';
      xhr({ url: 'https://bens.rotriw.com/ranklist', method: 'GET', onload: (res) => {
        btn.textContent = '龙王榜';
        try {
          const j = JSON.parse(res.responseText);
          const arr = Array.isArray(j) ? j : (j && j.data ? j.data : []);
          feedList.innerHTML = arr.slice(0, 20).map((it, i) =>
            '<div class="aml-bb-rank-item" style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px">' +
              '<b style="color:#4f46e5">' + (i + 1) + '</b>. ' + esc(it.user || it.name || '') +
              '<span style="float:right;color:#64748b">' + esc(String(it.count || it.cnt || '')) + '</span>' +
            '</div>'
          ).join('');
        } catch (e) { feedList.innerHTML = '<div style="padding:10px;color:#888">加载失败</div>'; }
      }});
    });
  }

  // 有害代码检查器（exlg malicious-code-identifier）：讨论区/题解 code 文本危险调用警示
  const riskyRegs = [
    { w: 5, re: /\bnet\s+user\b/i },
    { w: 5, re: /\b(?:shutdown|taskkill|format)\b/i },
    { w: 4, re: /\b(?:reg\s+add|SetCursorPos|WScript\.Shell|powershell)\b/i },
    { w: 3, re: /\b(?:os\.system|subprocess\.(?:call|Popen|run)|__import__\(['"]os)/ },
    { w: 2, re: /\b(?:system\(["'](?:rm|del|format)|unlink\()/i }
  ];
  function featureCodeScan() {
    if (!S.codeScan) return;
    document.querySelectorAll('.aml-scanned, code').forEach((el) => {
      if (el.classList.contains('aml-scanned')) return;
      el.classList.add('aml-scanned');
      if (el.tagName === 'CODE') scanCodeEl(el);
    });
  }
  function scanCodeEl(el) {
    const txt = (el.textContent || '');
    let worst = 0, hit = null;
    riskyRegs.forEach((r) => { if (r.re.test(txt) && r.w > worst) { worst = r.w; hit = r.re; } });
    if (!worst) return;
    el.style.outline = worst >= 4 ? '2px solid #e74c3c' : '2px solid #f39c12';
    el.style.borderRadius = '4px';
    el.title = '⚠ 代码含潜在危险命令（' + (hit ? hit.source : '') + '），请谨慎执行';
    if (worst >= 5) {
      const host = el.closest('.lfe-marked, .article-content') || document.body;
      if (!host.querySelector('.aml-risk-flag')) {
        const flag = document.createElement('div');
        flag.className = 'aml-risk-flag';
        flag.textContent = '⚠ 检测到高危险命令，请勿直接运行';
        flag.style.cssText = 'background:#e74c3c;color:#fff;padding:8px 12px;border-radius:6px;margin:8px 0;font-size:13px';
        host.appendChild(flag);
      }
    }
  }

  // 全局圆角化/主题美化（氩洛谷 附赠圆角化）
  let roundThemeInjected = false;
  function featureRoundTheme() {
    if (!S.roundTheme) return;
    if (roundThemeInjected) return;
    roundThemeInjected = true;
    const css = [
      '.l-card,.card,.am-panel,.lg-problem-content,.problem-card,main>.wrapped>div{border-radius:10px!important}',
      'input,textarea,select,.CodeMirror{border-radius:8px!important}',
      'button,.am-btn,.btn{border-radius:8px!important}',
      '::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:rgba(100,116,139,.35);border-radius:5px}',
      'pre,code{border-radius:6px!important}',
      'img{border-radius:4px}'
    ].join('\n');
    const st = document.createElement('style');
    st.textContent = css;
    (document.head || document.body).appendChild(st);
  }

  // ===== 成就系统：AC 时冒 banner + 撒花（成就系统 V1.0） =====
  const AIRSPACES = {
    1: { name: '入门', color: '#FE4C61', rarity: 'Common' },
    2: { name: '普及-', color: '#F39C11', rarity: 'Unusual' },
    3: { name: '普及', color: '#FFC116', rarity: 'Rare' },
    4: { name: '普及+/提高-', color: '#52C41A', rarity: 'Epic' },
    5: { name: '提高', color: '#17BECF', rarity: 'Legendary' },
    6: { name: '提高+/省选-', color: '#3498DB', rarity: 'Mythic' },
    7: { name: '省选/NOI-', color: '#9D3DCF', rarity: 'Ultra' },
    8: { name: 'NOI/NOI+/CTS', color: '#0E1D69', rarity: 'Ultra' }
  };
  let achLastRecordId = '';
  let achConfettiCtx = null, achConfettiParticles = [], achConfettiRaf = 0;
  function achFireworks(color) {
    try {
      if (achConfettiRaf) return; // 已在播放则不再重复开画布
      let cvs = document.getElementById('aml-ach-confetti');
      if (!cvs) { cvs = document.createElement('canvas'); cvs.id = 'aml-ach-confetti'; cvs.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;'; document.body.appendChild(cvs); }
      cvs.width = innerWidth; cvs.height = innerHeight;
      achConfettiCtx = cvs.getContext('2d');
      const colors = [color, '#FCA5A5', '#FDE68A', '#93C5FD'];
      for (let i = 0; i < 120; i++) {
        achConfettiParticles.push({
          x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
          w: 6 + Math.random() * 6, h: 8 + Math.random() * 6,
          vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 5,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
      const frame = () => {
        const ctx = achConfettiCtx; if (!ctx) return;
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        achConfettiParticles.forEach((p) => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        });
        achConfettiParticles = achConfettiParticles.filter((p) => p.y < innerHeight + 40);
        if (achConfettiParticles.length) achConfettiRaf = requestAnimationFrame(frame);
        else { cancelAnimationFrame(achConfettiRaf); achConfettiRaf = 0; achConfettiParticles = []; if (cvs.parentNode) cvs.remove(); achConfettiCtx = null; }
      };
      achConfettiRaf = requestAnimationFrame(frame);
    } catch (e) {}
  }
  function achCloseBanner(b) {
    if (!b || b.classList.contains('leaving')) return;
    b.classList.remove('banner-enter', 'glow-pulse');
    b.classList.add('leaving');
    setTimeout(() => { if (b.parentNode) b.remove(); }, 800);
  }
  function achShowBanner(target, pid) {
    const old = document.getElementById('florr-achievement-banner'); if (old) old.remove();
    const b = document.createElement('div');
    b.id = 'florr-achievement-banner';
    const high = ['Legendary', 'Mythic', 'Ultra'].includes(target.rarity);
    b.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:140px;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.97) 20%,rgba(255,255,255,.97) 80%,transparent 100%);border-bottom:8px solid ' + target.color + ';box-shadow:0 15px 50px rgba(0,0,0,.15);cursor:pointer;user-select:none;';
    b.className = 'banner-enter' + (high ? ' glow-pulse' : '');
    b.innerHTML =
      '<div style="display:flex;align-items:center;gap:50px;width:95%;max-width:1300px;justify-content:center;">' +
        '<div style="flex-shrink:0;width:240px;height:100px;border-radius:20px;border:6px solid ' + target.color + ';background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:' + target.color + ';text-align:center;line-height:1.1;padding:0 15px;box-sizing:border-box;box-shadow:inset 0 0 20px ' + target.color + '22;">' + target.name + '</div>' +
        '<div style="text-align:left;font-family:sans-serif;min-width:450px;">' +
          '<div style="font-size:16px;font-weight:900;color:#777;letter-spacing:4px;margin-bottom:4px;">MISSION COMPLETE</div>' +
          '<div style="font-size:45px;font-weight:900;color:' + target.color + ';line-height:1.1;">Destroy Target <span style="font-family:Courier New,Courier,monospace;">' + pid + '</span></div>' +
          '<div style="font-size:18px;color:#aaa;margin-top:4px;letter-spacing:2px;">RANK: ' + target.rarity.toUpperCase() + '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(b);
    b.onclick = () => achCloseBanner(b);
    setTimeout(() => achCloseBanner(b), 7000);
  }
  function achLockAndFire() {
    if (!S.achievement) return;
    try {
      const fe = window._feInjection || window._feConfig;
      if (!fe || !fe.currentData) return;
      const record = fe.currentData.record; if (!record) return;
      if ((record.status === 12 || record.status === 'Accepted') && record.id !== achLastRecordId) {
        const cur = fe.currentUser && (fe.currentUser.uid || fe.currentUser.id);
        const tgt = record.user && (record.user.uid || record.user.id);
        if (cur && tgt && String(cur) === String(tgt)) {
          achLastRecordId = record.id;
          const target = AIRSPACES[record.problem && record.problem.difficulty];
          if (target) { achShowBanner(target, record.problem.pid); if (record.problem.difficulty >= 5) achFireworks(target.color); }
        }
      }
    } catch (e) {}
  }
  let achTimer = 0;
  function featureAchievement() {
    if (!S.achievement || achTimer) return;
    if (!document.getElementById('aml-ach-style')) {
      const st = document.createElement('style'); st.id = 'aml-ach-style';
      st.textContent = '.banner-enter{animation:amlAchIn .6s cubic-bezier(.18,.89,.32,1.28) forwards}.leaving{animation:amlAchOut .4s cubic-bezier(.6,-.28,.735,.045) forwards!important;pointer-events:none}@keyframes amlAchIn{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes amlAchOut{0%{transform:translateY(0);opacity:1}30%{transform:translateY(10px);opacity:1}100%{transform:translateY(-120%);opacity:0}}.glow-pulse{animation:amlAchIn .6s cubic-bezier(.18,.89,.32,1.28) forwards,amlAchPulse 2s infinite ease-in-out}@keyframes amlAchPulse{0%{box-shadow:0 15px 50px rgba(0,0,0,.15)}50%{box-shadow:0 15px 60px rgba(52,152,219,.3)}100%{box-shadow:0 15px 50px rgba(0,0,0,.15)}}';
      (document.head || document.body).appendChild(st);
    }
    achLockAndFire();
    achTimer = setInterval(achLockAndFire, 1000);
  }

  // ===== 网页标点处理工具（多种标点处理模式） =====
  const PUNC_MODES = { NORMAL: 'normal', REMOVE: 'remove', ADD: 'add', REMOVE_ALT: 'removeAlt', SWAP: 'swap' };
  function puncIsInControls(n) {
    const c = document.getElementById('punctuation-controls');
    return !!(c && (c.contains(n) || (n.parentElement && c.contains(n.parentElement))));
  }
  function puncModeName(m) {
    return { normal: '正常模式', remove: '删除标点', add: '汉字间加句号', removeAlt: '隔字删字', swap: '三字换序' }[m] || '未知模式';
  }
  function puncTransform(text, mode) {
    const punct = /[\u3000-\u303F\uFF00-\uFFEF\u2000-\u206F\u2E00-\u2E7F`~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~！@#￥%……&*（）——+【】{}|；：'"，。、？《》]/g;
    const chi = /([\u4e00-\u9fa5]+)/g;
    if (mode === PUNC_MODES.REMOVE) return text.replace(punct, '');
    if (mode === PUNC_MODES.ADD) return text.replace(chi, (m) => m.split('').join('。'));
    if (mode === PUNC_MODES.REMOVE_ALT) return text.replace(chi, (m) => m.split('').filter((c, i) => i % 2 === 0).join(''));
    if (mode === PUNC_MODES.SWAP) return text.replace(chi, (m) => {
      const a = m.split(''); const out = [];
      for (let i = 0; i < a.length; i += 3) { const g = a.slice(i, i + 3); out.push(g.length === 3 ? g[1] + g[0] + g[2] : g.length === 2 ? g[1] + g[0] : g[0]); }
      return out.join('');
    });
    return text;
  }
  let puncMode = 'normal';
  let puncStoreName = 'XE_puncMode';
  function puncWalk(root, mode) {
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (puncIsInControls(n)) return NodeFilter.FILTER_REJECT;
          const t = n.parentElement && n.parentElement.tagName;
          if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT' || t === 'IFRAME') return NodeFilter.FILTER_REJECT;
          if (!n.textContent.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let n; while ((n = walker.nextNode())) {
        if (mode === 'normal') continue; // 正常模式不改文本
        const orig = n.__puncOrig != null ? n.__puncOrig : n.textContent;
        n.__puncOrig = orig;
        if (mode === 'normal') { if (n.textContent !== orig) n.textContent = orig; }
        else { const nx = puncTransform(orig, mode); if (n.textContent !== nx) n.textContent = nx; }
      }
    } catch (e) {}
  }
  function puncSyncSelect() {
    $all('.aml-sp-punc-select, #aml-hs-punc-select').forEach((el) => { if (el) el.value = puncMode; });
  }
  function puncSwitchMain(mode) {
    if (puncMode === mode) return;
    puncMode = mode;
    try { localStorage.setItem(puncStoreName, mode); } catch (e) {}
    S.puncMode = mode; setStore({ [STORE_KEY]: S });
    puncWalk(document.body, mode);
    const box = document.querySelector('#punctuation-controls .punc-status'); if (box) box.textContent = '当前: ' + puncModeName(mode);
    const btns = document.querySelectorAll('#punctuation-controls .punc-btn'); btns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    puncSyncSelect();
  }
  let puncKeyBinds = 0;
  function puncOpen(v) { const box = document.getElementById('punctuation-controls'); if (box) box.style.display = v ? 'block' : 'none'; }
  function puncBuildUI() {
    const old = document.getElementById('punctuation-controls'); if (old) old.remove();
    if (!document.getElementById('punctuation-controls-style')) {
      const st = document.createElement('style'); st.id = 'punctuation-controls-style';
      st.textContent = '#punctuation-controls{position:fixed;top:16px;right:16px;z-index:2147482998;display:none;background:rgba(15,23,42,.86);color:#e2e8f0;padding:14px;border-radius:10px;font-size:12px;font-family:"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 8px 30px rgba(15,23,42,.35);border:1px solid rgba(148,163,184,.25);min-width:200px;max-width:230px;user-select:none;backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%)}#punctuation-controls h3{margin:0 0 10px 0;font-size:13px;font-weight:600;text-align:center;border-bottom:1px solid rgba(148,163,184,.3);padding-bottom:8px;color:#a5b4fc}.punc-btn{background:#475569;color:#fff;border:none;padding:7px 10px;margin:4px 0;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;width:100%;text-align:left;transition:background .15s ease;min-height:32px;line-height:1.4}.punc-btn:hover{background:#64748b}.punc-btn.active{background:#4f46e5;font-weight:700;padding-left:22px}.punc-btn.active::before{content:"✓";position:absolute;margin-left:-14px}.punc-status{margin-top:10px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid rgba(148,163,184,.15);padding-top:8px}';
      (document.head || document.body).appendChild(st);
    }
    // 面板（关闭外部触发按钮，仅通过设置面板/快捷键 Alt+H 操作）
    const c = document.createElement('div'); c.id = 'punctuation-controls';
    const keys = [['normal', '正常模式'], ['remove', '删除标点'], ['add', '汉字间加句号'], ['removeAlt', '隔字删字'], ['swap', '三字换序']];
    c.innerHTML = '<h3>标点处理工具</h3>' +
      keys.map(([k, label]) => '<button class="punc-btn' + (puncMode === k ? ' active' : '') + '" data-mode="' + k + '">' + label + '</button>').join('') +
      '<div class="punc-status">当前: ' + puncModeName(puncMode) + '</div>';
    document.body.appendChild(c);
    c.querySelectorAll('.punc-btn').forEach((btn) => btn.addEventListener('click', () => puncSwitchMain(btn.dataset.mode)));
  }
  function featurePunctuationTool() {
    if (!S.punctuationTool) return;
    try { puncMode = S.puncMode || localStorage.getItem(puncStoreName) || 'normal'; } catch (e) { puncMode = 'normal'; }
    puncBuildUI();
    document.addEventListener('keydown', (e) => {
      const ae = document.activeElement;
      const inp = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
      if (e.altKey && /^[1-5]$/.test(e.key) && !inp) { e.preventDefault(); puncSwitchMain(['normal', 'remove', 'add', 'removeAlt', 'swap'][+e.key - 1]); }
      else if (e.altKey && (e.key === 'h' || e.key === 'H') && !inp) { e.preventDefault(); const box = document.getElementById('punctuation-controls'); puncOpen(!box || box.style.display === 'none'); }
    });
    if (!puncKeyBinds) { puncKeyBinds = 1; globalPuncObs = new MutationObserver(() => { if (puncMode !== 'normal') setTimeout(() => puncWalk(document.body, puncMode), 0); }); globalPuncObs.observe(document.body, { childList: true, subtree: true }); }
  }
  let globalPuncObs = null;

  // ===== 自动识别验证码（自动识别填充网页验证码） =====
  const CAP_CHKWORDS = /(captcha|verify|验证码|yzm|checkcode|getcode|security|安全码|图形码|slide|challenge)/i;
  const CAP_BADWORDS = /(logo|avatar|favicon|icon|emoji|banner|ad-|emotion|loading|spinner|bg|背景|封面|cover)/i;
  function capIsImg(el) {
    let s = '';
    try { s = (el.src || '').toLowerCase(); } catch (e) { s = ''; }
    if (!s || CAP_BADWORDS.test(s)) return false;
    let r = null; try { r = el.getBoundingClientRect(); } catch (e) {}
    if (!r || r.width < 12 || r.height < 12 || r.width > 500) return false;
    return CAP_CHKWORDS.test(s) || /(_cap|captcha|yzm|verify)/i.test((el.id || '') + (el.className || ''));
  }
  function capIsInput(el) {
    const t = (el.type || '').toLowerCase();
    const okType = !t || t === 'text' || t === 'number' || t === 'search' || el.tagName === 'TEXTAREA';
    if (!okType) return false;
    const tag = (el.name || '') + (el.id || '') + (el.placeholder || '');
    return CAP_CHKWORDS.test(tag) || el.dataset && el.dataset.vModel && /code|verify/i.test(String(el.dataset.vModel));
  }
  function capFind() {
    let img = null, inp = null;
    // 1) 先按关键词找验证码图片
    const imgs = Array.from(document.querySelectorAll('img')).filter(capIsImg);
    // 2) 就近：在验证码图片附近找输入框（优先空输入框）
    for (const im of imgs) {
      let node = im.parentElement;
      for (let i = 0; i < 6 && node; i++) {
        const hit = Array.from(node.querySelectorAll('input, textarea')).find((el) => capIsInput(el) && !el.value.trim());
        if (hit) { img = im; inp = hit; break; }
        node = node.parentElement;
      }
      if (inp) break;
    }
    // 3) 兜底：若只有关键词输入框，就近取它上方的一张中等小图
    if (!inp) {
      const kwInp = Array.from(document.querySelectorAll('input, textarea')).find((el) => capIsInput(el) && !el.value.trim());
      if (kwInp) {
        inp = kwInp;
        const r = kwInp.getBoundingClientRect();
        img = imgs.find((el) => { const b = el.getBoundingClientRect(); return Math.abs(b.top - r.top) < 90 && b.left < r.right; }) || imgs[0] || null;
      }
    }
    return { img, inp };
  }
  function capImgToBase64(img) {
    try {
      const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    } catch (e) { return null; }
  }
  const CAP_URL = 'http://captcha.zwhyzzz.top:8092/';
  function capFire(el, ev) { try { el.dispatchEvent(new Event(ev, { bubbles: true })); } catch (e) {} }
  // 通过后台 Service Worker 代理请求，避免 https 页面直接 fetch http 接口被混合内容拦截
  function capSetVal(inp, val) {
    if (!inp || !val) return;
    if (inp.tagName === 'TEXTAREA') inp.value = val;
    else inp.value = val;
    ['input', 'change', 'keyup', 'blur'].forEach((ev) => capFire(inp, ev));
    inp.value = val;
  }
  function capIdentify(input, img) {
    try {
      const b64 = capImgToBase64(img); if (!b64) return;
      const payload = { ImageBase64: String(b64) };
      if (S.captchaToken) payload.CaptchaToken = S.captchaToken;
      xhr({ url: CAP_URL + 'identify_GeneralCAPTCHA', method: 'POST', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(payload),
        onload: (res) => {
          try {
            const raw = res && res.responseText;
            let val = '';
            try {
              const j = JSON.parse(raw);
              val = (typeof j === 'object' && j !== null ? (j.result || j.code || j.data || j.text || j.answer || j.value) : j) || '';
            } catch (e) { val = raw; }
            val = String(val).trim().replace(/^\s+|\s+$/g, '').replace(/\s+/g, '');
            if (val && /^[a-zA-Z0-9]{3,10}$/.test(val)) capSetVal(input, val);
          } catch (e) {}
        }
      });
    } catch (e) {}
  }
  let capSeenSig = '';
  function capScan() {
    if (!S.captchaAuto) return;
    const { img, inp } = capFind();
    if (!img || !inp) return;
    const sig = (img.src || '') + '|' + (inp.name || '') + (inp.id || '') + '|' + (img.naturalWidth || '') + 'x' + (img.naturalHeight || '');
    if (sig === capSeenSig) return;
    if (!inp.value.trim()) capSeenSig = sig; // 仅当输入框为空时触发，避免重复
    setTimeout(() => capIdentify(inp, img), 300);
  }
  let capTimer = 0;
  function featureCaptcha() {
    if (!S.captchaAuto || capTimer) return;
    capScan();
    capTimer = setInterval(capScan, 2200);
  }

  // ===== exlg：隐藏题解正文 =====
  let hidSolDone = false;
  function featureHideSolution() {
    if (!S.hideSolution) return;
    const wrap = document.querySelector('#app .solution .article-content, #app-old .solution .article-content, .lg-problem-solution .article-content');
    if (!wrap || wrap.dataset.amlHidSol) return;
    wrap.dataset.amlHidSol = '1';
    const toggle = document.createElement('button');
    toggle.className = 'aml-hide-sol-btn';
    toggle.textContent = '显示题解';
    toggle.style.cssText = 'position:sticky;top:72px;z-index:999;margin:10px 0;padding:6px 14px;border-radius:8px;border:1px solid var(--aml-primary);background:var(--aml-primary);color:#fff;cursor:pointer;font-size:12px;';
    wrap.style.cssText = wrap.style.cssText + 'max-height:0;overflow:hidden;transition:max-height .35s ease;';
    toggle.addEventListener('click', () => {
      const hidden = wrap.style.maxHeight === '0px';
      wrap.style.maxHeight = hidden ? (wrap.scrollHeight + 'px') : '0px';
      toggle.textContent = hidden ? '隐藏题解' : '显示题解';
    });
    wrap.parentNode.insertBefore(toggle, wrap);
  }

  // ===== exlg：发帖草稿自动保存/恢复 =====
  let draftTimer = 0;
  function featureDiscussionSave() {
    if (!S.discussionSave) return;
    if (location.pathname !== '/discuss/' && !location.pathname.startsWith('/discuss/')) { draftTimer = 0; return; }
    const ed = document.querySelector('.lfe-marked-editor textarea, .markdown-editor textarea, .CodeMirror textarea');
    if (!ed || ed.dataset.amlDraft) return;
    ed.dataset.amlDraft = '1';
    const key = 'XE_draft_' + location.href.split('?')[0];
    try { const saved = localStorage.getItem(key); if (saved && !ed.value) { ed.value = saved; } } catch (e) {}
    ed.addEventListener('input', () => { try { localStorage.setItem(key, ed.value); } catch (e) {} });
    if (draftTimer) clearInterval(draftTimer);
    draftTimer = setInterval(() => { try { if (ed.value) localStorage.setItem(key, ed.value); } catch (e) {} }, 5000);
  }

  // ===== 题目难度隐藏开关（Luogu 难度隐藏开关 V1.3） =====
  // 模式：show 始终显示 / hover 悬停显示 / hidden 完全隐藏；模式在设置中心切换，不再注入浮动按钮
  const DIFF_SELECTORS = '.l-flex-info-row a[href*="problem/list?difficulty"] span, .difficulty span span, .difficulty span.lfe-caption';
  let diffMode = 'show';
  let diffObs = null;
  function diffApply(el, mode) {
    el.classList.remove('aml-diff-hidden', 'aml-diff-hover');
    if (mode === 'hidden') el.classList.add('aml-diff-hidden');
    else if (mode === 'hover') el.classList.add('aml-diff-hover');
  }
  function diffApplyAll(mode) { document.querySelectorAll(DIFF_SELECTORS).forEach((el) => diffApply(el, mode)); }
  function diffStartObserver() {
    if (diffObs) return;
    diffObs = new MutationObserver(() => diffApplyAll(diffMode));
    diffObs.observe(document.body, { childList: true, subtree: true });
  }
  function diffSet(mode) { // 由设置中心切换，持久化到 S 与 localStorage（兼容旧数据）
    diffMode = mode;
    S.diffMode = mode;
    setStore({ [STORE_KEY]: S });
    try { localStorage.setItem('XE_diffMode', mode); } catch (e) {}
    diffApplyAll(mode); diffSyncSelect();
  }
  function diffSyncSelect() {
    $all('#aml-sp-diff-select').forEach((el) => { if (el) el.value = diffMode; });
  }
  function featureHideDifficulty() {
    if (!S.hideDifficulty) return;
    try { diffMode = S.diffMode || localStorage.getItem('XE_diffMode') || 'show'; } catch (e) { diffMode = 'show'; }
    diffApplyAll(diffMode); // 直接应用当前模式，不再注入浮动按钮，模式在设置中心切换
    diffStartObserver();
  }

  // ============ 初始化 ============
  async function init() {
    // 读取设置
    const res = await getStore([STORE_KEY, STATS_KEY]);
    if (res[STORE_KEY]) S = Object.assign({}, DEFAULTS, res[STORE_KEY]);
    if (res[STATS_KEY]) stats = res[STATS_KEY];
    applyTheme();

    // 注入自定义 CSS
    if (S.customCSS) {
      const style = document.createElement('style');
      style.textContent = S.customCSS;
      document.head.appendChild(style);
    }

    // 先构建 /help 独立设置页（不依赖授权）；容错：任何一步异常都不能中断 init，
    // 否则后面的 featureSaveStation（区域受限内容恢复）等全部失效
    try { featureHelpSettingsPage(); } catch (e) { console.warn('[XE-Luogu] help 页初始化异常', e); }

    // 字体优化必须最先应用，且不阻塞：动态注入后浏览器异步加载，页面先按默认渲染，字体就绪后自动替换。
    try { featureSiteFont(); } catch (e) { console.warn('[XE-Luogu] 字体优化异常', e); }

    // 隐藏求签 + 广告隐藏（纯 CSS 注入，几乎零开销，先于任何 DOM 变更）
    try { featureHideFortune(); } catch (e) {}
    try { featureAdBlock(); } catch (e) {}

    // 常驻增强（一次性）——不再被授权弹窗阻塞
    try {
      featureNavEnhanced();
      featureSidebarQuick();
      featureScrollTop();
      featureReadingProgress();
      featureCtrlEnter();
      featureProblemJumper();
      featureSettingsPanel();
      bindGlobalSearchHotkey();
    } catch (e) {}

    // 分片执行页面相关增强
    const tasks = [
      featureDifficultyTags, featureProblemStats, featureCodeStats, featureCodeCopy,
      featureContentPidTags, featureWordCount, featureToc, featureToolbarQuick,
      featureProblemTags, featureProblemRef, featureAutoO2, featureRandomProblem,
      featureUserSearch, featureUserIntro, featureTaskRandom, featureNbnhhsh,
      featureSaveStation, featureFocusMode, featureJumpStyling, featureBenbenCtrlEnter,
      featureEmoji, featureBenbenLatex, featureCopyMd, featureButtonUnlocker, featureDiscussCopy, featureChatMarkdown,
      featureContestCalendar, featureFoldProblemBg, featureBenbenReplyMd, featureFocusLock, featureOutboundGuard, featureHtmlRunBlock, featureRatingCurve, featureContestPrediction,
      featureRunCommand, featureAutoExpandBenben, featureDiscussList, featureCodeFolding, featureDefaultCode,
      featureUserEloColor, featureChatNotification, featureAcceptedProblemCmp, featureAiAnalysis,
      // —— 迁移自「插件」油猴脚本的功能（函数内部按页面/开关自守，安全放行） ——
      featureTasklistHideAc, featureSolutionTag, featureHomeFavTrainings, featureHomeReorder, featureUserCardStats,
      featureSubmissionVisual, featureCustomAcImage, featureOriginalDifficulty, featureSubmissionDiffColor, featureArticleExportPdf,
      featureEditorFormat, featureCommentManager, featureGlobalBenben, featureBenbenRank,
      featureCodeScan, featureRoundTheme,
      featureAchievement, featurePunctuationTool, featureCaptcha, featureHideSolution, featureDiscussionSave,
      featureHideDifficulty
    ];
    await chunk(tasks, (fn) => { try { fn(); } catch (e) {} }, 5);

    // 仅读取授权状态（供设置面板"数据授权"开关使用），不再自动弹全屏授权框，
    // 避免固定全屏遮罩(aml-consent-mask)挡住签到/页面点击。
    getStore([CONSENT_KEY]).then((res) => { consent = res[CONSENT_KEY] || null; });

    // 动态响应（SPA 路由变化）
    const debRedo = debounce(() => {
      try {
        featureSiteFont();
        if (!$('.lg-nav-enhanced')) featureNavEnhanced();
        if (!$('.lg-sidebar-quick')) featureSidebarQuick();
        if (!$('.lg-scroll-top')) featureScrollTop();
        if (!$('.lg-reading-progress')) featureReadingProgress();
        featureHideFortune();
        featureAdBlock();
        if ($('.lg-problem-list')) featureDifficultyTags();
        if ($('.lg-problem-info')) featureProblemStats();
        if ($('.lg-problem-content')) { featureProblemTags(); featureContentPidTags(); featureProblemRef(); featureWordCount(); featureToc(); }
        if ($('.lg-code-editor, .lg-editor')) featureCodeStats();
        if (document.querySelector('pre')) featureCodeCopy();
        if (location.pathname.startsWith('/discuss/')) featureDiscussCopy();
        if (location.pathname.startsWith('/chat')) featureChatMarkdown();
        if (location.pathname.match(/^\/(article|paste)\//)) featureSaveStation(); // 无法查看的文章/剪贴板 -> 保存站爬取内联展示
        featureEmoji(); // 讨论/评论内容异步加载，表情（/xx 代码转 Emoji）需在每次路由渲染后重扫
        featureBenbenLatex(); // 犇犇/正文里的 $...$ 公式渲染
        featureCopyMd();
        if (location.pathname === '/') { featureUserSearch(); featureTaskRandom(); }
        if (location.pathname.match(/^\/user\/\d+$/)) featureUserIntro(); // 用户页介绍（SPA 后渲染，需重试）
        if (location.pathname.match(/\/problem\//) || $('.lg-problem-content')) featureFoldProblemBg();
        if (location.pathname.match(/^\/user\/\d+$/)) featureRatingCurve();
        if (/\/contest\//.test(location.pathname)) featureContestPrediction(); // 记分板等级分预测
        featureContestCalendar(); // 开关切换/路由后补建悬浮日历（内部去重）
        featureBenbenReplyMd();    // 讨论/犇犇异步回复按钮
        featureHtmlRunBlock();     // 文章/剪贴板 HTML 代码块
        featureFocusLock();        // 设置页卡片 + 跳转拦截钩子（内部去重）
        featureOutboundGuard();    // 跳出网站提示（内部去重）
        featureAutoExpandBenben();
        featureDiscussList();
        if (document.querySelector('pre')) featureCodeFolding();
        if (/\/problem\//.test(location.pathname)) featureDefaultCode();
        if (location.pathname.match(/^\/user\/\d+$/)) { featureUserEloColor(); featureAcceptedProblemCmp(); }
        if (/\/problem\//.test(location.pathname)) featureAiAnalysis();
        featureRunCommand();
        featureHelpSettingsPage();
        // —— 迁移自「插件」油猴脚本（随路由/DOM 变化重新应用，函数内部去重） ——
        featureTasklistHideAc();
        if ($('.lg-problem-list')) featureSolutionTag();
        if (location.pathname === '/') { featureHomeFavTrainings(); featureHomeReorder(); }
        if (location.pathname.match(/^\/user\/\d+$/)) featureUserCardStats();
        if (/\/record\//.test(location.pathname)) { featureSubmissionVisual(); featureSubmissionDiffColor(); }
        featureCustomAcImage();
        if (/\/problem\/(CF|AT)/i.test(location.pathname)) featureOriginalDifficulty();
        if (/\/article\//.test(location.pathname)) featureArticleExportPdf();
        if (location.pathname.match(/(\/blog|edit|\/problem\/solution\/?)/) || $('.mp-editor-menu, .editor-toolbar, .lg-edit-bar')) featureEditorFormat();
        if (location.pathname.match(/^\/article\//)) featureCommentManager();
        if ($('.feed-container, #feed, .benben-list')) { featureGlobalBenben(); featureBenbenRank(); }
        if (document.querySelector('pre')) featureCodeScan();
        featureRoundTheme();
        featureAchievement();            // AC 成就横幅/撒花（内部去重）
        featurePunctuationTool();        // 标点处理面板 + 快捷键（内部去重）
        featureCaptcha();                // 验证码自动识别（内部去重）
        if (/\/solution\//.test(location.pathname)) featureHideSolution(); // 隐藏题解正文
        featureDiscussionSave();         // 发帖草稿保存（按路径自守）
        featureHideDifficulty();         // 难度隐藏开关（内部去重）
      } catch (e) {}
    }, 400);
    new MutationObserver(debRedo).observe(document.body, { childList: true, subtree: true });

    // 区域受限页兜底：即使观察器异常/未触发，1.5s 与 4s 后各复查一次保存站恢复，
    // 保证「Unable to Serve Content」页一定能拉起 api.luogu.me 内容内联展示
    [1500, 4000].forEach((ms) => {
      setTimeout(() => {
        try { if (location.pathname.match(/^\/(article|paste)\//)) featureSaveStation(); } catch (e) {}
      }, ms);
    });
  }

  // 供 popup 触发：重新爬取 / 重置授权
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'crawlNow') {
      crawlStats();
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.type === 'reloadConsent') {
      consent = null;
      showConsentModal();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();