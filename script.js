(() => {
  'use strict';

  const STORAGE_KEY = 'bloco-de-notas:v1';
  const PREVIEW_LIMIT = 5;

  const $ = (selector) => document.querySelector(selector);

  const els = {
    home: $('#home-view'),
    editor: $('#editor-view'),
    cards: $('#cards'),
    empty: $('#btn-empty-new'),
    fab: $('#btn-new'),
    back: $('#btn-back'),
    deleteList: $('#btn-delete-list'),
    title: $('#title'),
    items: $('#items'),
    newItem: $('#new-item'),
    footer: $('#sheet-footer'),
    counter: $('#counter'),
    uncheckAll: $('#btn-uncheck-all'),
    dialog: $('#confirm-dialog'),
  };

  const DELETE_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  let lists = load();
  let currentId = null;
  let navigatedInApp = false;
  let reorderTimer = null;

  const REORDER_DELAY = 400;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Armazenamento ---------- */

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data)) return [];
      return data
        .filter((l) => l && typeof l.id === 'string')
        .map((l) => ({
          id: l.id,
          title: typeof l.title === 'string' ? l.title : '',
          items: Array.isArray(l.items)
            ? l.items
                .filter((i) => i && typeof i.id === 'string')
                .map((i) => ({ id: i.id, text: String(i.text || ''), done: !!i.done }))
            : [],
          createdAt: Number(l.createdAt) || Date.now(),
          updatedAt: Number(l.updatedAt) || Date.now(),
        }));
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
    } catch {
      /* armazenamento indisponível: o app continua funcionando na sessão */
    }
  }

  function touch(list) {
    list.updatedAt = Date.now();
    save();
  }

  /* ---------- Utilidades ---------- */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function currentList() {
    return lists.find((l) => l.id === currentId);
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    let month = d.toLocaleDateString('pt-BR', { month: 'long' });
    month = month.charAt(0).toUpperCase() + month.slice(1);
    let text = `${d.getDate()} de ${month}`;
    if (d.getFullYear() !== now.getFullYear()) text += ` de ${d.getFullYear()}`;
    return text;
  }

  function autosize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  function autosizeAll() {
    autosize(els.title);
    els.items.querySelectorAll('.item-text').forEach(autosize);
  }

  function isEmptyList(list) {
    return !list.title.trim() && list.items.length === 0;
  }

  function discardIfEmpty(id) {
    const list = lists.find((l) => l.id === id);
    if (list && isEmptyList(list)) {
      lists = lists.filter((l) => l.id !== id);
      save();
    }
  }

  /* ---------- Navegação ---------- */

  function route() {
    const match = location.hash.match(/^#\/lista\/(.+)$/);
    const list = match && lists.find((l) => l.id === match[1]);
    if (list) showEditor(list);
    else showHome();
  }

  function goHome() {
    if (navigatedInApp) history.back();
    else location.replace('#/');
  }

  function openList(id) {
    navigatedInApp = true;
    location.hash = '#/lista/' + id;
  }

  function createList() {
    const now = Date.now();
    const list = { id: uid(), title: '', items: [], createdAt: now, updatedAt: now };
    lists.unshift(list);
    openList(list.id);
  }

  /* ---------- Tela inicial ---------- */

  function showHome() {
    if (currentId) {
      discardIfEmpty(currentId);
      currentId = null;
    }
    cancelReorder();
    document.title = 'Minhas listas';
    els.editor.hidden = true;
    els.home.hidden = false;
    els.fab.hidden = false;
    renderHome();
  }

  function renderHome() {
    const sorted = [...lists].sort((a, b) => b.updatedAt - a.updatedAt);
    els.cards.replaceChildren(...sorted.map(cardEl));
    const isEmpty = sorted.length === 0;
    els.empty.hidden = !isEmpty;
    els.cards.hidden = isEmpty;
  }

  function cardEl(list) {
    const card = h('button', 'card');
    card.type = 'button';
    card.dataset.id = list.id;

    const title = list.title.trim();
    card.append(h('span', 'card-title' + (title ? '' : ' untitled'), title || 'Sem título'));

    const body = h('span', 'card-items');
    sortedItems(list).slice(0, PREVIEW_LIMIT).forEach((item) => {
      const row = h('span', 'card-item' + (item.done ? ' done' : ''));
      row.append(h('span', 'mini-box'), h('span', 'card-text', item.text));
      body.append(row);
    });
    if (list.items.length > PREVIEW_LIMIT) {
      const rest = list.items.length - PREVIEW_LIMIT;
      body.append(h('span', 'card-more', `+ ${rest} ${rest === 1 ? 'item' : 'itens'}`));
    }
    if (list.items.length === 0) body.append(h('span', 'card-empty', 'Lista vazia'));
    card.append(body);

    const done = list.items.filter((i) => i.done).length;
    const meta = h('span', 'card-meta');
    meta.append(
      h('span', null, list.items.length ? `${done} de ${list.items.length}` : ''),
      h('span', null, formatDate(list.updatedAt))
    );
    card.append(meta);

    return card;
  }

  /* ---------- Editor ---------- */

  function showEditor(list) {
    if (currentId && currentId !== list.id) discardIfEmpty(currentId);
    currentId = list.id;

    els.home.hidden = true;
    els.fab.hidden = true;
    els.editor.hidden = false;

    els.title.value = list.title;
    cancelReorder();
    els.items.replaceChildren(...sortedItems(list).map(itemEl));
    els.newItem.value = '';
    autosizeAll();
    updateFooter();
    updateDocumentTitle();
    window.scrollTo(0, 0);

    if (isEmptyList(list)) els.title.focus();
  }

  function updateDocumentTitle() {
    const list = currentList();
    const title = list && list.title.trim();
    document.title = title ? `${title} – Minhas listas` : 'Nova lista';
  }

  function itemEl(item) {
    const li = h('li', 'item' + (item.done ? ' done' : ''));
    li.dataset.id = item.id;

    const checkbox = h('input', 'check');
    checkbox.type = 'checkbox';
    checkbox.checked = item.done;
    checkbox.setAttribute('aria-label', 'Marcar item como concluído');

    const text = h('textarea', 'item-text');
    text.rows = 1;
    text.maxLength = 300;
    text.value = item.text;
    text.setAttribute('aria-label', 'Texto do item');

    const del = h('button', 'item-del');
    del.type = 'button';
    del.setAttribute('aria-label', 'Excluir item');
    del.innerHTML = DELETE_ICON;

    li.append(checkbox, text, del);
    return li;
  }

  function findItem(li) {
    const list = currentList();
    return list && list.items.find((i) => i.id === li.dataset.id);
  }

  function addItem(rawText) {
    const text = rawText.trim();
    const list = currentList();
    if (!text || !list) return;

    const item = { id: uid(), text, done: false };
    list.items.push(item);
    touch(list);

    // Se há uma reordenação pendente, resolve antes para o DOM ficar em ordem
    if (reorderTimer) {
      cancelReorder();
      reorderItems(false);
    }

    const li = itemEl(item);
    els.items.insertBefore(li, els.items.querySelector('.item.done'));
    autosize(li.querySelector('.item-text'));
    updateFooter();
  }

  function removeItem(li) {
    if (li.dataset.removed) return;
    li.dataset.removed = '1';

    const list = currentList();
    if (list) {
      list.items = list.items.filter((i) => i.id !== li.dataset.id);
      touch(list);
    }
    li.classList.add('removing');
    setTimeout(() => li.remove(), 150);
    updateFooter();
  }

  function updateFooter() {
    const list = currentList();
    if (!list) return;
    const total = list.items.length;
    const done = list.items.filter((i) => i.done).length;

    els.footer.hidden = total === 0;
    els.counter.textContent = `${done} de ${total} ${total === 1 ? 'concluído' : 'concluídos'}`;
    els.uncheckAll.disabled = done === 0;
  }

  /* ---------- Ordem: não marcados em cima, marcados embaixo ---------- */

  // A lista guarda a ordem original; só a exibição separa marcados e não marcados.
  // Assim, ao desmarcar, o item volta para o lugar de onde veio.
  function sortedItems(list) {
    return [...list.items.filter((i) => !i.done), ...list.items.filter((i) => i.done)];
  }

  function scheduleReorder() {
    clearTimeout(reorderTimer);
    reorderTimer = setTimeout(() => {
      reorderTimer = null;
      reorderItems(true);
    }, REORDER_DELAY);
  }

  function cancelReorder() {
    clearTimeout(reorderTimer);
    reorderTimer = null;
  }

  function reorderItems(animate) {
    const list = currentList();
    if (!list) return;

    const nodes = new Map();
    els.items.querySelectorAll('.item').forEach((li) => nodes.set(li.dataset.id, li));

    const firstTops = new Map();
    nodes.forEach((li, id) => firstTops.set(id, li.getBoundingClientRect().top));

    // Só move o que está fora do lugar
    const active = document.activeElement;
    let cursor = els.items.firstElementChild;
    sortedItems(list).forEach((item) => {
      const li = nodes.get(item.id);
      if (!li) return;
      while (cursor && cursor.dataset.removed) cursor = cursor.nextElementSibling;
      if (li === cursor) cursor = cursor.nextElementSibling;
      else els.items.insertBefore(li, cursor);
    });

    // Mover um elemento no DOM tira o foco dele: devolve o foco
    if (active && active !== document.body && document.activeElement !== active) {
      active.focus({ preventScroll: true });
    }

    if (!animate || reduceMotion.matches) return;

    // Anima cada item do lugar antigo até o novo
    nodes.forEach((li, id) => {
      if (li.dataset.removed) return;
      const dy = firstTops.get(id) - li.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      li.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration: 240, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
      );
    });
  }

  /* ---------- Eventos: itens ---------- */

  els.items.addEventListener('change', (e) => {
    if (!e.target.classList.contains('check')) return;
    const li = e.target.closest('.item');
    const item = findItem(li);
    if (!item) return;

    item.done = e.target.checked;
    li.classList.toggle('done', item.done);
    touch(currentList());
    updateFooter();
    scheduleReorder();
  });

  els.items.addEventListener('input', (e) => {
    if (!e.target.classList.contains('item-text')) return;
    const item = findItem(e.target.closest('.item'));
    if (!item) return;

    item.text = e.target.value.replace(/\n/g, ' ');
    autosize(e.target);
    touch(currentList());
  });

  els.items.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('item-text')) return;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      e.target.blur();
    }
  });

  els.items.addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('item-text')) return;
    const li = e.target.closest('.item');
    const item = findItem(li);
    if (!item) return;

    const trimmed = e.target.value.trim();
    if (!trimmed) {
      removeItem(li);
    } else if (trimmed !== item.text) {
      item.text = trimmed;
      e.target.value = trimmed;
      touch(currentList());
    }
  });

  els.items.addEventListener('click', (e) => {
    const del = e.target.closest('.item-del');
    if (del) removeItem(del.closest('.item'));
  });

  /* ---------- Eventos: adicionar item ---------- */

  els.newItem.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addItem(els.newItem.value);
      els.newItem.value = '';
    }
  });

  els.newItem.addEventListener('paste', (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (!/\r?\n/.test(pasted)) return;
    e.preventDefault();
    pasted.split(/\r?\n/).forEach(addItem);
  });

  /* ---------- Eventos: título ---------- */

  els.title.addEventListener('input', () => {
    const list = currentList();
    if (!list) return;
    list.title = els.title.value.replace(/\n/g, ' ');
    autosize(els.title);
    touch(list);
    updateDocumentTitle();
  });

  els.title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      els.newItem.focus();
    }
  });

  /* ---------- Eventos: ações da lista ---------- */

  els.uncheckAll.addEventListener('click', () => {
    const list = currentList();
    if (!list) return;
    list.items.forEach((item) => (item.done = false));
    els.items.querySelectorAll('.item').forEach((li) => {
      li.classList.remove('done');
      li.querySelector('.check').checked = false;
    });
    touch(list);
    updateFooter();
    cancelReorder();
    reorderItems(true);
  });

  els.deleteList.addEventListener('click', () => {
    const list = currentList();
    if (!list) return;
    if (isEmptyList(list)) {
      goHome();
      return;
    }
    els.dialog.returnValue = '';
    els.dialog.showModal();
  });

  els.dialog.addEventListener('close', () => {
    if (els.dialog.returnValue !== 'confirm') return;
    els.dialog.returnValue = '';
    lists = lists.filter((l) => l.id !== currentId);
    currentId = null;
    save();
    goHome();
  });

  els.back.addEventListener('click', goHome);

  /* ---------- Eventos: tela inicial ---------- */

  els.fab.addEventListener('click', createList);
  els.empty.addEventListener('click', createList);

  els.cards.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openList(card.dataset.id);
  });

  /* ---------- Geral ---------- */

  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => {
    if (!els.editor.hidden) autosizeAll();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && !currentId) {
      lists = load();
      renderHome();
    }
  });

  route();
})();
