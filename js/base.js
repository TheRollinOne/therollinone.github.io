// Shared helpers + wiring reused across all pages.

// Debounce: returns a wrapped version of fn that only actually runs after
// `delay` ms have passed with no further calls (e.g. typing in a search box
// or a CR/HD number input). Used so filtering/rendering doesn't run on
// every single keystroke, only once typing pauses.
function debounce(fn, delay){
  let timer = null;
  return function(...args){
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Shared 16-color palette (base.css's --type-1 .. --type-16), used by any
// page that color-codes cards/chips by a category-like field (Slot on
// Magic Items, Category on Feats and Armors, etc).
const TYPE_COLORS = Array.from({length: 16}, (_, i) => `var(--type-${i + 1})`);
// Neutral fallback color (base.css's --type-gray) for a catch-all/"other"
// value that shouldn't consume a slot in the main palette (e.g. the
// Universal school on the Spells page).
const TYPE_GRAY = 'var(--type-gray)';

// Builds a {label: color} map from TYPE_COLORS, cycling back to the start
// once all 16 are used.
// - labels: the raw list of labels needing a color (duplicates/any order OK).
// - preferredOrder: optional array giving a canonical order for some labels
//   (e.g. ['Light Armor','Shield','Medium Armor','Extra','Heavy Armor']).
//   Labels found in it come first, in that order; any other labels present
//   in the data are appended afterward, alphabetically. Omit it (or pass
//   nothing) to just sort every label alphabetically.
function buildTypeColorMap(labels, preferredOrder){
  const unique = Array.from(new Set(labels));
  let ordered;
  if(preferredOrder && preferredOrder.length){
    const known = preferredOrder.filter(l => unique.includes(l));
    const extras = unique.filter(l => !preferredOrder.includes(l)).sort();
    ordered = known.concat(extras);
  } else {
    ordered = unique.slice().sort();
  }
  const map = {};
  ordered.forEach((label, i) => { map[label] = TYPE_COLORS[i % TYPE_COLORS.length]; });
  return map;
}

function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function escapeRegExp(str){
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Roman-numeral-aware comparison. Standalone uppercase tokens made of
// I/V/X (I..XXXIX) are swapped for their numeric value in the sort key only,
// so "A I, A II, A V, A IX" sorts in numeric order. Everything else
// keeps the usual locale-aware, case-insensitive, numeric-aware behavior.
const ROMAN_TOKEN_RX = /\b(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})\b/g;
function romanToInt(s){
  const val = {I:1, V:5, X:10};
  let total = 0;
  for(let i = 0; i < s.length; i++){
    const cur = val[s[i]], next = val[s[i+1]] || 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}
function naturalCompare(a, b){
  const key = s => String(s).trim().replace(ROMAN_TOKEN_RX, m => m ? romanToInt(m) : m);
  return key(a).localeCompare(key(b), undefined, { sensitivity: 'base', numeric: true });
}

// Sorts a <select>'s options alphabetically by their visible label.
// - The "Any" option (empty value) always stays first.
// - The current selection is preserved.
// - Comparison is locale-aware, case-insensitive and numeric-aware
//   ("Level 2" before "Level 10").
// Call it right after (re)building a select's options, e.g.
//   sel.innerHTML = '<option value="">Any</option>' + ...;
//   sortSelectOptions(sel);
function sortSelectOptions(selectEl){
  if(!selectEl) return;
  const selected = selectEl.value;
  const opts = Array.from(selectEl.options);
  const first = opts.filter(o => o.value === '');
  const rest = opts.filter(o => o.value !== '');
  rest.sort((a, b) => naturalCompare(a.textContent, b.textContent));
  [...first, ...rest].forEach(o => selectEl.appendChild(o));
  selectEl.value = selected;
}

// Advanced search: whole-word/phrase terms with "+" (must contain) and "-"
// (must NOT contain). An operator only counts at the very start of the input
// or right after whitespace, and only when a non-space character follows it,
// so hyphens inside words ("spell-like") stay plain text. Text before the
// first operator is a required term ("cat +fly" == "+cat +fly"). A term runs
// until the next operator, so "bronze dragon" stays one phrase.
// Returns compiled regexes so callers can parse once, then test many blobs.
//
// Optional opts.prefix (default false): "live" matching. Each term must
// still START at a word boundary, but may end mid-word, so results appear
// while the user is still typing ("cha" matches chain/chainmail, "chain sh"
// matches "chain shirt"). With prefix off, terms are whole words/phrases.
// In prefix mode, any term (plain, + or -) under 2 characters is ignored
// until the user types more, so the list stays unfiltered at 1 letter.
function parseSearchQuery(query, opts){
  const prefix = !!(opts && opts.prefix);
  const q = String(query || '').trim().toLowerCase();
  const must = [], not = [];
  if(!q) return {must, not};
  const isOp = ch => ch === '+' || ch === '-' || ch === '\u2013' || ch === '\u2212';
  const ops = [];
  for(let i = 0; i < q.length; i++){
    if(!isOp(q[i])) continue;
    const startOk = i === 0 || /\s/.test(q[i-1]);
    const next = q[i+1];
    if(startOk && next && !/\s/.test(next)) ops.push(i);
  }
  function add(negative, text){
    // drop a dangling operator left at the end while typing ("poison -")
    const t = text.replace(/(^|\s)[+\-\u2013\u2212]$/, '').trim();
    if(!t) return;
    // live mode: ignore terms shorter than 2 characters (a single letter
    // matches almost everything and just makes the list flicker)
    if(prefix && t.length < 2) return;
    const rx = new RegExp('\\b' + escapeRegExp(t) + (prefix ? '' : '\\b'));
    (negative ? not : must).push(rx);
  }
  add(false, q.slice(0, ops.length ? ops[0] : q.length));
  ops.forEach((pos, k) => {
    const end = k + 1 < ops.length ? ops[k+1] : q.length;
    add(q[pos] !== '+', q.slice(pos + 1, end));
  });
  return {must, not};
}

function matchesParsedQuery(blob, parsed){
  return parsed.must.every(rx => rx.test(blob)) && !parsed.not.some(rx => rx.test(blob));
}

// Wraps parseSearchQuery/matchesParsedQuery with a one-slot cache so the
// query string is parsed once per change, not once per item (matchesQuery
// is normally called from inside a list's .filter() callback).
// Pass { prefix: true } for live as-you-type matching (see parseSearchQuery).
function createQueryMatcher(opts){
  let parsedFor = null, parsedQuery = null;
  return function matches(blob, query){
    if(query !== parsedFor){ parsedFor = query; parsedQuery = parseSearchQuery(query, opts); }
    return matchesParsedQuery(blob, parsedQuery);
  };
}

// Search scope toggle: a "Names Only | All Fields" button pair placed right
// under the search box. Names Only is the default. If the page's HTML
// doesn't already contain #searchScope, it is created and inserted after
// searchWrapEl, so a page only needs this one call. Styling lives in
// base.css (.search-scope, reusing .sort-btn).
// onChange(scope) receives 'names' or 'all'. Returns the initial scope.
// A page keeps the value in its state (e.g. state.searchScope) and picks
// which search blob to match against (name only vs. everything).
const SEARCH_SCOPE_NAMES = 'names';
const SEARCH_SCOPE_ALL = 'all';
function initSearchScope(searchWrapEl, onChange){
  let el = document.getElementById('searchScope');
  if(!el){
    el = document.createElement('div');
    el.id = 'searchScope';
    el.className = 'search-scope';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Search scope');
    el.innerHTML =
      `<button type="button" class="sort-btn active" data-scope="${SEARCH_SCOPE_NAMES}" aria-pressed="true">Names Only</button>` +
      `<button type="button" class="sort-btn" data-scope="${SEARCH_SCOPE_ALL}" aria-pressed="false">All Fields</button>`;
    searchWrapEl.insertAdjacentElement('afterend', el);
  }
  const btns = el.querySelectorAll('[data-scope]');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if(onChange) onChange(btn.dataset.scope);
    });
  });
  return SEARCH_SCOPE_NAMES;
}

// Search help tooltip (hover; hidden while the box has focus) — shared by
// every catalogue page, only the "Example: ..." text differs per page.
// Uses the site's .hover-tooltip look (label lines + .hover-tooltip-value
// line); positioned like wireHoverCopyTooltip: fixed, centered above the
// search box, clamped to the viewport (flips below if there's no room
// above). Relies on the .hover-tooltip.search-tip CSS rules (currently
// defined in monsters.css); a page needs that block in its own stylesheet
// for this to render styled.
// Pass { prefix: true } as a 4th argument on pages using live prefix search
// so the hint text matches how the search actually behaves.
function wireSearchTooltip(searchInputEl, searchWrapEl, exampleText, opts){
  const prefix = !!(opts && opts.prefix);
  let tip = null;
  function remove(){ if(tip){ tip.remove(); tip = null; } }
  function show(){
    if(tip || document.activeElement === searchInputEl) return;
    tip = document.createElement('div');
    tip.className = 'hover-tooltip search-tip';
    tip.innerHTML =
      (prefix
        ? '<div>Results update as you type; terms match the start of a word.</div>'
        : '<div>Matches whole words or phrases only.</div>') +
      '<div>Use + to require more terms and - to exclude terms.</div>' +
      `<div class="hover-tooltip-value">Example: ${escapeHtml(exampleText)}</div>`;
    document.body.appendChild(tip);
    const r = searchWrapEl.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margin = 8, half = t.width / 2;
    const left = Math.min(Math.max(r.left + r.width / 2, half + margin), window.innerWidth - half - margin);
    tip.style.left = left + 'px';
    if(t.height + margin * 2 > r.top){
      tip.classList.add('below');
      tip.style.top = (r.bottom + margin) + 'px';
    } else {
      tip.style.top = (r.top - margin) + 'px';
    }
    requestAnimationFrame(() => { if(tip) tip.classList.add('show'); });
  }
  searchWrapEl.addEventListener('mouseenter', show);
  searchWrapEl.addEventListener('mouseleave', remove);
  searchInputEl.addEventListener('focus', remove);
  window.addEventListener('scroll', remove, true);
}

// ---- Pagination ("Load more") ----
// Caps how many results actually get rendered/put in the DOM at once,
// since on the big lists (spells, monsters, magic items...) that's what's
// slow — not the .filter() itself. Show 100 at a time; a "Load More..."
// button reveals the next 100, or "Show All" reveals the rest in one go.
const PAGE_SIZE = 100;

// Detects whether any *filter/sort* state changed since the last render,
// so paginate() can jump back to page 1 automatically whenever the result
// set changes — without every individual chip/select/search handler having
// to remember to reset the page itself. `open` (which cards are expanded)
// and `visibleCount` (the pagination cursor) are excluded on purpose: those
// changing shouldn't reset pagination, only an actual filter/sort/search
// change should. Any state key npcs/monsters/etc. add later is covered
// automatically as long as it doesn't start with `_` and isn't `open` or
// `visibleCount`.
function filtersChanged(state){
  const snapshot = {};
  Object.keys(state).forEach(key => {
    if(key === 'open' || key === 'visibleCount' || key.startsWith('_')) return;
    const val = state[key];
    snapshot[key] = (val instanceof Set) ? Array.from(val).sort() : val;
  });
  const sig = JSON.stringify(snapshot);
  const changed = sig !== state._filterSig;
  state._filterSig = sig;
  return changed;
}

// Returns the slice of `results` that should actually be rendered this
// pass, resetting to the first page if the filters changed since last time.
function paginate(state, results){
  if(filtersChanged(state) || !state.visibleCount) state.visibleCount = PAGE_SIZE;
  return results.slice(0, state.visibleCount);
}

// Builds the "Show All" + "Load More..." button row, or '' once everything
// is already shown. Styled like the top-menu-nav links (.top-menu-link) in
// base.css. itemLabelPlural is the plural noun to show, e.g. "Spells".
function showMoreButtonHTML(results, state, itemLabelPlural){
  const shownCount = Math.min(state.visibleCount, results.length);
  const remaining = results.length - shownCount;
  if(remaining <= 0) return '';
  const nextBatch = Math.min(PAGE_SIZE, remaining);
  return `<div class="show-more-row">
    <button type="button" class="show-more-btn show-all-btn" data-show-all>Show All ${escapeHtml(itemLabelPlural)}</button>
    <button type="button" class="show-more-btn" data-show-more>Load ${nextBatch} More <span class="show-more-remaining">(${remaining} left)</span></button>
  </div>`;
}

// Delegated click handling for the "Load More..." / "Show All" buttons —
// safe to call every render() (like wireCardToggle: the listener is only
// attached once per list element, since the buttons themselves get
// replaced by innerHTML on every render). Pass { onLoadMore, onShowAll }.
function wireShowMore(listEl, { onLoadMore, onShowAll }){
  if(listEl._showMoreWired) return;
  listEl._showMoreWired = true;
  listEl.addEventListener('click', e => {
    if(e.target.closest('[data-show-more]')) onLoadMore();
    else if(e.target.closest('[data-show-all]')) onShowAll();
  });
}

// Floating "Copied to Clipboard" tooltip at a click position.
function showCopiedTooltip(x,y){
  let tip = document.createElement('div');
  tip.className = 'copy-tooltip';
  tip.textContent = 'Copied to Clipboard';
  document.body.appendChild(tip);
  tip.style.left = (x) + 'px';
  tip.style.top = (y) + 'px';
  requestAnimationFrame(()=> tip.classList.add('show'));
  setTimeout(()=>{
    tip.classList.remove('show');
    setTimeout(()=>tip.remove(), 250);
  }, 900);
}

// Delegated hover tooltip: shows a two-line "Click to copy / <text>" bubble
// above any matching element inside a container, using position:fixed so it
// escapes ancestors with overflow:hidden (e.g. .spell-card). Horizontally
// clamped to stay inside the viewport. Text comes from the element's
// data-copy attribute unless a different attr name is given.
function wireHoverCopyTooltip(containerId, selector, dataAttr){
  const container = document.getElementById(containerId);
  if(!container) return;
  const attr = dataAttr || 'copy';
  let tip = null, forEl = null;

  function positionTip(el){
    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const margin = 8;
    const half = tipRect.width/2;
    let left = rect.left + rect.width/2;
    left = Math.min(Math.max(left, half+margin), window.innerWidth - half - margin);
    tip.style.left = left + 'px';
    tip.style.top = (rect.top - margin) + 'px';
  }

  function showTip(el){
    const text = el.dataset[attr];
    if(!text) return;
    const label = el.dataset.tipLabel || 'Click to copy';
    tip = document.createElement('div');
    tip.className = 'hover-tooltip';
    tip.innerHTML = `<div>${escapeHtml(label)}</div><div class="hover-tooltip-value">${escapeHtml(text)}</div>`;
    document.body.appendChild(tip);
    forEl = el;
    positionTip(el);
    requestAnimationFrame(()=>{ if(tip) tip.classList.add('show'); });
  }
  function removeTip(){
    if(tip){ tip.remove(); tip = null; forEl = null; }
  }

  container.addEventListener('mouseover', e=>{
    const el = e.target.closest(selector);
    if(!el || el===forEl) return;
    removeTip();
    showTip(el);
  });
  container.addEventListener('mouseout', e=>{
    const el = e.target.closest(selector);
    if(!el || el!==forEl) return;
    if(e.relatedTarget && el.contains(e.relatedTarget)) return;
    removeTip();
  });
  container.addEventListener('click', removeTip);
  container.addEventListener('scroll', removeTip, true);
}

// Delegated click handler: copies any .copyable element's data-copy text,
// except the name element (which has its own open/closed-dependent behavior,
// wired separately by wireCardToggle).
function wireCopyableList(listId, nameClass){
  document.getElementById(listId).addEventListener('click', e=>{
    const el = e.target.closest('.copyable');
    if(!el) return;
    if(el.classList.contains(nameClass)) return;
    const text = el.dataset.copy;
    if(!text) return;
    navigator.clipboard.writeText(text).then(()=>{
      el.classList.add('copied');
      showCopiedTooltip(e.clientX, e.clientY);
      setTimeout(()=>el.classList.remove('copied'), 500);
    }).catch(()=>{});
  });
}

// Card open/close + "click name while open to copy" toggle — shared shape
// between feat cards, spell cards, monster cards and rune cards (only the
// class names differ).
//
// Uses ONE delegated click listener on listEl instead of one per card, so it
// stays cheap with thousands of cards. Safe to call after every render: the
// listener is attached once per list element, and each call just refreshes
// the config it reads (state, class names, onOpen).
// Optional onOpen(idx, cardEl) runs right after a card is opened (used for
// lazily building card bodies).
function wireCardToggle(listEl, state, cardClass, nameClass, onOpen){
  listEl._cardToggleCfg = { state, cardClass, nameClass, onOpen };
  if(listEl._cardToggleWired) return;
  listEl._cardToggleWired = true;

  listEl.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-toggle]');
    if(!el || !listEl.contains(el)) return;
    const { state, cardClass, nameClass, onOpen } = listEl._cardToggleCfg;

    const idx = parseInt(el.dataset.toggle,10);
    const isOpen = state.open.has(idx);
    const nameEl = e.target.closest('.'+nameClass);
    if(nameEl && isOpen){
      const text = nameEl.dataset.copy;
      if(text){
        navigator.clipboard.writeText(text).then(()=>{
          nameEl.classList.add('copied');
          try{ showCopiedTooltip(e.clientX, e.clientY); }catch(err){}
          setTimeout(()=>nameEl.classList.remove('copied'), 500);
        }).catch(()=>{});
      }
      return;
    }
    const otherCopyEl = e.target.closest('.copyable');
    if(otherCopyEl && otherCopyEl !== nameEl){
      // Let the click bubble to the delegated copyable handler instead
      // of toggling the card open/closed (e.g. the head's Roll20 button).
      return;
    }
    if(isOpen) state.open.delete(idx); else state.open.add(idx);
    const card = el.closest('.'+cardClass)
      || listEl.querySelector(`.${cardClass}[data-idx="${idx}"]`);
    card.classList.toggle('open');
    if(!isOpen && onOpen) onOpen(idx, card);
  });
}

// Mobile filters collapse toggle (desktop always shows filters via CSS).
function initMobileFiltersCollapse(){
  const filtersInner = document.getElementById('filtersInner');
  const filtersSummary = document.getElementById('filtersSummary');
  function isMobile(){ return window.matchMedia('(max-width:900px)').matches; }
  if(isMobile()) filtersInner.classList.add('collapsed');
  filtersSummary.addEventListener('click', (e)=>{
    if(e.target.closest('#clearAll')) return;
    filtersInner.classList.toggle('collapsed');
    filtersSummary.classList.toggle('open');
  });
  window.addEventListener('resize', ()=>{
    if(!isMobile()){
      filtersInner.classList.remove('collapsed');
    }
  });
}

// Wires a text input + its "has-query" wrapper + clear icon to a query
// setter and a re-render. Returns the sync function so callers (e.g. a
// "clear all" button) can re-sync the clear-icon visibility manually.
function wireSearchInput({inputEl, wrapEl, clearIconEl, onQuery, render, debounceMs = 200}){
  const debouncedRender = debounce(render, debounceMs);
  function syncClearIcon(){
    wrapEl.classList.toggle('has-query', inputEl.value.length > 0);
  }
  inputEl.addEventListener('input', e=>{
    // onQuery + syncClearIcon stay immediate so the box itself feels
    // instant (clear-icon, styling); only the actual filter/render is
    // debounced, since that's the expensive part on a big list.
    onQuery(e.target.value.trim().toLowerCase());
    syncClearIcon();
    debouncedRender();
  });
  clearIconEl.addEventListener('click', ()=>{
    inputEl.value = '';
    onQuery('');
    syncClearIcon();
    inputEl.focus();
    render(); // explicit clear click -> render right away, no debounce
  });
  return syncClearIcon;
}

// Wires the single-button theme toggle (a round swatch button that opens a
// small popup of Gold/Blue/Green/Orange choices). Call once per page after
// #themeToggle exists in the DOM. onThemeChange (optional) fires after each
// theme switch, e.g. index.html uses it to also swap the hero image.
function initThemeToggle(onThemeChange){
  const wrap = document.getElementById('themeToggle');
  if(!wrap) return;
  const btn = document.getElementById('themeToggleBtn');
  const popup = document.getElementById('themeTogglePopup');
  const swatches = popup.querySelectorAll('[data-theme-choice]');

  function openPopup(){
    popup.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }
  function closePopup(){
    popup.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function applyTheme(theme){
    if (theme === 'gold') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    swatches.forEach(s => s.classList.toggle('active', s.dataset.themeChoice === theme));
    if (onThemeChange) onThemeChange(theme);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popup.hidden) openPopup(); else closePopup();
  });
  swatches.forEach(s => {
    s.addEventListener('click', () => {
      const theme = s.dataset.themeChoice;
      localStorage.setItem('theme', theme);
      applyTheme(theme);
      closePopup();
      btn.focus();
    });
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) closePopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popup.hidden){
      closePopup();
      btn.focus();
    }
  });

  const savedTheme = localStorage.getItem('theme') || 'gold';
  applyTheme(savedTheme);
}