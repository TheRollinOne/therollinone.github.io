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
// between feat cards, spell cards, and rune cards (only the class names differ).
function wireCardToggle(listEl, state, cardClass, nameClass){
  listEl.querySelectorAll('[data-toggle]').forEach(el=>{
    el.addEventListener('click', (e)=>{
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
      if(isOpen) state.open.delete(idx); else state.open.add(idx);
      const card = listEl.querySelector(`.${cardClass}[data-idx="${idx}"]`);
      card.classList.toggle('open');
    });
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