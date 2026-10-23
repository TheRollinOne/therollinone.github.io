(function(){
  // Canonical display order for the category chips (matches the old
  // --cat-* var order in runes.css). Any category present in the data
  // that isn't listed here is appended afterward, alphabetically.
  const CATEGORY_ORDER = ['Armor', 'Shield', 'Melee Weapon', 'Ranged Weapon', 'Ammunition'];

  const state = {
    query: '',
    searchScope: SEARCH_SCOPE_NAMES,
    bonus: new Set(),
    price: { operator: '', v1: null, v2: null },
    cl: { operator: '', v1: null, v2: null },
    categories: new Set(),
    sort: 'name',
    open: new Set()
  };

  document.getElementById('brandSub').textContent = `Rune Repository · ${RUNES_DATA.length} Runes`;

  RUNES_DATA.forEach((r, i) => {
    r._idx = i;
    r._category = formatTitleCase(r.category);
    r._nameBlob = (r.name || '').toLowerCase();
    r._blob = [
      r.name, r._category, r.short_description, r.description, r.aura
    ].filter(Boolean).join(' ').toLowerCase();
  });

  const categoryColorOf = buildTypeColorMap(RUNES_DATA.map(r => r._category), CATEGORY_ORDER);
  RUNES_DATA.forEach(r => { r._cardColor = categoryColorOf[r._category]; });

  initMobileFiltersCollapse();
  initThemeToggle();

  const bonusChips = document.getElementById('bonusChips');
  bonusChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.bonus;
      if (state.bonus.has(val)) state.bonus.delete(val);
      else state.bonus.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearBonus').addEventListener('click', () => {
    state.bonus.clear();
    bonusChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  // ---- Price / Caster Level filters (operator select + up to two numeric
  // inputs; wireRangeFilter/matchesRange are shared helpers in base.js).
  // Both values are plain integers in the data. ----
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

  // Category chips are generated dynamically (colors depend on the data),
  // the same way feats.js/armors.js build their category chips.
  const categoryChips = document.getElementById('categoryChips');
  Object.keys(categoryColorOf).forEach(cat => {
    const color = categoryColorOf[cat];
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.style.setProperty('--dotc', color);
    chip.style.setProperty('--chipc', color);
    chip.dataset.category = cat;
    chip.innerHTML = `<span class="dot"></span>${escapeHtml(cat)}`;
    chip.addEventListener('click', () => {
      if (state.categories.has(cat)) state.categories.delete(cat);
      else state.categories.add(cat);
      chip.classList.toggle('active');
      render();
    });
    categoryChips.appendChild(chip);
  });
  document.getElementById('clearCategories').addEventListener('click', () => {
    state.categories.clear();
    categoryChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  const searchInputEl = document.getElementById('searchInput');
  const searchWrapEl = document.getElementById('searchWrap');
  const searchClearIcon = document.getElementById('searchClearIcon');
  wireSearchInput({
    inputEl: searchInputEl,
    wrapEl: searchWrapEl,
    clearIconEl: searchClearIcon,
    onQuery: (q) => { state.query = q; },
    render: () => render(),
    debounceMs: 250 // short pause after typing stops, so fast typing doesn't lag
  });

  wireSearchTooltip(searchInputEl, searchWrapEl, 'flaming +keen -bane', { prefix: true });
  initSearchScope(searchWrapEl, (scope) => { state.searchScope = scope; render(); });

  document.getElementById('clearAll').addEventListener('click', (e) => {
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    searchWrapEl.classList.remove('has-query');
    state.bonus.clear();
    bonusChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    document.getElementById('clearPrice').click();
    document.getElementById('clearCL').click();
    state.categories.clear();
    categoryChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
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

  wireCopyableList('runeList', 'rune-name');

  const queryMatch = createQueryMatcher({ prefix: true });
  function matchesQuery(rune, query) {
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? rune._blob : rune._nameBlob, query);
  }

  // Builds a "**Label** value — **Label2** value2" style line from an
  // ordered list of [label, value] pairs, skipping any pair whose value is
  // missing/empty (and its separator) rather than printing an empty label.
  function buildLabeledLine(pairs, htmlMode){
    const present = pairs.filter(([, val]) => val);
    return present.map(([label, val]) => {
      const boldLabel = htmlMode ? `<b>${label}</b>` : `**${label}**`;
      const safeVal = htmlMode ? escapeHtml(val) : val;
      return `${boldLabel} ${safeVal}`;
    }).join(htmlMode ? ' &nbsp; ' : ' — ');
  }

  // bonus, price, caster_level and crafting.cost are stored as integers in
  // the data; these helpers rebuild the original display strings.
  // 7000 -> "7,000 gp"
  function formatGp(n){
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' gp';
  }
  // 3 -> "+3"
  function formatBonus(n){
    return (n === null || n === undefined || n === '') ? '' : '+' + n;
  }

  function cardHTML(r){
    const cVar = r._cardColor;
    const isOpen = state.open.has(r._idx);

    const spellsText = (r.crafting.spells && r.crafting.spells.length) ? r.crafting.spells.join(', ') : '';
    const clDisplay = formatOrdinal(String(r.caster_level));

    const metaPairs = [
      ['Price', formatGp(r.price)],
      ['Aura', r.aura],
      ['Caster Level', clDisplay]
    ];
    const craftingPairs = [
      ['Spells', spellsText],
      ['Special', r.crafting.special],
      ['Cost', '+' + formatGp(r.crafting.cost)]
    ];

    const metaLineHtml = buildLabeledLine(metaPairs, true);
    const craftingLineHtml = buildLabeledLine(craftingPairs, true);
    const metaLineCopy = buildLabeledLine(metaPairs, false);
    const craftingLineCopy = buildLabeledLine(craftingPairs, false);

    const bodyHtml = `
      <div class="rune-meta-line">${metaLineHtml}</div>
      <div class="entry-section">
        <div class="entry-section-title">Description</div>
        <div class="entry-desc"><div>${htmlFormatDescription(r.description)}</div></div>
      </div>
      <div class="entry-section">
        <div class="entry-section-title">Crafting</div>
        <div class="entry-desc rune-craft-line">${craftingLineHtml}</div>
      </div>`;

    const copyText =
      `${metaLineCopy}\n${clipboardFormatText(r.description)}\n\nCRAFTING\n${craftingLineCopy}`;

    return `
    <div class="entry-card rune-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${r._idx}">
      <div class="entry-head" data-toggle="${r._idx}">
        <div class="entry-title-block">
          <span class="entry-name rune-name copyable" data-copy="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
          <span class="entry-meta">${escapeHtml(formatBonus(r.bonus))}</span>
          <span class="entry-tag">${escapeHtml(r._category)}</span>
        </div>
        <div class="entry-right">
          <span class="entry-badge entry-badge--responsive" title="${escapeHtml(r.short_description||'')}">${escapeHtml(r.short_description||'')}</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body">
        <div class="copyable" data-copy="${escapeHtml(copyText)}">${bodyHtml}
        </div>
      </div>
    </div>`;
  }

  function filtered(){
    let list = RUNES_DATA;
    if (state.query) {
      list = list.filter(r => matchesQuery(r, state.query));
    }
    if (state.bonus.size) {
      list = list.filter(r => state.bonus.has(String(parseInt(r.bonus, 10))));
    }
    if (state.price.operator) {
      list = list.filter(r => matchesRange(r.price, state.price));
    }
    if (state.cl.operator) {
      list = list.filter(r => matchesRange(r.caster_level, state.cl));
    }
    if (state.categories.size) {
      list = list.filter(r => state.categories.has(r._category));
    }
    const sorted = list.slice();
    if (state.sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sort === 'name_desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (state.sort === 'category_desc') {
      sorted.sort((a, b) => (b._category || '').localeCompare(a._category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'bonus_desc') {
      sorted.sort((a, b) => (parseInt(b.bonus, 10) || 0) - (parseInt(a.bonus, 10) || 0) || a.name.localeCompare(b.name));
    } else if (state.sort === 'category') {
      sorted.sort((a, b) => (a._category || '').localeCompare(b._category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'bonus') {
      sorted.sort((a, b) => (parseInt(a.bonus, 10) || 0) - (parseInt(b.bonus, 10) || 0) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Rune${results.length !== 1 ? 's' : ''} Listed`;
    const listEl = document.getElementById('runeList');
    if (results.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><span class="big">No runes found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    const shown = paginate(state, results);
    listEl.innerHTML = shown.map(cardHTML).join('') + showMoreButtonHTML(results, state, 'Runes');
    wireCardToggle(listEl, state, 'rune-card', 'rune-name');
    wireShowMore(listEl, {
      onLoadMore: () => { state.visibleCount += PAGE_SIZE; render(); },
      onShowAll: () => { state.visibleCount = results.length; render(); }
    });
  }

  render();
})();