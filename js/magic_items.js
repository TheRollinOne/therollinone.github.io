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
    return `${formatNumber(w)} ${w === 1 ? 'lb.' : 'lbs.'}`;
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
    sort:'name',
    open:new Set()
  };

  setBrandSub('Magic Item Vault', MAGIC_ITEMS_DATA.length, 'Items');

  // MAGIC_ITEMS_DATA holds only slim list records (see build-magic_items.js).
  // Full records live in chunked files (data/magic_items-<N>.js) loaded the
  // first time a card in that chunk is opened; the "All Fields" search text
  // is one extra file loaded the first time it is needed.
  const META = (typeof MAGIC_ITEMS_DATA_META !== 'undefined') ? MAGIC_ITEMS_DATA_META : { chunkSize: 50 };
  // Full record + the fields prepare() derived on the slim record (_aura, ...).
  const { hydrate } = createChunkLoader(META, 'MAGIC_CHUNK_', {
    list: MAGIC_ITEMS_DATA, bodyHTML, defaultChunkSize: 50
  });

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

  initPageChrome();

  // ---- Slot filter (multi-select chips, feats-style colors) ----
  const slotColorOf = buildTypeColorMap(MAGIC_ITEMS_DATA.map(it=>it._slot));
  const allSlots = Object.keys(slotColorOf);
  MAGIC_ITEMS_DATA.forEach(it=>{ it._cardColor = slotColorOf[it._slot]; });

  const resetSlots = buildColorChips(slotColorOf, state.slots, 'slotChips', {
    dataAttr: 'slot', clearId: 'clearSlot', render
  });

  // ---- Price / Caster Level filters (operator select + up to two numeric
  // inputs; wireRangeFilter/matchesRange are shared helpers in base.js).
  // Price arrives as a plain number directly on the item. ----
  const priceFilter = wireRangeFilter({
    rangeState: state.price,
    operatorId: 'priceOperatorSelect',
    input1Id: 'priceInput1',
    andId: 'priceAndSpan',
    input2Id: 'priceInput2',
    clearId: 'clearPrice',
    render,
    min: 0,
    max: 999999
  });

  const clFilter = wireRangeFilter({
    rangeState: state.cl,
    operatorId: 'clOperatorSelect',
    input1Id: 'clInput1',
    andId: 'clAndSpan',
    input2Id: 'clInput2',
    clearId: 'clearCL',
    render,
    min: 1,
    max: 30
  });

  // ---- Aura Strength (multi-select chips) ----
  // Plain gold buttons (no per-value colors / dots): chips fall back to the
  // default gold --chipc when active.
  const presentStrengths = new Set(MAGIC_ITEMS_DATA.flatMap(it=>it._strengths));
  const strengthLabels = STRENGTH_ORDER.filter(s=>presentStrengths.has(s))
    .concat(Array.from(presentStrengths).filter(s=>!STRENGTH_ORDER.includes(s)).sort());
  const resetStrengths = buildPlainChips(strengthLabels, state.strengths, 'strengthChips', {
    dataAttr: 'strength', clearId: 'clearStrength', render
  });

  // ---- PFS Content (Yes / No, single select toggle like Spells' Ritual
  // Casting). pfs_content is 1 for Pathfinder Society items, 0 otherwise. ----
  const isPfs = it => Number(it.pfs_content) === 1;
  const resetPfs = wireYesNoToggle({
    container: 'pfsChips', state, key: 'pfs', clearId: 'clearPfs', render
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

  const search = initSearch({ state, render, example: 'ring of protection +armor -cursed' });

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    search.reset();
    resetSlots();
    priceFilter.reset();
    clFilter.reset();
    resetStrengths();
    resetPfs();
    state.group = '';
    groupSelectEl.value = '';
    render();
  });

  const syncSortButtons = wireSortBar(state, render);

  wireCopyableList('itemList', 'item-name');

  const queryMatch = createQueryMatcher();
  function matchesQuery(item, query){
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? item._blob : item._nameBlob, query);
  }

  // Ability/ego scores are ints in the data (null = unknown "?"), with an
  // optional free-text note ("17 against any non-demon").
  function statNum(val, note){
    const base = (typeof val === 'number') ? String(val) : '?';
    return escapeHtml(base) + (note ? ` (${escapeHtml(note)})` : '');
  }

  // Card body, built from the full record once its chunk has loaded.
  function bodyHTML(it){
    const descHtml = it.description ? `
        <div class="entry-section">
          <div class="entry-section-title">Description</div>
          <div class="entry-desc">${htmlFormatDescription(it.description)}</div>
        </div>` : '';

    const statBits = [];
    if(it._aura) statBits.push(`<b>Aura</b> ${escapeHtml(it._aura)}`);
    if(typeof it.cl === 'number') statBits.push(`<b>CL</b> ${formatOrdinal(it.cl)}`);
    else statBits.push(`<b>CL</b> varies`);
    if(it._slotLabel) statBits.push(`<b>Slot</b> ${escapeHtml(it._slotLabel)}`);
    if(it._weight !== null) statBits.push(`<b>Weight</b> ${escapeHtml(weightLabel(it._weight))}`);
    const statsHtml = statBits.length ? `
        <div class="entry-section">
          <div class="entry-desc item-stats-line">${statBits.join(' &nbsp; ')}</div>
        </div>` : '';

    const constructionBits = [];
    const reqCostBits = [];
    if(it.requirements) reqCostBits.push(`<b>Requirements</b> ${escapeHtml(it.requirements)}`);
    if(it.cost) reqCostBits.push(`<b>Cost</b> ${formatGp(it.cost)}`);
    if(reqCostBits.length) constructionBits.push(`<span class="item-stats-line">${reqCostBits.join(' &nbsp; ')}</span>`);
    if(it.magic_items) constructionBits.push(`<b>Made From</b> ${escapeHtml(it.magic_items)}`);
    const constructionHtml = constructionBits.length ? `
        <div class="entry-section">
          <div class="entry-section-title">Construction</div>
          <div class="entry-desc item-stats-line">${constructionBits.join('<br>')}</div>
        </div>` : '';

    // Destruction gets its own section, after Construction; the value is
    // shown on its own (no "Destruction" label before it).
    const destructionHtml = it.destruction ? `
        <div class="entry-section">
          <div class="entry-section-title">Destruction</div>
          <div class="entry-desc">${escapeHtml(it.destruction)}</div>
        </div>` : '';

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
        intelligentHtml = `
        <div class="entry-section">
          <div class="entry-section-title">Intelligent Item Stats</div>
          <div class="entry-desc item-stats-line">${iiLines.join('<br>')}</div>
        </div>`;
      }
    }

    return `${statsHtml}${descHtml}${intelligentHtml}${constructionHtml}${destructionHtml}`;
  }

  function cardHTML(it){
    const isOpen = state.open.has(it._idx);

    const slotTagHtml = it._slot ? `<span class="entry-tag entry-tag--lg">${escapeHtml(it._slot)}</span>` : '';
    const groupTagHtml = it._groupLabel ? `<span class="entry-tag">(${escapeHtml(it._groupLabel)})</span>` : '';

    return `
    <div class="entry-card entry-card--tight item-card${isOpen?' open':''}" style="--cardc:${it._cardColor}" data-idx="${it._idx}">
      <div class="entry-head" data-toggle="${it._idx}">
        <div class="entry-title-block">
          <span class="entry-name item-name copyable" data-copy="${escapeHtml(it.name)}">${escapeHtml(it.name)}</span>
          ${slotTagHtml}
          ${groupTagHtml}
        </div>
        <div class="entry-right">
          <span class="entry-badge">${escapeHtml(it.price > 0 ? formatGp(it.price) : '—')}</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body"></div>
    </div>`;
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
    if(state.sort==='name'){
      sorted.sort((a,b)=>naturalCompare(a.name, b.name));
    } else if(state.sort==='name_desc'){
      sorted.sort((a,b)=>naturalCompare(b.name, a.name));
    } else if(state.sort==='price'){
      sorted.sort((a,b)=>(a.price??-1)-(b.price??-1) || a.name.localeCompare(b.name));
    } else if(state.sort==='price_desc'){
      sorted.sort((a,b)=>(b.price??-1)-(a.price??-1) || a.name.localeCompare(b.name));
    } else if(state.sort==='cl'){
      // items with no numeric CL ("varies") always sort last
      sorted.sort((a,b)=>(a.cl??Infinity)-(b.cl??Infinity) || a.name.localeCompare(b.name));
    } else if(state.sort==='cl_desc'){
      sorted.sort((a,b)=>(b.cl??-1)-(a.cl??-1) || a.name.localeCompare(b.name));
    } else if(state.sort==='weight'){
      sorted.sort((a,b)=>(a._weight??Infinity)-(b._weight??Infinity) || a.name.localeCompare(b.name));
    } else if(state.sort==='weight_desc'){
      sorted.sort((a,b)=>(b._weight??-1)-(a._weight??-1) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    if(needsBlob()){
      if(blobStatus === 'error'){
        showStatus('itemList', 'Could not load full-text search', 'Check your connection, then edit the search to retry.');
        blobStatus = 'idle';   // next render retries
        return;
      }
      if(blobStatus === 'idle') loadBlob();
      showStatus('itemList', 'Loading…', 'Fetching full-text search data.');
      return;
    }
    renderNow();
  }

  function renderNow(){
    const results = filtered();
    setListTitle(results.length, 'Magic Item');
    renderList({
      state, results, listId: 'itemList', cardHTML,
      cardClass: 'item-card', nameClass: 'item-name',
      emptyNoun: 'magic items', labelPlural: 'Magic Items', rerender: render,
      // The full record is fetched (chunked, cached) when a card is opened;
      // cards still open after a re-render are hydrated too.
      onOpen: hydrate
    });
  }

  render();
})();
