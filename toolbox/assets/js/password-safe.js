/* ============================================================
 * 密码保险箱 - password-safe.js
 * 纯前端实现，使用 Web Crypto API (AES-GCM + PBKDF2) 加密
 * ============================================================ */

(function () {
  'use strict';

  // ===== 常量 =====
  const STORAGE_KEY = 'tbx-pw-vault';       // 加密数据存储键
  const SETTINGS_KEY = 'tbx-pw-settings';   // 设置存储键
  const PBKDF2_ITERATIONS = 200000;         // PBKDF2 迭代次数
  const SALT_LENGTH = 16;                   // 盐长度 (bytes)
  const IV_LENGTH = 12;                     // IV 长度 (bytes, GCM 推荐 12)
  const KEY_LENGTH = 256;                   // AES 密钥长度 (bits)

  const CATEGORIES = [
    { id: 'all', name: '全部密码', icon: '📋' },
    { id: '社交', name: '社交', icon: '💬' },
    { id: '工作', name: '工作', icon: '💼' },
    { id: '金融', name: '金融', icon: '💰' },
    { id: '娱乐', name: '娱乐', icon: '🎮' },
    { id: '其他', name: '其他', icon: '🔑' }
  ];

  const CATEGORY_ICONS = {
    '社交': '💬', '工作': '💼', '金融': '💰', '娱乐': '🎮', '其他': '🔑'
  };

  // 密码生成器字符集
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const DIGIT = '0123456789';
  const SYMBOL = '!@#$%^&*()-_=+[]{};:,.?';

  // ===== 状态 =====
  let masterKey = null;          // 派生的 AES 密钥 (CryptoKey)
  let entries = [];              // 解密后的密码条目数组
  let currentCategory = 'all';   // 当前分类
  let currentEntryId = null;     // 当前查看/编辑的条目 ID
  let isEditing = false;         // 是否处于编辑模式
  let searchQuery = '';          // 搜索关键词
  let autoLockTimer = null;      // 自动锁定计时器
  let autoLockMinutes = 5;       // 自动锁定时间（分钟）
  let lastActivityTime = Date.now(); // 最后活动时间
  let passwordVisible = false;   // 详情页密码是否可见
  let confirmCallback = null;    // 确认对话框回调

  // ===== DOM 工具 =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const he = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ===== 加密工具 =====

  // 将字符串转为 Uint8Array (UTF-8)
  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }

  // 将 Uint8Array 转为字符串
  function bytesToStr(bytes) {
    return new TextDecoder().decode(bytes);
  }

  // 生成随机字节
  function randomBytes(length) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return arr;
  }

  // 将 ArrayBuffer/Uint8Array 转为 base64
  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < arr.byteLength; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
  }

  // 将 base64 转为 Uint8Array
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // 使用 PBKDF2 从主密码派生密钥
  async function deriveKey(password, salt) {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      strToBytes(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // 使用 AES-GCM 加密数据
  async function encryptData(key, plaintext) {
    const iv = randomBytes(IV_LENGTH);
    const encoded = strToBytes(plaintext);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoded
    );
    return {
      iv: bytesToBase64(iv),
      data: bytesToBase64(encrypted)
    };
  }

  // 使用 AES-GCM 解密数据
  async function decryptData(key, ivB64, dataB64) {
    const iv = base64ToBytes(ivB64);
    const data = base64ToBytes(dataB64);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    return bytesToStr(decrypted);
  }

  // ===== 存储操作 =====

  // 检查是否已设置主密码（是否有加密数据）
  function hasVault() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  // 保存加密后的数据到 localStorage
  async function saveVault() {
    if (!masterKey) return;
    const plaintext = JSON.stringify({
      version: 1,
      entries: entries
    });
    const result = await encryptData(masterKey, plaintext);
    // 同时保存盐（盐是公开的，与密文一起存储）
    const stored = {
      salt: window.__vaultSalt,
      iv: result.iv,
      data: result.data
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  // 加载并解密数据
  async function loadVault() {
    const storedStr = localStorage.getItem(STORAGE_KEY);
    if (!storedStr) {
      entries = [];
      return true;
    }
    try {
      const stored = JSON.parse(storedStr);
      const salt = base64ToBytes(stored.salt);
      window.__vaultSalt = stored.salt;
      const plaintext = await decryptData(masterKey, stored.iv, stored.data);
      const data = JSON.parse(plaintext);
      entries = data.entries || [];
      return true;
    } catch (e) {
      return false;
    }
  }

  // 创建设置（全新保险箱）
  async function createVault(password) {
    const salt = randomBytes(SALT_LENGTH);
    window.__vaultSalt = bytesToBase64(salt);
    masterKey = await deriveKey(password, salt);
    entries = [];
    await saveVault();
    return true;
  }

  // 解锁现有保险箱
  async function unlockVault(password) {
    const storedStr = localStorage.getItem(STORAGE_KEY);
    if (!storedStr) return false;
    try {
      const stored = JSON.parse(storedStr);
      const salt = base64ToBytes(stored.salt);
      window.__vaultSalt = stored.salt;
      masterKey = await deriveKey(password, salt);
      // 尝试解密以验证密码
      const plaintext = await decryptData(masterKey, stored.iv, stored.data);
      const data = JSON.parse(plaintext);
      entries = data.entries || [];
      return true;
    } catch (e) {
      masterKey = null;
      return false;
    }
  }

  // 锁定保险箱（清除内存中的敏感数据）
  function lockVault() {
    masterKey = null;
    entries = [];
    currentEntryId = null;
    isEditing = false;
    passwordVisible = false;
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }
    showLockScreen();
  }

  // 重置保险箱（删除所有数据）
  function resetVault() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    masterKey = null;
    entries = [];
    currentEntryId = null;
    window.__vaultSalt = null;
  }

  // ===== 设置加载/保存 =====

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      autoLockMinutes = s.autoLockMinutes != null ? s.autoLockMinutes : 5;
    } catch (e) {
      autoLockMinutes = 5;
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      autoLockMinutes: autoLockMinutes
    }));
  }

  // ===== 密码生成器 =====

  function randInt(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    const a = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(a); x = a[0]; } while (x >= limit);
    return x % maxExclusive;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function generatePassword(len, useUpper, useLower, useDigit, useSymbol) {
    const sets = [];
    if (useUpper) sets.push(UPPER);
    if (useLower) sets.push(LOWER);
    if (useDigit) sets.push(DIGIT);
    if (useSymbol) sets.push(SYMBOL);
    if (!sets.length) return '';

    const all = sets.join('');
    const arr = [];
    // 确保每种选中的类型至少有一个字符
    const k = Math.min(sets.length, len);
    for (let i = 0; i < k; i++) {
      arr.push(sets[i][randInt(sets[i].length)]);
    }
    while (arr.length < len) {
      arr.push(all[randInt(all.length)]);
    }
    return shuffle(arr).slice(0, len).join('');
  }

  // 密码强度评估
  function evaluateStrength(password) {
    if (!password) return { score: 0, label: '-', color: 'var(--muted)' };

    let poolSize = 0;
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/[0-9]/.test(password)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) poolSize += 28; // 大致符号数

    const entropy = password.length * Math.log2(poolSize || 1);

    let score = Math.min(100, (entropy / 100) * 100);

    let label, color;
    if (entropy < 28) {
      label = '很弱';
      color = 'var(--danger)';
      score = Math.min(25, score);
    } else if (entropy < 40) {
      label = '弱';
      color = '#f59e0b';
      score = Math.min(45, score);
    } else if (entropy < 60) {
      label = '中等';
      color = '#eab308';
      score = Math.min(65, score);
    } else if (entropy < 80) {
      label = '强';
      color = 'var(--ok)';
      score = Math.min(85, score);
    } else {
      label = '很强';
      color = 'var(--ok)';
    }

    return { score: Math.max(0, Math.min(100, score)), label, color };
  }

  function updateStrengthBar(password, barEl, labelEl) {
    const s = evaluateStrength(password);
    barEl.style.width = s.score + '%';
    barEl.style.background = s.color;
    if (labelEl) {
      labelEl.textContent = password ? '强度：' + s.label : '强度：-';
      labelEl.style.color = s.color;
    }
  }

  // ===== 条目 CRUD =====

  function generateId() {
    return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function addEntry(entry) {
    const now = new Date().toISOString();
    const newEntry = {
      id: generateId(),
      name: entry.name || '未命名',
      username: entry.username || '',
      password: entry.password || '',
      website: entry.website || '',
      category: entry.category || '其他',
      notes: entry.notes || '',
      createdAt: now,
      updatedAt: now
    };
    entries.unshift(newEntry);
    saveVault();
    return newEntry;
  }

  function updateEntry(id, updates) {
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return null;
    entries[idx] = {
      ...entries[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveVault();
    return entries[idx];
  }

  function deleteEntry(id) {
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    saveVault();
    return true;
  }

  function getEntry(id) {
    return entries.find(e => e.id === id) || null;
  }

  // 过滤条目
  function getFilteredEntries() {
    let result = entries.slice();

    // 分类过滤
    if (currentCategory !== 'all') {
      result = result.filter(e => e.category === currentCategory);
    }

    // 搜索过滤
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.username || '').toLowerCase().includes(q) ||
        (e.website || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q)
      );
    }

    // 按修改时间降序
    result.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return result;
  }

  // 获取各分类的条目数
  function getCategoryCounts() {
    const counts = { all: entries.length };
    for (const cat of Object.keys(CATEGORY_ICONS)) {
      counts[cat] = entries.filter(e => e.category === cat).length;
    }
    return counts;
  }

  // ===== 导入/导出 =====

  // 导出为加密 JSON
  function exportEncrypted() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const obj = JSON.parse(data);
    obj.version = 1;
    obj.type = 'encrypted';
    return JSON.stringify(obj, null, 2);
  }

  // 导出为明文 JSON
  function exportPlain() {
    return JSON.stringify({
      version: 1,
      type: 'plain',
      exportedAt: new Date().toISOString(),
      entries: entries.map(e => ({
        name: e.name,
        username: e.username,
        password: e.password,
        website: e.website,
        category: e.category,
        notes: e.notes
      }))
    }, null, 2);
  }

  // 从 JSON 导入（明文）
  function importFromPlainJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    const list = data.entries || data.passwords || [];
    if (!Array.isArray(list)) throw new Error('无效的 JSON 格式');

    const now = new Date().toISOString();
    const imported = list.map(item => ({
      id: generateId(),
      name: item.name || item.title || '未命名',
      username: item.username || item.user || item.email || '',
      password: item.password || item.pass || '',
      website: item.website || item.url || item.login_uri || '',
      category: item.category || item.folder || '其他',
      notes: item.notes || item.note || item.extra || '',
      createdAt: now,
      updatedAt: now
    }));

    return imported;
  }

  // 从 CSV 导入
  function importFromCSV(csvStr) {
    const lines = csvStr.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV 文件内容不足');

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const imported = [];
    const now = new Date().toISOString();

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx] || '';
      });

      imported.push({
        id: generateId(),
        name: obj.name || obj.title || obj.service || '未命名',
        username: obj.username || obj.user || obj.email || obj.login || '',
        password: obj.password || obj.pass || '',
        website: obj.website || obj.url || obj.uri || '',
        category: obj.category || obj.folder || obj.type || '其他',
        notes: obj.notes || obj.note || obj.extra || obj.comments || '',
        createdAt: now,
        updatedAt: now
      });
    }

    return imported;
  }

  // 简单的 CSV 行解析（支持引号）
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          current += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          result.push(current);
          current = '';
        } else {
          current += c;
        }
      }
    }
    result.push(current);
    return result;
  }

  // 触发文件下载
  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // ===== 自动锁定 =====

  function resetAutoLockTimer() {
    lastActivityTime = Date.now();
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }
    if (autoLockMinutes > 0 && masterKey) {
      autoLockTimer = setTimeout(() => {
        showToast('保险箱已自动锁定', '');
        lockVault();
      }, autoLockMinutes * 60 * 1000);
    }
  }

  function setupActivityListeners() {
    const events = ['mousedown', 'keydown', 'touchstart', 'mousemove', 'scroll'];
    events.forEach(evt => {
      document.addEventListener(evt, () => {
        if (masterKey) {
          // 减少重置频率
          if (Date.now() - lastActivityTime > 10000) {
            resetAutoLockTimer();
          }
        }
      }, { passive: true });
    });
  }

  // ===== UI 渲染 =====

  function showLockScreen() {
    $('#lockScreen').style.display = '';
    $('#vaultScreen').style.display = 'none';

    if (hasVault()) {
      // 解锁模式
      $('#setupMode').style.display = 'none';
      $('#unlockMode').style.display = '';
      $('#lockIcon').textContent = '🔒';
      $('#lockTitle').textContent = '密码保险箱';
      $('#lockSubtitle').textContent = '请输入主密码以解锁您的密码保险箱';
      $('#unlockPassword').value = '';
      $('#unlockPassword').focus();
    } else {
      // 设置模式
      $('#setupMode').style.display = '';
      $('#unlockMode').style.display = 'none';
      $('#lockIcon').textContent = '🔐';
      $('#lockTitle').textContent = '设置主密码';
      $('#lockSubtitle').textContent = '请设置一个强主密码来保护您的密码保险箱';
      $('#setupPassword').value = '';
      $('#setupPassword2').value = '';
      $('#setupPassword').focus();
      updateStrengthBar('', $('#setupStrengthBar'), $('#setupStrengthLabel'));
    }
  }

  function showVaultScreen() {
    $('#lockScreen').style.display = 'none';
    $('#vaultScreen').style.display = '';
    renderCategories();
    renderPasswordList();
    resetAutoLockTimer();
  }

  function renderCategories() {
    const counts = getCategoryCounts();
    const list = $('#categoryList');
    list.innerHTML = CATEGORIES.map(cat => `
      <div class="category-item ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
        <span class="cat-icon">${cat.icon}</span>
        <span>${cat.name}</span>
        <span class="cat-count">${counts[cat.id] || 0}</span>
      </div>
    `).join('');

    // 绑定点击事件
    $$('.category-item').forEach(item => {
      item.onclick = () => {
        currentCategory = item.dataset.cat;
        currentEntryId = null;
        renderCategories();
        renderPasswordList();
        // 移动端关闭侧边栏
        if (window.innerWidth <= 768) {
          $('#pwSidebar').classList.remove('show');
        }
      };
    });
  }

  function renderPasswordList() {
    const filtered = getFilteredEntries();
    const catInfo = CATEGORIES.find(c => c.id === currentCategory) || CATEGORIES[0];
    $('#currentCatTitle').textContent = catInfo.name;
    $('#entryCount').textContent = filtered.length + ' 条';

    const listEl = $('#pwList');
    const emptyEl = $('#pwEmpty');
    const detailEl = $('#pwDetail');

    // 如果有当前选中的条目，显示详情
    if (currentEntryId && !isEditing) {
      showDetailView(currentEntryId);
      return;
    }

    // 编辑模式下显示编辑视图
    if (isEditing) {
      showEditView(currentEntryId);
      return;
    }

    detailEl.style.display = 'none';

    if (filtered.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'flex';
      if (searchQuery) {
        emptyEl.querySelector('h3').textContent = '未找到匹配的密码';
        emptyEl.querySelector('p').textContent = '试试其他搜索关键词，或者清除搜索条件。';
      } else {
        emptyEl.querySelector('h3').textContent = '还没有保存的密码';
        emptyEl.querySelector('p').textContent = '点击左侧「新增密码」按钮开始添加您的第一个密码条目。所有密码均使用 AES-256 加密保存。';
      }
      return;
    }

    listEl.style.display = '';
    emptyEl.style.display = 'none';

    listEl.innerHTML = filtered.map(entry => {
      const icon = CATEGORY_ICONS[entry.category] || '🔑';
      const usernameMasked = entry.username ? maskText(entry.username) : '-';
      return `
        <div class="pw-entry" data-id="${entry.id}">
          <div class="pw-entry-icon">${icon}</div>
          <div class="pw-entry-info">
            <div class="pw-entry-name">${he(entry.name)}</div>
            <div class="pw-entry-username">${he(usernameMasked)}</div>
          </div>
          <div class="pw-entry-meta">
            <div class="pw-entry-date">${formatDate(entry.updatedAt)}</div>
            <div class="pw-entry-actions">
              <button class="icon-btn" data-action="copy-user" data-id="${entry.id}" title="复制用户名">👤</button>
              <button class="icon-btn" data-action="copy-pass" data-id="${entry.id}" title="复制密码">📋</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 绑定条目点击
    $$('.pw-entry').forEach(el => {
      el.onclick = (e) => {
        // 如果点击的是操作按钮，不进入详情
        if (e.target.closest('.icon-btn')) return;
        currentEntryId = el.dataset.id;
        passwordVisible = false;
        renderPasswordList();
      };
    });

    // 绑定操作按钮
    $$('.pw-entry .icon-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const entry = getEntry(id);
        if (!entry) return;

        if (action === 'copy-user') {
          copyToClipboard(entry.username, btn);
        } else if (action === 'copy-pass') {
          copyToClipboard(entry.password, btn);
        }
      };
    });
  }

  function showDetailView(id) {
    const entry = getEntry(id);
    if (!entry) {
      currentEntryId = null;
      renderPasswordList();
      return;
    }

    $('#pwList').style.display = 'none';
    $('#pwEmpty').style.display = 'none';
    $('#pwDetail').style.display = '';
    $('#detailView').style.display = '';
    $('#editView').style.display = 'none';

    const icon = CATEGORY_ICONS[entry.category] || '🔑';
    $('#detailIcon').textContent = icon;
    $('#detailName').textContent = entry.name;
    $('#detailCategory').textContent = entry.category;
    $('#detailUsername').textContent = entry.username || '-';
    $('#detailPassword').textContent = passwordVisible ? (entry.password || '-') : '••••••••';
    $('#togglePwVisibility').textContent = passwordVisible ? '🙈' : '👁';

    if (entry.website) {
      $('#detailWebsiteRow').style.display = '';
      $('#detailWebsite').textContent = entry.website;
      $('#detailWebsite').href = entry.website.startsWith('http') ? entry.website : 'https://' + entry.website;
    } else {
      $('#detailWebsiteRow').style.display = 'none';
    }

    if (entry.notes) {
      $('#detailNotesRow').style.display = '';
      $('#detailNotes').textContent = entry.notes;
    } else {
      $('#detailNotesRow').style.display = 'none';
    }

    $('#detailCreated').textContent = formatDateTime(entry.createdAt);
    $('#detailModified').textContent = formatDateTime(entry.updatedAt);

    // 复制按钮
    $$('.copy-btn[data-copy]').forEach(btn => {
      btn.onclick = () => {
        const field = btn.dataset.copy;
        const text = field === 'username' ? entry.username : entry.password;
        copyToClipboard(text, btn);
      };
    });
  }

  function showEditView(id) {
    const entry = id ? getEntry(id) : null;

    $('#pwList').style.display = 'none';
    $('#pwEmpty').style.display = 'none';
    $('#pwDetail').style.display = '';
    $('#detailView').style.display = 'none';
    $('#editView').style.display = '';

    if (entry) {
      $('#editTitle').textContent = '编辑密码';
      $('#editIcon').textContent = '✏️';
      $('#editName').value = entry.name;
      $('#editUsername').value = entry.username;
      $('#editPassword').value = entry.password;
      $('#editCategory').value = entry.category;
      $('#editWebsite').value = entry.website;
      $('#editNotes').value = entry.notes;
    } else {
      $('#editTitle').textContent = '新增密码';
      $('#editIcon').textContent = '➕';
      $('#editName').value = '';
      $('#editUsername').value = '';
      $('#editPassword').value = '';
      $('#editCategory').value = currentCategory !== 'all' ? currentCategory : '其他';
      $('#editWebsite').value = '';
      $('#editNotes').value = '';
      $('#genPanel').style.display = 'none';
    }

    updateStrengthBar($('#editPassword').value, $('#editStrengthBar'), $('#editStrengthLabel'));

    // 聚焦名称字段
    setTimeout(() => $('#editName').focus(), 50);
  }

  // ===== 工具函数 =====

  function maskText(text) {
    if (!text) return '';
    if (text.length <= 2) return '••';
    return text[0] + '•'.repeat(Math.min(text.length - 2, 8)) + text[text.length - 1];
  }

  function formatDate(isoStr) {
    const d = new Date(isoStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return diffDays + ' 天前';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function formatDateTime(isoStr) {
    const d = new Date(isoStr);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function copyToClipboard(text, btn) {
    if (!text) {
      showToast('没有可复制的内容', 'error');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => (btn.textContent = orig), 1200);
      }
      showToast('已复制到剪贴板', 'success');
    }).catch(() => {
      showToast('复制失败，请手动复制', 'error');
    });
    resetAutoLockTimer();
  }

  function showToast(msg, type) {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.className = 'toast show';
    if (type === 'error') toast.classList.add('error');
    else if (type === 'success') toast.classList.add('success');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.className = 'toast';
    }, 2000);
  }

  function showConfirm(title, text, callback, isDanger) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    const okBtn = $('#confirmOkBtn');
    okBtn.textContent = isDanger ? '确认删除' : '确认';
    okBtn.className = 'btn ' + (isDanger ? 'danger' : 'primary');
    confirmCallback = callback;
    $('#confirmModal').classList.add('show');
  }

  function hideConfirm() {
    $('#confirmModal').classList.remove('show');
    confirmCallback = null;
  }

  // ===== 事件绑定 =====

  function bindEvents() {
    // --- 锁定/设置界面 ---
    $('#unlockBtn').onclick = handleUnlock;
    $('#unlockPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUnlock();
    });

    $('#setupBtn').onclick = handleSetup;
    $('#setupPassword2').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSetup();
    });
    $('#setupPassword').addEventListener('input', () => {
      updateStrengthBar($('#setupPassword').value, $('#setupStrengthBar'), $('#setupStrengthLabel'));
    });

    $('#forgotLink').onclick = () => {
      showConfirm(
        '重置保险箱',
        '警告：忘记主密码无法找回！重置将删除所有已保存的密码数据，此操作不可撤销。确定要重置吗？',
        () => {
          resetVault();
          showLockScreen();
          showToast('保险箱已重置', 'success');
        },
        true
      );
    };

    // --- 侧边栏 ---
    $('#addEntryBtn').onclick = () => {
      isEditing = true;
      currentEntryId = null;
      renderPasswordList();
    };

    $('#searchInput').addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      currentEntryId = null;
      renderPasswordList();
    });

    $('#mobileMenuBtn').onclick = () => {
      $('#pwSidebar').classList.toggle('show');
    };

    // --- 工具栏 ---
    $('#lockBtn').onclick = () => {
      lockVault();
      showToast('保险箱已锁定', '');
    };

    $('#settingsBtn').onclick = () => {
      $('#autoLockTime').value = autoLockMinutes;
      $('#settingsModal').classList.add('show');
    };

    $('#settingsCloseBtn').onclick = () => {
      $('#settingsModal').classList.remove('show');
    };

    // 自动锁定设置
    $('#autoLockTime').onchange = (e) => {
      autoLockMinutes = parseInt(e.target.value, 10) || 0;
      saveSettings();
      resetAutoLockTimer();
      showToast('设置已保存', 'success');
    };

    // 设置面板的导入导出
    $('#settingsImportBtn').onclick = () => {
      $('#settingsModal').classList.remove('show');
      triggerImport();
    };

    $('#settingsExportEncBtn').onclick = () => {
      $('#settingsModal').classList.remove('show');
      handleExportEncrypted();
    };

    $('#settingsExportPlainBtn').onclick = () => {
      $('#settingsModal').classList.remove('show');
      showConfirm(
        '导出明文密码',
        '警告：导出的文件包含所有明文密码，请妥善保管，不要发送给他人或上传到云端。确定要导出吗？',
        () => handleExportPlain(),
        true
      );
    };

    // 重置保险箱
    $('#resetVaultBtn').onclick = () => {
      showConfirm(
        '重置保险箱',
        '警告：这将删除所有密码数据并清除主密码，数据将永久丢失！建议先导出备份。确定要重置吗？',
        () => {
          $('#settingsModal').classList.remove('show');
          resetVault();
          showLockScreen();
          showToast('保险箱已重置', 'success');
        },
        true
      );
    };

    // --- 导入导出按钮 ---
    $('#importBtn').onclick = triggerImport;
    $('#exportBtn').onclick = () => {
      showConfirm(
        '导出加密备份',
        '将导出加密的 JSON 备份文件。使用此文件恢复时需要输入当前主密码。确定导出吗？',
        () => handleExportEncrypted(),
        false
      );
    };

    // 文件导入
    $('#importFileInput').onchange = handleImportFile;

    // --- 详情视图 ---
    $('#backToListBtn').onclick = () => {
      currentEntryId = null;
      passwordVisible = false;
      renderPasswordList();
    };

    $('#editEntryBtn').onclick = () => {
      isEditing = true;
      renderPasswordList();
    };

    $('#deleteEntryBtn').onclick = () => {
      const entry = getEntry(currentEntryId);
      if (!entry) return;
      showConfirm(
        '删除密码',
        `确定要删除「${entry.name}」吗？此操作不可撤销。`,
        () => {
          deleteEntry(currentEntryId);
          currentEntryId = null;
          renderCategories();
          renderPasswordList();
          showToast('已删除', 'success');
        },
        true
      );
    };

    $('#togglePwVisibility').onclick = () => {
      passwordVisible = !passwordVisible;
      const entry = getEntry(currentEntryId);
      if (!entry) return;
      $('#detailPassword').textContent = passwordVisible ? (entry.password || '-') : '••••••••';
      $('#togglePwVisibility').textContent = passwordVisible ? '🙈' : '👁';
    };

    // --- 编辑视图 ---
    $('#cancelEditBtn').onclick = () => {
      if (currentEntryId) {
        isEditing = false;
        renderPasswordList();
      } else {
        isEditing = false;
        currentEntryId = null;
        renderPasswordList();
      }
    };

    $('#saveEntryBtn').onclick = handleSaveEntry;

    // 密码输入 - 强度检测
    $('#editPassword').addEventListener('input', () => {
      updateStrengthBar($('#editPassword').value, $('#editStrengthBar'), $('#editStrengthLabel'));
    });

    // 密码可见性切换
    $('#editTogglePw').onclick = () => {
      const input = $('#editPassword');
      if (input.type === 'password') {
        input.type = 'text';
        $('#editTogglePw').textContent = '🙈';
      } else {
        input.type = 'password';
        $('#editTogglePw').textContent = '👁';
      }
    };

    // 显示/隐藏生成器面板
    $('#toggleGenBtn').onclick = () => {
      const panel = $('#genPanel');
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
      if (panel.style.display !== 'none') {
        // 更新生成器强度
        updateGenStrength();
      }
    };

    // 密码生成器
    $('#genLength').addEventListener('input', (e) => {
      $('#genLengthVal').textContent = e.target.value;
      updateGenStrength();
    });

    ['genUpper', 'genLower', 'genDigit', 'genSymbol'].forEach(id => {
      $('#' + id).addEventListener('change', updateGenStrength);
    });

    $('#genPasswordBtn').onclick = () => {
      const len = parseInt($('#genLength').value, 10);
      const pwd = generatePassword(
        len,
        $('#genUpper').checked,
        $('#genLower').checked,
        $('#genDigit').checked,
        $('#genSymbol').checked
      );
      if (pwd) {
        $('#editPassword').value = pwd;
        updateStrengthBar(pwd, $('#editStrengthBar'), $('#editStrengthLabel'));
        updateGenStrength(pwd);
      }
    };

    // --- 确认对话框 ---
    $('#confirmCancelBtn').onclick = hideConfirm;
    $('#confirmOkBtn').onclick = () => {
      if (confirmCallback) confirmCallback();
      hideConfirm();
    };

    // 点击遮罩关闭
    $('#confirmModal').onclick = (e) => {
      if (e.target === $('#confirmModal')) hideConfirm();
    };

    $('#settingsModal').onclick = (e) => {
      if (e.target === $('#settingsModal')) {
        $('#settingsModal').classList.remove('show');
      }
    };

    // 设置活动监听器（用于自动锁定）
    setupActivityListeners();
  }

  function updateGenStrength(password) {
    if (!password) {
      // 根据当前设置预估
      const len = parseInt($('#genLength').value, 10);
      let pool = 0;
      if ($('#genUpper').checked) pool += 26;
      if ($('#genLower').checked) pool += 26;
      if ($('#genDigit').checked) pool += 10;
      if ($('#genSymbol').checked) pool += 28;
      const entropy = len * Math.log2(pool || 1);
      const s = evaluateStrength('x'.repeat(Math.floor(entropy / Math.log2(pool || 2))));
      $('#genStrengthBar').style.width = pool ? s.score + '%' : '0%';
      $('#genStrengthBar').style.background = pool ? s.color : 'var(--muted)';
      $('#genStrengthLabel').textContent = pool ? s.label : '-';
    } else {
      const s = evaluateStrength(password);
      $('#genStrengthBar').style.width = s.score + '%';
      $('#genStrengthBar').style.background = s.color;
      $('#genStrengthLabel').textContent = s.label;
    }
  }

  // ===== 事件处理函数 =====

  async function handleUnlock() {
    const password = $('#unlockPassword').value;
    if (!password) {
      showToast('请输入主密码', 'error');
      return;
    }

    $('#unlockBtn').disabled = true;
    $('#unlockBtn').textContent = '解锁中...';

    try {
      const ok = await unlockVault(password);
      if (ok) {
        showToast('解锁成功', 'success');
        showVaultScreen();
      } else {
        showToast('主密码错误', 'error');
        $('#unlockPassword').value = '';
        $('#unlockPassword').focus();
      }
    } catch (e) {
      showToast('解锁失败：' + e.message, 'error');
    } finally {
      $('#unlockBtn').disabled = false;
      $('#unlockBtn').textContent = '解锁';
    }
  }

  async function handleSetup() {
    const pw1 = $('#setupPassword').value;
    const pw2 = $('#setupPassword2').value;

    if (!pw1) {
      showToast('请输入主密码', 'error');
      return;
    }
    if (pw1.length < 6) {
      showToast('主密码至少需要 6 个字符', 'error');
      return;
    }
    if (pw1 !== pw2) {
      showToast('两次输入的密码不一致', 'error');
      return;
    }

    $('#setupBtn').disabled = true;
    $('#setupBtn').textContent = '创建中...';

    try {
      await createVault(pw1);
      showToast('保险箱创建成功', 'success');
      showVaultScreen();
    } catch (e) {
      showToast('创建失败：' + e.message, 'error');
    } finally {
      $('#setupBtn').disabled = false;
      $('#setupBtn').textContent = '创建保险箱';
    }
  }

  function handleSaveEntry() {
    const name = $('#editName').value.trim();
    const password = $('#editPassword').value;

    if (!name) {
      showToast('请输入名称', 'error');
      $('#editName').focus();
      return;
    }
    if (!password) {
      showToast('请输入密码', 'error');
      $('#editPassword').focus();
      return;
    }

    const entryData = {
      name: name,
      username: $('#editUsername').value.trim(),
      password: password,
      website: $('#editWebsite').value.trim(),
      category: $('#editCategory').value,
      notes: $('#editNotes').value.trim()
    };

    if (currentEntryId) {
      updateEntry(currentEntryId, entryData);
      showToast('已保存修改', 'success');
    } else {
      const newEntry = addEntry(entryData);
      currentEntryId = newEntry.id;
      showToast('已添加新密码', 'success');
    }

    isEditing = false;
    renderCategories();
    renderPasswordList();
  }

  function triggerImport() {
    $('#importFileInput').click();
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const fileName = file.name.toLowerCase();

      try {
        let imported;
        let isEncrypted = false;

        if (fileName.endsWith('.json')) {
          const data = JSON.parse(content);
          if (data.type === 'encrypted' || (data.salt && data.iv && data.data)) {
            // 加密的 JSON，需要主密码解密
            isEncrypted = true;
            showToast('检测到加密备份文件，请输入备份时的主密码', '');
            // 简单处理：提示用户
            setTimeout(() => {
              const backupPw = prompt('请输入该备份文件的主密码（创建备份时使用的主密码）：');
              if (!backupPw) {
                showToast('已取消导入', '');
                return;
              }
              importEncryptedBackup(data, backupPw);
            }, 300);
            return;
          } else {
            imported = importFromPlainJSON(content);
          }
        } else if (fileName.endsWith('.csv')) {
          imported = importFromCSV(content);
        } else {
          showToast('不支持的文件格式', 'error');
          return;
        }

        if (!imported || imported.length === 0) {
          showToast('未找到可导入的条目', 'error');
          return;
        }

        showConfirm(
          '确认导入',
          `即将导入 ${imported.length} 条密码记录，将合并到现有数据中。确定导入吗？`,
          () => {
            entries = imported.concat(entries);
            saveVault();
            renderCategories();
            renderPasswordList();
            showToast(`成功导入 ${imported.length} 条记录`, 'success');
          },
          false
        );
      } catch (err) {
        showToast('导入失败：' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // 重置 input
  }

  async function importEncryptedBackup(data, backupPassword) {
    try {
      const salt = base64ToBytes(data.salt);
      const backupKey = await deriveKey(backupPassword, salt);
      const plaintext = await decryptData(backupKey, data.iv, data.data);
      const vaultData = JSON.parse(plaintext);
      const imported = vaultData.entries || [];

      if (!imported.length) {
        showToast('备份文件中没有数据', 'error');
        return;
      }

      // 重新生成 ID 避免冲突
      const now = new Date().toISOString();
      imported.forEach(e => {
        e.id = generateId();
        if (!e.createdAt) e.createdAt = now;
        if (!e.updatedAt) e.updatedAt = now;
      });

      showConfirm(
        '确认导入',
        `即将从加密备份导入 ${imported.length} 条密码记录，将合并到现有数据中。确定导入吗？`,
        () => {
          entries = imported.concat(entries);
          saveVault();
          renderCategories();
          renderPasswordList();
          showToast(`成功导入 ${imported.length} 条记录`, 'success');
        },
        false
      );
    } catch (e) {
      showToast('导入失败：密码错误或文件损坏', 'error');
    }
  }

  function handleExportEncrypted() {
    const content = exportEncrypted();
    if (!content) {
      showToast('没有可导出的数据', 'error');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadFile('password-vault-backup-' + date + '.json', content, 'application/json');
    showToast('加密备份已导出', 'success');
  }

  function handleExportPlain() {
    const content = exportPlain();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile('passwords-plain-' + date + '.json', content, 'application/json');
    showToast('明文数据已导出', 'success');
  }

  // ===== 初始化 =====

  function init() {
    loadSettings();
    bindEvents();

    // 检查是否有保险箱数据
    if (hasVault()) {
      showLockScreen();
    } else {
      showLockScreen(); // 同样显示锁定界面，但会切换到设置模式
    }

    // 页面隐藏时自动锁定（额外的安全措施）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && masterKey && autoLockMinutes > 0) {
        // 页面隐藏时重置计时器（如果设置很短则立即锁定）
        if (autoLockMinutes <= 1) {
          lockVault();
          showToast('保险箱已自动锁定', '');
        }
      }
    });
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
