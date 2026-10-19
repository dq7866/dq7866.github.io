/* ============================================================
 * 快速笔记工具 - notes.js
 * 纯前端实现，使用 localStorage 存储笔记
 * ============================================================ */

(function () {
  'use strict';

  // ===== 常量 =====
  const STORAGE_KEY = 'tbx-notes';
  const ACTIVE_KEY = 'tbx-notes-active';
  const MAX_NOTES = 100;
  const DEBOUNCE_MS = 500;

  // ===== 状态 =====
  let notes = [];
  let activeNoteId = null;
  let currentMode = 'edit'; // edit | preview | split
  let saveTimer = null;
  let deleteTargetId = null;

  // ===== DOM 元素 =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {};

  function cacheElements() {
    els.sidebar = $('#notesSidebar');
    els.notesList = $('#notesList');
    els.notesCount = $('#notesCount');
    els.searchInput = $('#searchInput');
    els.newNoteBtn = $('#newNoteBtn');
    els.mobileMenuBtn = $('#mobileMenuBtn');

    els.noNoteState = $('#noNoteState');
    els.editorTitleWrap = $('#editorTitleWrap');
    els.editorContentWrap = $('#editorContentWrap');
    els.previewWrap = $('#previewWrap');
    els.editorFooter = $('#editorFooter');
    els.noteTitle = $('#noteTitle');
    els.noteContent = $('#noteContent');
    els.mdPreview = $('#mdPreview');
    els.charCount = $('#charCount');
    els.wordCount = $('#wordCount');
    els.lineCount = $('#lineCount');
    els.lastModified = $('#lastModified');
    els.saveIndicator = $('#saveIndicator');

    els.modeToggle = $('#modeToggle');
    els.exportBtn = $('#exportBtn');
    els.deleteNoteBtn = $('#deleteNoteBtn');

    els.deleteModal = $('#deleteModal');
    els.deleteModalText = $('#deleteModalText');
    els.cancelDeleteBtn = $('#cancelDeleteBtn');
    els.confirmDeleteBtn = $('#confirmDeleteBtn');
  }

  // ===== 存储 =====
  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      notes = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(notes)) notes = [];
    } catch (e) {
      notes = [];
    }

    try {
      activeNoteId = localStorage.getItem(ACTIVE_KEY);
      if (activeNoteId && !notes.find(n => n.id === activeNoteId)) {
        activeNoteId = notes.length > 0 ? notes[0].id : null;
      }
    } catch (e) {
      activeNoteId = null;
    }

    if (!activeNoteId && notes.length > 0) {
      activeNoteId = notes[0].id;
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
    }
  }

  function saveActiveNoteId() {
    try {
      if (activeNoteId) {
        localStorage.setItem(ACTIVE_KEY, activeNoteId);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch (e) {}
  }

  // ===== 工具函数 =====
  function generateId() {
    return 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;

    // 1分钟内
    if (diff < 60 * 1000) return '刚刚';
    // 1小时内
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    // 今天
    if (d.toDateString() === now.toDateString()) {
      return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    // 昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return '昨天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    // 今年
    if (d.getFullYear() === now.getFullYear()) {
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    // 其他
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
  }

  function formatFullDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Markdown 解析器（简易版）=====
  function parseMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // 代码块 ```lang ... ```
    html = html.replace(/```([\s\S]*?)```/g, function (match, code) {
      // 移除第一行的语言标识
      const lines = code.trim().split('\n');
      let lang = '';
      if (lines.length > 0 && !lines[0].includes('\n') && lines[0].trim().length < 20) {
        lang = lines[0].trim();
        code = lines.slice(1).join('\n');
      } else {
        code = code.trim();
      }
      return '<pre><code' + (lang ? ' class="lang-' + lang + '"' : '') + '>' + code + '</code></pre>';
    });

    // 行内代码 `code`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 分割成行处理（跳过已在代码块中的部分）
    const parts = html.split(/(<pre>[\s\S]*?<\/pre>)/g);
    let result = '';

    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];
      if (part.startsWith('<pre>')) {
        result += part;
        continue;
      }

      // 按行处理
      const lines = part.split('\n');
      let inList = false;
      let inOrderedList = false;
      let inBlockquote = false;
      let listBuffer = [];

      for (let j = 0; j < lines.length; j++) {
        let line = lines[j];

        // 空行
        if (line.trim() === '') {
          if (inList) {
            result += '<ul>' + listBuffer.join('') + '</ul>';
            listBuffer = [];
            inList = false;
          }
          if (inOrderedList) {
            result += '<ol>' + listBuffer.join('') + '</ol>';
            listBuffer = [];
            inOrderedList = false;
          }
          if (inBlockquote) {
            result += '</blockquote>';
            inBlockquote = false;
          }
          continue;
        }

        // 标题
        let hMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) {
          const level = hMatch[1].length;
          const content = parseInlineMarkdown(hMatch[2]);
          result += '<h' + level + '>' + content + '</h' + level + '>';
          continue;
        }

        // 分割线
        if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
          result += '<hr>';
          continue;
        }

        // 无序列表
        let ulMatch = line.match(/^[-*+]\s+(.+)$/);
        if (ulMatch) {
          if (inOrderedList) {
            result += '<ol>' + listBuffer.join('') + '</ol>';
            listBuffer = [];
            inOrderedList = false;
          }
          inList = true;
          listBuffer.push('<li>' + parseInlineMarkdown(ulMatch[1]) + '</li>');
          continue;
        }

        // 有序列表
        let olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
          if (inList) {
            result += '<ul>' + listBuffer.join('') + '</ul>';
            listBuffer = [];
            inList = false;
          }
          inOrderedList = true;
          listBuffer.push('<li>' + parseInlineMarkdown(olMatch[1]) + '</li>');
          continue;
        }

        // 引用
        let bqMatch = line.match(/^>\s?(.+)$/);
        if (bqMatch) {
          if (!inBlockquote) {
            result += '<blockquote>';
            inBlockquote = true;
          }
          result += parseInlineMarkdown(bqMatch[1]) + '<br>';
          continue;
        }

        // 普通段落
        // 如果之前在列表中，先关闭
        if (inList) {
          result += '<ul>' + listBuffer.join('') + '</ul>';
          listBuffer = [];
          inList = false;
        }
        if (inOrderedList) {
          result += '<ol>' + listBuffer.join('') + '</ol>';
          listBuffer = [];
          inOrderedList = false;
        }
        if (inBlockquote) {
          result += '</blockquote>';
          inBlockquote = false;
        }
        result += '<p>' + parseInlineMarkdown(line) + '</p>';
      }

      // 收尾
      if (inList) {
        result += '<ul>' + listBuffer.join('') + '</ul>';
      }
      if (inOrderedList) {
        result += '<ol>' + listBuffer.join('') + '</ol>';
      }
      if (inBlockquote) {
        result += '</blockquote>';
      }
    }

    return result;
  }

  function parseInlineMarkdown(text) {
    function safeUrl(u) {
      const raw = String(u).trim();
      if (/^(https?:|mailto:|tel:|\/|#)/i.test(raw)) return raw;
      return "#";
    }
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (match, label, url) {
      return '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener">' + label + '</a>';
    });

    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (match, alt, url) {
      return '<img src="' + safeUrl(url) + '" alt="' + alt + '" style="max-width:100%">';
    });

    // 粗体 **text** 或 __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体 *text* 或 _text_
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

    // 删除线 ~~text~~
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return text;
  }

  // ===== 笔记列表渲染 =====
  function renderNoteList() {
    const searchQuery = els.searchInput.value.trim().toLowerCase();

    let filtered = notes.slice().sort(function (a, b) {
      return b.updatedAt - a.updatedAt;
    });

    if (searchQuery) {
      filtered = filtered.filter(function (n) {
        return n.title.toLowerCase().includes(searchQuery) ||
               n.content.toLowerCase().includes(searchQuery);
      });
    }

    els.notesCount.textContent = filtered.length + ' / ' + notes.length + ' 条笔记';

    if (filtered.length === 0) {
      if (searchQuery) {
        els.notesList.innerHTML = '<div class="notes-empty">没有找到匹配的笔记</div>';
      } else {
        els.notesList.innerHTML = '<div class="notes-empty">还没有笔记<br>点击上方按钮创建第一篇</div>';
      }
      return;
    }

    let html = '';
    for (let i = 0; i < filtered.length; i++) {
      const note = filtered[i];
      const isActive = note.id === activeNoteId;
      const firstLine = note.content.split('\n')[0] || '无内容';
      const preview = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine;
      const displayTitle = note.title || '无标题笔记';

      html += '<div class="note-item' + (isActive ? ' active' : '') + '" data-id="' + note.id + '">' +
        '<button class="note-item-delete" data-delete="' + note.id + '" title="删除笔记">×</button>' +
        '<div class="note-item-title">' + escapeHtml(displayTitle) + '</div>' +
        '<div class="note-item-preview">' + escapeHtml(preview) + '</div>' +
        '<div class="note-item-date">' + formatDate(note.updatedAt) + '</div>' +
      '</div>';
    }
    els.notesList.innerHTML = html;
  }

  // ===== 编辑器渲染 =====
  function renderEditor() {
    const note = getActiveNote();

    if (!note) {
      els.noNoteState.style.display = 'flex';
      els.editorTitleWrap.style.display = 'none';
      els.editorContentWrap.style.display = 'none';
      els.previewWrap.style.display = 'none';
      els.editorFooter.style.display = 'none';
      els.exportBtn.style.display = 'none';
      els.deleteNoteBtn.style.display = 'none';
      return;
    }

    els.noNoteState.style.display = 'none';
    els.editorTitleWrap.style.display = 'block';
    els.editorFooter.style.display = 'flex';
    els.exportBtn.style.display = 'inline-flex';
    els.deleteNoteBtn.style.display = 'inline-flex';

    // 只在值不同时更新，避免光标跳动
    if (els.noteTitle.value !== note.title) {
      els.noteTitle.value = note.title;
    }
    if (els.noteContent.value !== note.content) {
      els.noteContent.value = note.content;
    }

    updateStats();
    updateLastModified();
    updatePreview();
    applyMode();
  }

  function updateStats() {
    const content = els.noteContent.value;
    const charCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const lineCount = content ? content.split('\n').length : 0;

    els.charCount.textContent = charCount.toLocaleString();
    els.wordCount.textContent = wordCount.toLocaleString();
    els.lineCount.textContent = lineCount.toLocaleString();
  }

  function updateLastModified() {
    const note = getActiveNote();
    if (note) {
      els.lastModified.textContent = formatFullDate(note.updatedAt);
    }
  }

  function updatePreview() {
    const content = els.noteContent.value;
    els.mdPreview.innerHTML = parseMarkdown(content);
  }

  function applyMode() {
    // 更新按钮状态
    const buttons = els.modeToggle.querySelectorAll('button');
    buttons.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === currentMode);
    });

    // 根据模式显示/隐藏区域
    if (currentMode === 'edit') {
      els.editorContentWrap.style.display = 'block';
      els.previewWrap.style.display = 'none';
    } else if (currentMode === 'preview') {
      els.editorContentWrap.style.display = 'none';
      els.previewWrap.style.display = 'block';
      updatePreview();
    } else if (currentMode === 'split') {
      els.editorContentWrap.style.display = 'block';
      els.previewWrap.style.display = 'block';
      // 分屏模式需要调整布局
      els.editorContentWrap.style.flex = '1';
      els.previewWrap.style.flex = '1';
      els.previewWrap.style.borderLeft = '1px solid var(--line)';
      els.previewWrap.style.paddingLeft = '16px';
      updatePreview();
    }
  }

  // ===== 笔记操作 =====
  function getActiveNote() {
    return notes.find(function (n) { return n.id === activeNoteId; }) || null;
  }

  function createNote() {
    if (notes.length >= MAX_NOTES) {
      alert('最多只能创建 ' + MAX_NOTES + ' 条笔记，请先删除一些旧笔记。');
      return;
    }

    const now = Date.now();
    const newNote = {
      id: generateId(),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now
    };

    notes.unshift(newNote);
    activeNoteId = newNote.id;
    saveNotes();
    saveActiveNoteId();
    renderNoteList();
    renderEditor();

    // 移动端自动隐藏侧边栏
    if (window.innerWidth <= 768) {
      els.sidebar.classList.remove('show');
    }

    // 聚焦标题
    setTimeout(function () {
      els.noteTitle.focus();
    }, 50);
  }

  function selectNote(id) {
    if (activeNoteId === id) return;
    activeNoteId = id;
    saveActiveNoteId();
    renderNoteList();
    renderEditor();

    // 移动端自动隐藏侧边栏
    if (window.innerWidth <= 768) {
      els.sidebar.classList.remove('show');
    }
  }

  function deleteNote(id) {
    const note = notes.find(function (n) { return n.id === id; });
    if (!note) return;

    deleteTargetId = id;
    const title = note.title || '无标题笔记';
    els.deleteModalText.textContent = '确定要删除「' + title + '」吗？此操作不可撤销。';
    els.deleteModal.classList.add('show');
  }

  function confirmDelete() {
    if (!deleteTargetId) return;

    const idx = notes.findIndex(function (n) { return n.id === deleteTargetId; });
    if (idx >= 0) {
      notes.splice(idx, 1);
    }

    // 如果删除的是当前活动笔记
    if (deleteTargetId === activeNoteId) {
      if (notes.length > 0) {
        // 选择相邻的笔记
        activeNoteId = notes[Math.min(idx, notes.length - 1)].id;
      } else {
        activeNoteId = null;
      }
      saveActiveNoteId();
    }

    deleteTargetId = null;
    saveNotes();
    renderNoteList();
    renderEditor();
    hideDeleteModal();
  }

  function hideDeleteModal() {
    els.deleteModal.classList.remove('show');
    deleteTargetId = null;
  }

  function autoSave() {
    const note = getActiveNote();
    if (!note) return;

    // 更新保存状态
    els.saveIndicator.textContent = '● 保存中...';
    els.saveIndicator.className = 'save-indicator saving';

    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      const activeNote = getActiveNote();
      if (!activeNote) return;

      activeNote.title = els.noteTitle.value;
      activeNote.content = els.noteContent.value;
      activeNote.updatedAt = Date.now();

      saveNotes();
      renderNoteList();
      updateLastModified();

      els.saveIndicator.textContent = '✓ 已保存';
      els.saveIndicator.className = 'save-indicator saved';
    }, DEBOUNCE_MS);
  }

  function exportNote() {
    const note = getActiveNote();
    if (!note) return;

    const title = note.title || '无标题笔记';
    const content = (note.title ? '# ' + note.title + '\n\n' : '') + note.content;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title.replace(/[\\/:*?"<>|]/g, '_') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 新建笔记
    els.newNoteBtn.addEventListener('click', createNote);

    // 搜索
    els.searchInput.addEventListener('input', function () {
      renderNoteList();
    });

    // 笔记列表点击（事件委托）
    els.notesList.addEventListener('click', function (e) {
      // 删除按钮
      const deleteBtn = e.target.closest('[data-delete]');
      if (deleteBtn) {
        e.stopPropagation();
        deleteNote(deleteBtn.dataset.delete);
        return;
      }

      // 笔记项
      const item = e.target.closest('.note-item');
      if (item) {
        selectNote(item.dataset.id);
      }
    });

    // 标题输入
    els.noteTitle.addEventListener('input', function () {
      autoSave();
      updateStats();
    });

    // 内容输入
    els.noteContent.addEventListener('input', function () {
      autoSave();
      updateStats();
      if (currentMode === 'preview' || currentMode === 'split') {
        updatePreview();
      }
    });

    // 模式切换
    els.modeToggle.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      currentMode = btn.dataset.mode;
      applyMode();
    });

    // 导出
    els.exportBtn.addEventListener('click', exportNote);

    // 删除当前笔记
    els.deleteNoteBtn.addEventListener('click', function () {
      if (activeNoteId) {
        deleteNote(activeNoteId);
      }
    });

    // 删除确认对话框
    els.cancelDeleteBtn.addEventListener('click', hideDeleteModal);
    els.confirmDeleteBtn.addEventListener('click', confirmDelete);
    els.deleteModal.addEventListener('click', function (e) {
      if (e.target === els.deleteModal) {
        hideDeleteModal();
      }
    });

    // 移动端菜单
    els.mobileMenuBtn.addEventListener('click', function () {
      els.sidebar.classList.toggle('show');
    });

    // 键盘快捷键
    document.addEventListener('keydown', function (e) {
      // Ctrl/Cmd + N: 新建笔记
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNote();
        return;
      }

      // Ctrl/Cmd + S: 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // 立即保存
        const note = getActiveNote();
        if (note) {
          clearTimeout(saveTimer);
          note.title = els.noteTitle.value;
          note.content = els.noteContent.value;
          note.updatedAt = Date.now();
          saveNotes();
          renderNoteList();
          updateLastModified();
          els.saveIndicator.textContent = '✓ 已保存';
          els.saveIndicator.className = 'save-indicator saved';
        }
        return;
      }

      // Ctrl/Cmd + F: 搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        els.searchInput.focus();
        // 移动端显示侧边栏
        if (window.innerWidth <= 768) {
          els.sidebar.classList.add('show');
        }
        return;
      }

      // Delete/Backspace 删除当前笔记（焦点不在输入框时）
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          document.activeElement !== els.noteTitle &&
          document.activeElement !== els.noteContent &&
          document.activeElement !== els.searchInput &&
          !document.activeElement.matches('input, textarea')) {
        if (activeNoteId) {
          e.preventDefault();
          deleteNote(activeNoteId);
        }
        return;
      }

      // Escape: 关闭模态框
      if (e.key === 'Escape') {
        if (els.deleteModal.classList.contains('show')) {
          hideDeleteModal();
        }
      }
    });

    // Tab 键在 textarea 中插入两个空格
    els.noteContent.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const value = this.value;
        this.value = value.slice(0, start) + '  ' + value.slice(end);
        this.selectionStart = this.selectionEnd = start + 2;
        // 触发 input 事件以自动保存
        this.dispatchEvent(new Event('input'));
      }
    });
  }

  // ===== 初始化 =====
  function init() {
    cacheElements();
    loadNotes();
    bindEvents();
    renderNoteList();
    renderEditor();
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 注册页面快捷键（快捷键指南使用）
  window.TBX_pageShortcuts = [
    { key: "Ctrl+N", name: "新建笔记", category: "编辑" },
    { key: "Ctrl+S", name: "立即保存", category: "编辑" },
    { key: "Ctrl+F", name: "搜索笔记", category: "编辑" },
    { key: "Delete", name: "删除当前笔记", category: "编辑" },
    { key: "Tab", name: "插入缩进", category: "编辑" }
  ];
})();
