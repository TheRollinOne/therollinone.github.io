// Shared helpers + wiring reused across the Feats, Spells, and Runes pages.

function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function escapeRegExp(str){
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word/phrase match against a precomputed lowercase search blob.
function matchesQueryOnBlob(blob, query){
  if(!query) return true;
  const q = query.trim().toLowerCase();
  if(q.length===0) return true;
  const safe = escapeRegExp(q);
  const rx = new RegExp('\\b' + safe + '\\b');
  return rx.test(blob);
}

// Advanced search: whole-word/phrase terms with "+" (must contain) and "-"
// (must NOT contain). An operator only counts at the very start of the input
// or right after whitespace, and only when a non-space character follows it,
// so hyphens inside words ("spell-like") stay plain text. Text before the
// first operator is a required term ("cat +fly" == "+cat +fly"). A term runs
// until the next operator, so "bronze dragon" stays one phrase.
// Returns compiled regexes so callers can parse once, then test many blobs.
function parseSearchQuery(query){
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
    const rx = new RegExp('\\b' + escapeRegExp(t) + '\\b');
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

// Formats a block of prose for HTML display: a leading ">> Heading" line
// becomes a bold heading, and a short leading "Label:" prefix on any other
// line gets bolded (used for auto-formatted stat blocks lifted from source
// text — feat Benefits/Normal/Special, spell descriptions, rune descriptions).
function boldLeadingLabel(text){
  return (text||'').split('\n').map(line=>{
    const headingMatch = line.match(/^\s*>>\s*(.*)$/);
    if(headingMatch) return `<b>${escapeHtml(headingMatch[1])}</b>`;
    const escaped = escapeHtml(line);
    return escaped.replace(/^(\s*(?:-\s*)?)((?:\S+\s+){0,4}\S*?:)/, '$1<b>$2</b>');
  }).join('\n');
}

// Same rule as boldLeadingLabel, but for plain-text clipboard output: wraps
// the label/heading in Markdown ** ** instead of <b> and skips HTML escaping.
function boldLeadingLabelText(text){
  return (text||'').split('\n').map(line=>{
    const headingMatch = line.match(/^\s*>>\s*(.*)$/);
    if(headingMatch) return `**${headingMatch[1]}**`;
    return line.replace(/^(\s*(?:-\s*)?)((?:\S+\s+){0,4}\S*?:)/, '$1**$2**');
  }).join('\n');
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
function wireSearchInput({inputEl, wrapEl, clearIconEl, onQuery, render}){
  function syncClearIcon(){
    wrapEl.classList.toggle('has-query', inputEl.value.length > 0);
  }
  inputEl.addEventListener('input', e=>{
    onQuery(e.target.value.trim().toLowerCase());
    syncClearIcon();
    render();
  });
  clearIconEl.addEventListener('click', ()=>{
    inputEl.value = '';
    onQuery('');
    syncClearIcon();
    inputEl.focus();
    render();
  });
  return syncClearIcon;
}

// Generic "Sort by" <select> wiring.
function wireSortSelect(state, render){
  document.getElementById('sortSelect').addEventListener('change', e=>{
    state.sort = e.target.value;
    render();
  });
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