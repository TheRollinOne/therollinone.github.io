(function(){
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

  // Weight is stored as a plain number. 0 -> "—", 1 -> "1 lb.", everything
  // else (0.5, 5, 1,000...) -> "<n> lbs."
  function weightLabel(w){
    if(w === 0) return '—';
    return `${w.toLocaleString()} ${w === 1 ? 'lb.' : 'lbs.'}`;
  }

  // Aura strength: data has "moderate or strong" (both), "varies", "none", or
  // null; collapse to a fixed chip set.
  const STRENGTH_ORDER = ['Faint','Moderate','Strong','Overwhelming','Varies','None'];
  function normalizeStrengths(raw){
    const s = (raw||'').toString().toLowerCase();
    const out = [];
    ['faint','moderate','strong','overwhelming'].forEach(k=>{ if(s.includes(k)) out.push(formatTitleCase(k)); });
    if(out.length) return out;
    return [s === 'none' ? 'None' : 'Varies'];
  }
  const state = {
    query:'',
    searchScope:SEARCH_SCOPE_NAMES,
    slots:new Set(),
    price:{ operator:'', v1:null, v2:null },
    cl:{ operator:'', v1:null, v2:null },
    strengths:new Set(),
    pfs:null,
    group:'',
    sort:'name-asc',
    open:new Set()
  };

  document.getElementById('brandSub').textContent = `Magic Item Vault · ${MAGIC_ITEMS_DATA.length} Items`;

  // MAGIC_ITEMS_DATA holds only slim list records (see build-magic_items.js).
  // Full records live in chunked files (data/magic_items-<N>.js) loaded the
  // first time a card in that chunk is opened; the "All Fields" search text
  // is one extra file loaded the first time it is needed.
  const META = (typeof MAGIC_ITEMS_DATA_META !== 'undefined') ? MAGIC_ITEMS_DATA_META : { chunkSize: 50 };
  const CH = META.chunkSize;
  const chunkPromises = {};
  function loadChunk(c){
    return chunkPromises[c] || (chunkPromises[c] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = META['c' + c];
      s.onload = () => res(window['MAGIC_CHUNK_' + c]);
      s.onerror = () => { delete chunkPromises[c]; s.remove(); rej(new Error('chunk ' + c)); };
      document.head.appendChild(s);
    }));
  }
  // Full record + the fields prepare() derived on the slim record (_aura, ...).
  function loadDetail(idx){
    return loadChunk(Math.floor(idx / CH)).then(arr => Object.assign({}, arr[idx % CH], MAGIC_ITEMS_DATA[idx]));
  }
  function hydrate(idx, card){
    const body = card.querySelector('.entry-body');
    if(!body || body.dataset.ready) return;
    body.innerHTML = '<div class="entry-desc">Loading…</div>';
    loadDetail(idx)
      .then(full => { body.innerHTML = bodyHTML(full); body.dataset.ready = '1'; })
      .catch(() => { body.innerHTML = '<div class="entry-desc">Could not load details.</div>'; });
  }

  // 'idle' | 'loading' | 'loaded' | 'error'. With no blob file (older build)
  // there is nothing to load.
  let blobStatus = META.blobFile ? 'idle' : 'loaded';
  function needsBlob(){
    return blobStatus !== 'loaded' && state.searchScope === SEARCH_SCOPE_ALL && !!state.query;
  }
  function loadBlob(){
    blobStatus = 'loading';
    const s = document.createElement('script');
    s.src = META.blobFile;
    s.onload = () => {
      const blobs = window.MAGIC_ITEMS_BLOBS || [];
      MAGIC_ITEMS_DATA.forEach((it, i) => { it._blob = blobs[i] || ''; });
      window.MAGIC_ITEMS_BLOBS = null;
      blobStatus = 'loaded';
      render();
    };
    s.onerror = () => { blobStatus = 'error'; s.remove(); render(); };
    document.head.appendChild(s);
  }
  function showStatus(title, msg){
    document.getElementById('listTitle').textContent = title;
    document.getElementById('itemList').innerHTML =
      `<div class="empty-state"><span class="big">${escapeHtml(title)}</span>${escapeHtml(msg)}</div>`;
  }

  MAGIC_ITEMS_DATA.forEach((it,i)=>{
    it._idx = i;

    // Groups[] -> dedupe + tidy casing (data has stray lowercase entries
    // like "shield" alongside title-cased ones) while keeping distinct
    // labels distinct.
    const rawGroups = (it.groups && it.groups.length) ? it.groups : ['Other'];
    it._groups = Array.from(new Set(rawGroups.map(g => {
      const s = (g||'').toString().trim();
      return s ? formatTitleCase(s) : 'Other';
    })));
    it._groupLabel = it._groups.join(', ');

    // Slots[] -> normalize each raw slot string, dedupe. First one drives
    // the card's accent color/tag (matches old single-Slot behavior for
    // the overwhelming majority of items, which only ever have one slot).
    const rawSlots = (it.slots && it.slots.length) ? it.slots : [''];
    it._slots = Array.from(new Set(rawSlots.map(normalizeSlot)));
    it._slot = it._slots[0] || 'None';
    it._slotLabel = rawSlots.filter(Boolean).map(formatTitleCase).join(', ') || 'None';

    // Aura used to arrive as one combined string; now it's split into
    // AuraStrength + AuraSchool.
    it._aura = [it.aura_strength, it.aura_school].filter(Boolean).join(' ');
    it._strengths = normalizeStrengths(it.aura_strength);

    // Weight is a number in the data (null when missing).
    it._weight = (typeof it.weight === 'number') ? it.weight : null;

    // Names-only search uses the name; the "All Fields" text lives in a
    // separate lazy-loaded file (see loadBlob()) and fills _blob when it arrives.
    it._nameBlob = (it.name || '').toLowerCase();
    it._blob = '';
  });

  initMobileFiltersCollapse();
  initThemeToggle();

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

  // ---- Price / Caster Level filters (operator select + up to two numeric
  // inputs; wireRangeFilter/matchesRange are shared helpers in base.js).
  // Price arrives as a plain number directly on the item. ----
  wireRangeFilter({
    rangeState: state.price,
    operatorId: 'priceOperatorSelect',
    input1Id: 'priceInput1',
    andId: 'priceAndSpan',
    input2Id: 'priceInput2',
    clearId: 'clearPrice',
    render,
    clamp: makeClamp(0, 999999)
  });

  wireRangeFilter({
    rangeState: state.cl,
    operatorId: 'clOperatorSelect',
    input1Id: 'clInput1',
    andId: 'clAndSpan',
    input2Id: 'clInput2',
    clearId: 'clearCL',
    render,
    clamp: makeClamp(1, 30)
  });

  // ---- Aura Strength (multi-select chips) ----
  // Plain gold buttons (no per-value colors / dots): chips fall back to the
  // default gold --chipc when active.
  const presentStrengths = new Set(MAGIC_ITEMS_DATA.flatMap(it=>it._strengths));
  const strengthLabels = STRENGTH_ORDER.filter(s=>presentStrengths.has(s))
    .concat(Array.from(presentStrengths).filter(s=>!STRENGTH_ORDER.includes(s)).sort());
  const strengthChips = document.getElementById('strengthChips');
  strengthLabels.forEach(str=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = str;
    chip.addEventListener('click', ()=>{
      if(state.strengths.has(str)) state.strengths.delete(str);
      else state.strengths.add(str);
      chip.classList.toggle('active');
      render();
    });
    strengthChips.appendChild(chip);
  });
  document.getElementById('clearStrength').addEventListener('click', ()=>{
    state.strengths.clear();
    strengthChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    render();
  });

  // ---- PFS Content (Yes / No, single select toggle like Spells' Ritual
  // Casting). pfs_content is 1 for Pathfinder Society items, 0 otherwise. ----
  const isPfs = it => Number(it.pfs_content) === 1;
  const pfsChips = document.getElementById('pfsChips');
  [{key:'yes', label:'Yes'}, {key:'no', label:'No'}].forEach(opt=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.pfs = opt.key;
    chip.textContent = opt.label;
    chip.addEventListener('click', ()=>{
      state.pfs = (state.pfs === opt.key) ? null : opt.key;
      pfsChips.querySelectorAll('.chip').forEach(c=>{
        c.classList.toggle('active', c.dataset.pfs === state.pfs);
      });
      render();
    });
    pfsChips.appendChild(chip);
  });
  document.getElementById('clearPfs').addEventListener('click', ()=>{
    state.pfs = null;
    pfsChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    render();
  });

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

  const searchInputEl = document.getElementById('searchInput');
  const searchWrapEl = document.getElementById('searchWrap');
  const searchClearIcon = document.getElementById('searchClearIcon');
  const syncSearchClearIcon = wireSearchInput({
    inputEl: searchInputEl,
    wrapEl: searchWrapEl,
    clearIconEl: searchClearIcon,
    onQuery: (q)=>{ state.query = q; },
    render: ()=>render(),
    debounceMs: 250 // short pause after typing stops, so fast typing doesn't lag
  });

  wireSearchTooltip(searchInputEl, searchWrapEl, 'ring of protection +armor -cursed', { prefix: true });
  initSearchScope(searchWrapEl, (scope)=>{ state.searchScope = scope; render(); });

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    syncSearchClearIcon();
    state.slots.clear();
    slotChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    document.getElementById('clearPrice').click();
    document.getElementById('clearCL').click();
    state.strengths.clear();
    strengthChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    state.pfs = null;
    pfsChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    state.group = '';
    groupSelectEl.value = '';
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

  const queryMatch = createQueryMatcher({ prefix: true });
  function matchesQuery(item, query){
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? item._blob : item._nameBlob, query);
  }

  function priceLabel(it){
    return (typeof it.price === 'number' && it.price > 0) ? `${it.price.toLocaleString()} gp` : '—';
  }

  // Ability/ego scores are ints in the data (null = unknown "?"), with an
  // optional free-text note ("17 against any non-demon").
  function statNum(val, note){
    const base = (typeof val === 'number') ? String(val) : '?';
    return escapeHtml(base) + (note ? ` (${escapeHtml(note)})` : '');
  }

  // Card body, built from the full record once its chunk has loaded.
  function bodyHTML(it){
    const descHtml = it.description ? `\n        <div class="entry-section">\n          <div class="entry-section-title">Description</div>\n          <div class="entry-desc">${htmlFormatDescription(it.description)}</div>\n        </div>` : '';

    const statBits = [];
    if(it._aura) statBits.push(`<b>Aura</b> ${escapeHtml(it._aura)}`);
    if(typeof it.cl === 'number') statBits.push(`<b>CL</b> ${formatOrdinal(it.cl)}`);
    else statBits.push(`<b>CL</b> varies`);
    if(it._slotLabel) statBits.push(`<b>Slot</b> ${escapeHtml(it._slotLabel)}`);
    if(it._weight !== null) statBits.push(`<b>Weight</b> ${escapeHtml(weightLabel(it._weight))}`);
    const statsHtml = statBits.length ? `\n        <div class="entry-section">\n          <div class="entry-desc item-stats-line">${statBits.join(' &nbsp; ')}</div>\n        </div>` : '';

    const constructionBits = [];
    const reqCostBits = [];
    if(it.requirements) reqCostBits.push(`<b>Requirements</b> ${escapeHtml(it.requirements)}`);
    if(it.cost) reqCostBits.push(`<b>Cost</b> ${Number(it.cost).toLocaleString()} gp`);
    if(reqCostBits.length) constructionBits.push(`<span class="item-stats-line">${reqCostBits.join(' &nbsp; ')}</span>`);
    if(it.magic_items) constructionBits.push(`<b>Made From</b> ${escapeHtml(it.magic_items)}`);
    const constructionHtml = constructionBits.length ? `\n        <div class="entry-section">\n          <div class="entry-section-title">Construction</div>\n          <div class="entry-desc item-stats-line">${constructionBits.join('<br>')}</div>\n        </div>` : '';

    // Destruction gets its own section, after Construction; the value is
    // shown on its own (no "Destruction" label before it).
    const destructionHtml = it.destruction ? `\n        <div class="entry-section">\n          <div class="entry-section-title">Destruction</div>\n          <div class="entry-desc">${escapeHtml(it.destruction)}</div>\n        </div>` : '';

    const ii = it.intelligent_item;
    let intelligentHtml = '';
    if(ii && typeof ii === 'object'){
      const iiLines = [];

      const line1 = [];
      if(ii.al) line1.push(`<b>Alignment</b> ${escapeHtml(ii.al)}`);
      if(ii.ego !== null && ii.ego !== undefined) line1.push(`<b>Ego</b> ${statNum(ii.ego, ii.ego_note)}`);
      if(line1.length) iiLines.push(line1.join(' &nbsp;&nbsp; '));

      const line2 = [];
      line2.push(`<b>Int</b> ${statNum(ii.int, ii.int_note)}`);
      line2.push(`<b>Wis</b> ${statNum(ii.wis, ii.wis_note)}`);
      line2.push(`<b>Cha</b> ${statNum(ii.cha, ii.cha_note)}`);
      if(line2.length) iiLines.push(line2.join(' &nbsp;&nbsp; '));

      if(ii.communication) iiLines.push(`<b>Communication</b> ${escapeHtml(ii.communication)}`);
      if(ii.senses) iiLines.push(`<b>Senses</b> ${escapeHtml(ii.senses)}`);
      if(ii.languages) iiLines.push(`<b>Languages</b> ${escapeHtml(ii.languages)}`);
      if(ii.powers) iiLines.push(`<b>Powers</b> ${escapeHtml(ii.powers)}`);

      if(iiLines.length){
        intelligentHtml = `\n        <div class="entry-section">\n          <div class="entry-section-title">Intelligent Item Stats</div>\n          <div class="entry-desc item-stats-line">${iiLines.join('<br>')}</div>\n        </div>`;
      }
    }

    return `${statsHtml}${descHtml}${intelligentHtml}${constructionHtml}${destructionHtml}`;
  }

  function cardHTML(it){
    const isOpen = state.open.has(it._idx);

    const slotTagHtml = it._slot ? `<span class="entry-tag entry-tag--lg">${escapeHtml(it._slot)}</span>` : '';
    const groupTagHtml = it._groupLabel ? `<span class="entry-tag">(${escapeHtml(it._groupLabel)})</span>` : '';

    return `\n    <div class="entry-card entry-card--tight item-card${isOpen?' open':''}" style="--cardc:${it._cardColor}" data-idx="${it._idx}">\n      <div class="entry-head" data-toggle="${it._idx}">\n        <div class="entry-title-block">\n          <span class="entry-name item-name copyable" data-copy="${escapeHtml(it.name)}">${escapeHtml(it.name)}</span>\n          ${slotTagHtml}\n          ${groupTagHtml}\n        </div>\n        <div class="entry-right">\n          <span class="entry-badge">${escapeHtml(priceLabel(it))}</span>\n          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>\n        </div>\n      </div>\n      <div class="entry-body"></div>\n    </div>`;
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
      list = list.filter(it=>matchesRange(it.price, state.price));
    }
    if(state.cl.operator){
      list = list.filter(it=>matchesRange(it.cl, state.cl));
    }
    if(state.strengths.size){
      list = list.filter(it=>it._strengths.some(s=>state.strengths.has(s)));
    }
    if(state.pfs === 'yes'){
      list = list.filter(isPfs);
    } else if(state.pfs === 'no'){
      list = list.filter(it=>!isPfs(it));
    }
    return list;
  }

  // Rebuilds the Group <select> from the groups present in `list`. If the
  // selected group no longer appears, resets the filter back to "Any".
  function updateGroupOptions(list){
    const groupSet = new Set();
    list.forEach(it=>it._groups.forEach(g=>{ if(g) groupSet.add(g); }));
    if(state.group && !groupSet.has(state.group)) state.group = '';
    groupSelectEl.innerHTML = '<option value="">Any</option>' +
      Array.from(groupSet).map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    sortSelectOptions(groupSelectEl);
    groupSelectEl.value = state.group;
  }

  function filtered(){
    const base = baseFiltered();
    updateGroupOptions(base);
    const list = state.group ? base.filter(it=>it._groups.includes(state.group)) : base;
    const sorted = list.slice();
    if(state.sort==='name-asc'){
      sorted.sort((a,b)=>naturalCompare(a.name, b.name));
    } else if(state.sort==='name-desc'){
      sorted.sort((a,b)=>naturalCompare(b.name, a.name));
    } else if(state.sort==='price-asc'){
      sorted.sort((a,b)=>(a.price??-1)-(b.price??-1) || a.name.localeCompare(b.name));
    } else if(state.sort==='price-desc'){
      sorted.sort((a,b)=>(b.price??-1)-(a.price??-1) || a.name.localeCompare(b.name));
    } else if(state.sort==='cl-asc'){
      // items with no numeric CL ("varies") always sort last
      sorted.sort((a,b)=>(a.cl??Infinity)-(b.cl??Infinity) || a.name.localeCompare(b.name));
    } else if(state.sort==='cl-desc'){
      sorted.sort((a,b)=>(b.cl??-1)-(a.cl??-1) || a.name.localeCompare(b.name));
    } else if(state.sort==='weight-asc'){
      sorted.sort((a,b)=>(a._weight??Infinity)-(b._weight??Infinity) || a.name.localeCompare(b.name));
    } else if(state.sort==='weight-desc'){
      sorted.sort((a,b)=>(b._weight??-1)-(a._weight??-1) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    if(needsBlob()){
      if(blobStatus === 'error'){
        showStatus('Could not load full-text search', 'Check your connection, then edit the search to retry.');
        blobStatus = 'idle';   // next render retries
        return;
      }
      if(blobStatus === 'idle') loadBlob();
      showStatus('Loading…', 'Fetching full-text search data.');
      return;
    }
    renderNow();
  }

  function renderNow(){
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Magic Item${results.length!==1?'s':''} Listed`;
    const listEl = document.getElementById('itemList');
    if(results.length===0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No magic items found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    const shown = paginate(state, results);
    listEl.innerHTML = shown.map(cardHTML).join('') + showMoreButtonHTML(results, state, 'Magic Items');
    // The full record is fetched (chunked, cached) when a card is opened;
    // cards still open (state.open) after a re-render are hydrated here too.
    wireCardToggle(listEl, state, 'item-card', 'item-name', (idx, card) => hydrate(idx, card));
    listEl.querySelectorAll('.item-card.open').forEach(card => hydrate(+card.dataset.idx, card));
    wireShowMore(listEl, {
      onLoadMore: () => { state.visibleCount += PAGE_SIZE; render(); },
      onShowAll: () => { state.visibleCount = results.length; render(); }
    });
  }

  render();
})();
