(function(){
  function slugify(str){
    return (str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }
  function titleCase(str){
    return (str||'').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }

  // SLOT_COLORS moved to base.js's shared TYPE_COLORS/buildTypeColorMap.

  // The raw Slot values are messy free text ("wrist" / "wrists", "head or
  // neck", "see text", etc.) — this collapses them down to a clean, finite
  // set of filterable labels. Items now carry a *list* of raw slot strings
  // (Slots[]) instead of a single Slot string, so each entry is normalized
  // independently and the results are deduped per item.
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

    // Groups[] -> dedupe + tidy casing (data has stray lowercase entries
    // like "shield" alongside title-cased ones) while keeping distinct
    // labels distinct.
    const rawGroups = (it.Groups && it.Groups.length) ? it.Groups : ['Other'];
    it._groups = Array.from(new Set(rawGroups.map(g => {
      const s = (g||'').toString().trim();
      return s ? titleCase(s) : 'Other';
    })));
    it._groupLabel = it._groups.join(', ');

    // Slots[] -> normalize each raw slot string, dedupe. First one drives
    // the card's accent color/tag (matches old single-Slot behavior for
    // the overwhelming majority of items, which only ever have one slot).
    const rawSlots = (it.Slots && it.Slots.length) ? it.Slots : [''];
    it._slots = Array.from(new Set(rawSlots.map(normalizeSlot)));
    it._slot = it._slots[0] || 'None';
    it._slotLabel = rawSlots.filter(Boolean).map(titleCase).join(', ') || 'None';

    // Aura used to arrive as one combined string; now it's split into
    // AuraStrength + AuraSchool.
    it._aura = [it.AuraStrength, it.AuraSchool].filter(Boolean).join(' ');

    // Weight sometimes arrives as the literal string "NULL" instead of
    // being omitted.
    it._weight = (it.Weight !== null && it.Weight !== undefined && it.Weight !== 'NULL' && it.Weight !== '')
      ? it.Weight : null;

    it._blob = [
      it.Name, it._groupLabel, it._slotLabel, it.Description, it.Requirements,
      it._aura, it.Source, it.BaseItem, it.Destruction, it.MagicItems
    ].filter(Boolean).join(' ').toLowerCase();
  });

  initThemeToggle();
  initSidebarArt();

  // ---- Slot filter (multi-select chips, feats-style colors) ----
  const slotColorOf = buildTypeColorMap(MAGIC_ITEMS_DATA.map(it=>it._slot));
  const allSlots = Object.keys(slotColorOf);
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
  // shape as the Monsters page's CR/HD range filters). Price now arrives
  // as a plain number directly on the item, so no separate PriceValue
  // field is needed. ----
  function clampPrice(val){
    if(val === '') return null;
    let n = parseFloat(val);
    if(Number.isNaN(n)) return null;
    return Math.min(999999, Math.max(0, n));
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

    // Only the number inputs (typed) get debounced; the operator <select>
    // and the "clear" button below are discrete actions and should render
    // immediately.
    const debouncedRender = debounce(render, 200);

    operatorSelect.addEventListener('change', () => {
      rangeState.operator = operatorSelect.value;
      syncVisibility();
      render();
    });
    input1.addEventListener('input', () => {
      rangeState.v1 = clamp(input1.value);
      debouncedRender();
    });
    input2.addEventListener('input', () => {
      rangeState.v2 = clamp(input2.value);
      debouncedRender();
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

  // ---- Group filter (single select). Items can belong to more than one
  // group. Options are rebuilt on every render() from the groups present
  // in the base-filtered set (every filter except Group) — see
  // updateGroupOptions(). ----
  const groupSelectEl = document.getElementById('groupSelect');
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
    render();
  });

  // ---- Sort (header buttons) ----
  document.querySelectorAll('#sortBar .sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      render();
    });
  });
  function syncSortButtons(){
    document.querySelectorAll('#sortBar .sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === state.sort));
  }

  wireCopyableList('itemList', 'item-name');

  const queryMatch = createQueryMatcher();
  function matchesQuery(item, query){
    return queryMatch(item._blob, query);
  }

  function priceLabel(it){
    return (typeof it.Price === 'number' && it.Price > 0) ? `${it.Price.toLocaleString()} gp` : '—';
  }

  function cardHTML(it){
    const isOpen = state.open.has(it._idx);

    const slotTagHtml = it._slot ? `<span class="item-slot-tag">${escapeHtml(it._slot)}</span>` : '';
    const groupTagHtml = it._groupLabel ? `<span class="item-category-tag">(${escapeHtml(it._groupLabel)})</span>` : '';

    const descHtml = it.Description ? `\n        <div class="item-section">\n          <div class="item-section-title">Description</div>\n          <div class="item-desc">${escapeHtml(it.Description)}</div>\n        </div>` : '';

    const statBits = [];
    if(it._aura) statBits.push(`<b>Aura</b> ${escapeHtml(it._aura)}`);
    if(it.CL !== null && it.CL !== undefined) statBits.push(`<b>CL</b> ${escapeHtml(String(it.CL))}`);
    if(it._slotLabel) statBits.push(`<b>Slot</b> ${escapeHtml(it._slotLabel)}`);
    if(it._weight !== null) statBits.push(`<b>Weight</b> ${escapeHtml(String(it._weight))}`);
    const statsHtml = statBits.length ? `\n        <div class="item-section">\n          <div class="item-desc">${statBits.join(' &nbsp;·&nbsp; ')}</div>\n        </div>` : '';

    const constructionBits = [];
    if(it.Requirements) constructionBits.push(`<b>Requirements</b> ${escapeHtml(it.Requirements)}`);
    if(it.Cost) constructionBits.push(`<b>Cost</b> ${Number(it.Cost).toLocaleString()} gp`);
    if(it.MagicItems) constructionBits.push(`<b>Made From</b> ${escapeHtml(it.MagicItems)}`);
    if(it.Destruction) constructionBits.push(`<b>Destruction</b> ${escapeHtml(it.Destruction)}`);
    const constructionHtml = constructionBits.length ? `\n        <div class="item-section">\n          <div class="item-section-title">Construction</div>\n          <div class="item-desc">${constructionBits.join('<br>')}</div>\n        </div>` : '';

    const ii = it.IntelligentItem;
    let intelligentHtml = '';
    if(ii && typeof ii === 'object'){
      const iiLines = [];

      const line1 = [];
      if(ii.AL) line1.push(`<b>Alignment</b> ${escapeHtml(ii.AL)}`);
      if(ii.Ego !== null && ii.Ego !== undefined) line1.push(`<b>Ego</b> ${escapeHtml(String(ii.Ego))}`);
      if(line1.length) iiLines.push(line1.join(' &nbsp;&nbsp; '));

      const line2 = [];
      if(ii.Int !== null && ii.Int !== undefined) line2.push(`<b>Int</b> ${escapeHtml(String(ii.Int))}`);
      if(ii.Wis !== null && ii.Wis !== undefined) line2.push(`<b>Wis</b> ${escapeHtml(String(ii.Wis))}`);
      if(ii.Cha !== null && ii.Cha !== undefined) line2.push(`<b>Cha</b> ${escapeHtml(String(ii.Cha))}`);
      if(line2.length) iiLines.push(line2.join(' &nbsp;&nbsp; '));

      if(ii.Communication) iiLines.push(`<b>Communication</b> ${escapeHtml(ii.Communication)}`);
      if(ii.Senses) iiLines.push(`<b>Senses</b> ${escapeHtml(ii.Senses)}`);
      if(ii.Languages) iiLines.push(`<b>Languages</b> ${escapeHtml(ii.Languages)}`);
      if(ii.Powers) iiLines.push(`<b>Powers</b> ${escapeHtml(ii.Powers)}`);

      if(iiLines.length){
        intelligentHtml = `\n        <div class="item-section">\n          <div class="item-section-title">Intelligent Item Stats</div>\n          <div class="item-desc">${iiLines.join('<br>')}</div>\n        </div>`;
      }
    }

    return `\n    <div class="item-card${isOpen?' open':''}" style="--cardc:${it._cardColor}" data-idx="${it._idx}">\n      <div class="item-head" data-toggle="${it._idx}">\n        <div class="item-title-block">\n          <span class="item-name copyable" data-copy="${escapeHtml(it.Name)}">${escapeHtml(it.Name)}</span>\n          ${slotTagHtml}\n          ${groupTagHtml}\n        </div>\n        <div class="item-right">\n          <span class="item-badge">${escapeHtml(priceLabel(it))}</span>\n          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>\n        </div>\n      </div>\n      <div class="item-body">\n        ${statsHtml}${descHtml}${constructionHtml}${intelligentHtml}\n      </div>\n    </div>`;
  }

  // Every filter except Group — the population the Group dropdown's own
  // options are computed from, so picking a group never shrinks its own
  // list down to just the chosen value.
  function baseFiltered(){
    let list = MAGIC_ITEMS_DATA;
    if(state.query){
      list = list.filter(it=>matchesQuery(it, state.query));
    }
    if(state.slots.size){
      list = list.filter(it=>it._slots.some(s=>state.slots.has(s)));
    }
    if(state.price.operator){
      list = list.filter(it=>matchesRange(it.Price, state.price));
    }
    return list;
  }

  // Rebuilds the Group <select> from the groups present in `list`. If the
  // selected group no longer appears, resets the filter back to "Any".
  function updateGroupOptions(list){
    const groupSet = new Set();
    list.forEach(it=>it._groups.forEach(g=>{ if(g) groupSet.add(g); }));
    const sortedGroups = Array.from(groupSet).sort((a,b)=>a.localeCompare(b));
    if(state.group && !groupSet.has(state.group)) state.group = '';
    groupSelectEl.innerHTML = '<option value="">Any</option>' +
      sortedGroups.map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    groupSelectEl.value = state.group;
  }

  function filtered(){
    const base = baseFiltered();
    updateGroupOptions(base);
    const list = state.group ? base.filter(it=>it._groups.includes(state.group)) : base;
    const sorted = list.slice();
    if(state.sort==='name-asc'){
      sorted.sort((a,b)=>a.Name.localeCompare(b.Name));
    } else if(state.sort==='name-desc'){
      sorted.sort((a,b)=>b.Name.localeCompare(a.Name));
    } else if(state.sort==='price-asc'){
      sorted.sort((a,b)=>(a.Price??-1)-(b.Price??-1) || a.Name.localeCompare(b.Name));
    } else if(state.sort==='price-desc'){
      sorted.sort((a,b)=>(b.Price??-1)-(a.Price??-1) || a.Name.localeCompare(b.Name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Magic Item${results.length!==1?'s':''} Listed`;
    const listEl = document.getElementById('itemList');
    if(results.length===0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No magic items found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    const shown = paginate(state, results);
    listEl.innerHTML = shown.map(cardHTML).join('') + showMoreButtonHTML(results, state, 'Magic Items');
    wireCardToggle(listEl, state, 'item-card', 'item-name');
    wireShowMore(listEl, {
      onLoadMore: () => { state.visibleCount += PAGE_SIZE; render(); },
      onShowAll: () => { state.visibleCount = results.length; render(); }
    });
  }

  render();
})();
