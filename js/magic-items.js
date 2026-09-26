(function(){
  function slugify(str){
    return (str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  // Same 9 colors, same order, as feats.css's --cat-* palette. Slot labels
  // are assigned to these round-robin (sorted alphabetically), cycling back
  // to the start once all 9 are used.
  const SLOT_COLORS = ['#78dc6e','#32d2b4','#41c3f5','#c489ff','#ff96c8','#ff4b4b','#ff9b50','#e4c450','#f0f0f0b4'];

  // The raw Slot field is messy free text ("wrist" / "wrists", "head or
  // neck", "see text", etc.) — this collapses it down to a clean, finite
  // set of filterable labels.
  const SLOT_MAP = {
    '': 'None', '-': 'None', 'none': 'None', 'none (replaces hand)': 'None', 'none or neck': 'None',
    'amulet': 'Amulet',
    'arm or wrist': 'Wrist', 'wrist': 'Wrist', 'wrists': 'Wrist',
    'armor': 'Armor', 'armor (barding)': 'Armor',
    'belt': 'Belt', 'belt or head': 'Belt', 'belt or shoulder': 'Belt', 'waist': 'Belt',
    'body': 'Body', 'body and helm (see text)': 'Body',
    'chest': 'Chest', 'chest and neck (see text)': 'Chest',
    'cloak': 'Cloak',
    'eye': 'Eyes', 'eyes': 'Eyes', 'eyes or none': 'Eyes',
    'face': 'Face',
    'feet': 'Feet',
    'hand': 'Hand', 'hands': 'Hand',
    'head': 'Head', 'head and headband': 'Head', 'head or neck': 'Head',
    'headband': 'Headband',
    'held': 'Held',
    'neck': 'Neck', 'neck (but see text)': 'Neck', 'neck, ring, or none': 'Neck',
    'ring': 'Ring',
    'shield': 'Shield',
    'shoulder': 'Shoulder', 'shoulders': 'Shoulder',
    'weapon': 'Weapon',
    'genie seal': 'Other', 'rod': 'Other', 'see text': 'Other', 'special': 'Other', 'varies': 'Other'
  };
  function normalizeSlot(raw){
    const key = (raw||'').toString().trim().toLowerCase();
    if(key in SLOT_MAP) return SLOT_MAP[key];
    return key ? 'Other' : 'None';
  }

  const state = {
    query:'',
    slots:new Set(),
    price:{ operator:'', v1:null, v2:null },
    group:'',
    sort:'name-asc',
    open:new Set()
  };

  document.getElementById('brandSub').textContent = `Magic Item Vault · ${MAGIC_ITEMS_DATA.length} Items`;

  MAGIC_ITEMS_DATA.forEach((it,i)=>{
    it._idx = i;
    it._group = it.Group || 'Other';
    it._slot = normalizeSlot(it.Slot);
    it._blob = [
      it.Name, it._group, it.Slot, it.Description, it.Requirements,
      it.Aura, it.Source, it.BaseItem
    ].filter(Boolean).join(' ').toLowerCase();
  });

  initThemeToggle();

  // ---- Slot filter (multi-select chips, feats-style colors) ----
  const allSlots = Array.from(new Set(MAGIC_ITEMS_DATA.map(it=>it._slot))).sort();
  const slotColorOf = {};
  allSlots.forEach((slot,i)=>{ slotColorOf[slot] = SLOT_COLORS[i % SLOT_COLORS.length]; });
  MAGIC_ITEMS_DATA.forEach(it=>{ it._cardColor = slotColorOf[it._slot]; });

  const slotChips = document.getElementById('slotChips');
  allSlots.forEach(slot=>{
    const color = slotColorOf[slot];
    const chip = document.createElement('div');
    chip.className='chip';
    chip.style.setProperty('--dotc', color);
    chip.style.setProperty('--chipc', color);
    chip.dataset.slot = slot;
    chip.innerHTML = `<span class="dot"></span>${escapeHtml(slot)}`;
    chip.addEventListener('click', ()=>{
      if(state.slots.has(slot)) state.slots.delete(slot);
      else state.slots.add(slot);
      chip.classList.toggle('active');
      render();
    });
    slotChips.appendChild(chip);
  });
  document.getElementById('clearSlot').addEventListener('click', ()=>{
    state.slots.clear();
    slotChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    render();
  });

  // ---- Price filter (operator select + up to two numeric inputs, same
  // shape as the Monsters page's CR/HD range filters) ----
  function clampPrice(val){
    if(val === '') return null;
    let n = parseFloat(val);
    if(Number.isNaN(n)) return null;
    return Math.max(0, n);
  }

  function wireRangeFilter({ rangeState, operatorId, input1Id, andId, input2Id, clearId, clamp }){
    const operatorSelect = document.getElementById(operatorId);
    const input1 = document.getElementById(input1Id);
    const andSpan = document.getElementById(andId);
    const input2 = document.getElementById(input2Id);

    function syncVisibility(){
      const op = operatorSelect.value;
      if(op === ''){
        input1.hidden = true;
        andSpan.hidden = true;
        input2.hidden = true;
      } else if(op === 'between'){
        input1.hidden = false;
        andSpan.hidden = false;
        input2.hidden = false;
      } else {
        input1.hidden = false;
        andSpan.hidden = true;
        input2.hidden = true;
      }
    }

    operatorSelect.addEventListener('change', () => {
      rangeState.operator = operatorSelect.value;
      syncVisibility();
      render();
    });
    input1.addEventListener('input', () => {
      rangeState.v1 = clamp(input1.value);
      render();
    });
    input2.addEventListener('input', () => {
      rangeState.v2 = clamp(input2.value);
      render();
    });
    document.getElementById(clearId).addEventListener('click', () => {
      rangeState.operator = '';
      rangeState.v1 = null;
      rangeState.v2 = null;
      operatorSelect.value = '';
      input1.value = '';
      input2.value = '';
      syncVisibility();
      render();
    });
    syncVisibility();
  }

  wireRangeFilter({
    rangeState: state.price,
    operatorId: 'priceOperatorSelect',
    input1Id: 'priceInput1',
    andId: 'priceAndSpan',
    input2Id: 'priceInput2',
    clearId: 'clearPrice',
    clamp: clampPrice
  });

  function matchesRange(value, rangeState){
    if(!rangeState.operator) return true;
    if(typeof value !== 'number') return false;
    if(rangeState.operator === 'lt') return rangeState.v1 !== null && value < rangeState.v1;
    if(rangeState.operator === 'eq') return rangeState.v1 !== null && value === rangeState.v1;
    if(rangeState.operator === 'gt') return rangeState.v1 !== null && value > rangeState.v1;
    if(rangeState.operator === 'between'){
      if(rangeState.v1 === null || rangeState.v2 === null) return true;
      const lo = Math.min(rangeState.v1, rangeState.v2);
      const hi = Math.max(rangeState.v1, rangeState.v2);
      return value >= lo && value <= hi;
    }
    return true;
  }

  // ---- Group filter (single select) ----
  const groupSelectEl = document.getElementById('groupSelect');
  const allGroups = Array.from(new Set(MAGIC_ITEMS_DATA.map(it=>it._group))).sort();
  allGroups.forEach(g=>{
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    groupSelectEl.appendChild(opt);
  });
  groupSelectEl.addEventListener('change', e=>{
    state.group = e.target.value;
    render();
  });
  document.getElementById('clearGroup').addEventListener('click', ()=>{
    state.group = '';
    groupSelectEl.value = '';
    render();
  });

  initMobileFiltersCollapse();

  const searchInputEl = document.getElementById('searchInput');
  const searchWrapEl = document.getElementById('searchWrap');
  const searchClearIcon = document.getElementById('searchClearIcon');
  const syncSearchClearIcon = wireSearchInput({
    inputEl: searchInputEl,
    wrapEl: searchWrapEl,
    clearIconEl: searchClearIcon,
    onQuery: (q)=>{ state.query = q; },
    render: ()=>render()
  });

  wireSearchTooltip(searchInputEl, searchWrapEl, 'ring of protection +armor -cursed');

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    syncSearchClearIcon();
    state.slots.clear();
    slotChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    document.getElementById('clearPrice').click();
    state.group = '';
    groupSelectEl.value = '';
    state.sort = 'name-asc';
    document.getElementById('sortSelect').value = 'name-asc';
    render();
  });

  document.getElementById('sortSelect').addEventListener('change', e=>{
    state.sort = e.target.value;
    render();
  });

  wireCopyableList('itemList', 'item-name');

  const queryMatch = createQueryMatcher();
  function matchesQuery(item, query){
    return queryMatch(item._blob, query);
  }

  function priceLabel(it){
    return it.Price || '—';
  }

  function cardHTML(it){
    const isOpen = state.open.has(it._idx);

    const descHtml = it.Description ? `\n        <div class="item-section">\n          <div class="item-section-title">Description</div>\n          <div class="item-desc">${escapeHtml(it.Description)}</div>\n        </div>` : '';

    const statBits = [];
    if(it.Aura) statBits.push(`<b>Aura</b> ${escapeHtml(it.Aura)}`);
    if(it.CL) statBits.push(`<b>CL</b> ${escapeHtml(String(it.CL))}`);
    if(it.Slot) statBits.push(`<b>Slot</b> ${escapeHtml(it.Slot)}`);
    if(it.Weight) statBits.push(`<b>Weight</b> ${escapeHtml(it.Weight)}`);
    const statsHtml = statBits.length ? `\n        <div class="item-section">\n          <div class="item-section-title">Stats</div>\n          <div class="item-desc">${statBits.join(' &nbsp;·&nbsp; ')}</div>\n        </div>` : '';

    const constructionBits = [];
    if(it.Requirements) constructionBits.push(`<b>Requirements</b> ${escapeHtml(it.Requirements)}`);
    if(it.Cost) constructionBits.push(`<b>Cost</b> ${escapeHtml(it.Cost)}`);
    const constructionHtml = constructionBits.length ? `\n        <div class="item-section">\n          <div class="item-section-title">Construction</div>\n          <div class="item-desc">${constructionBits.join('<br>')}</div>\n        </div>` : '';

    return `\n    <div class="item-card${isOpen?' open':''}" style="--cardc:${it._cardColor}" data-idx="${it._idx}">\n      <div class="item-head" data-toggle="${it._idx}">\n        <div class="item-title-block">\n          <span class="item-name copyable" data-copy="${escapeHtml(it.Name)}">${escapeHtml(it.Name)}</span>\n          <span class="item-category-tag">${escapeHtml(it._group)}</span>\n        </div>\n        <div class="item-right">\n          <span class="item-badge">${escapeHtml(priceLabel(it))}</span>\n          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>\n        </div>\n      </div>\n      <div class="item-body">\n        ${statsHtml}${descHtml}${constructionHtml}\n      </div>\n    </div>`;
  }

  function filtered(){
    let list = MAGIC_ITEMS_DATA;
    if(state.query){
      list = list.filter(it=>matchesQuery(it, state.query));
    }
    if(state.slots.size){
      list = list.filter(it=>state.slots.has(it._slot));
    }
    if(state.price.operator){
      list = list.filter(it=>matchesRange(it.PriceValue, state.price));
    }
    if(state.group){
      list = list.filter(it=>it._group === state.group);
    }
    const sorted = list.slice();
    if(state.sort==='name-asc'){
      sorted.sort((a,b)=>a.Name.localeCompare(b.Name));
    } else if(state.sort==='name-desc'){
      sorted.sort((a,b)=>b.Name.localeCompare(a.Name));
    } else if(state.sort==='price-asc'){
      sorted.sort((a,b)=>(a.PriceValue??-1)-(b.PriceValue??-1) || a.Name.localeCompare(b.Name));
    } else if(state.sort==='price-desc'){
      sorted.sort((a,b)=>(b.PriceValue??-1)-(a.PriceValue??-1) || a.Name.localeCompare(b.Name));
    }
    return sorted;
  }

  function render(){
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Magic Item${results.length!==1?'s':''} Listed`;
    const listEl = document.getElementById('itemList');
    if(results.length===0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No magic items found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    listEl.innerHTML = results.map(cardHTML).join('');
    wireCardToggle(listEl, state, 'item-card', 'item-name');
  }

  render();
})();
