(function(){
  // Canonical display order for the category chips
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

  setBrandSub('Rune Repository', RUNES_DATA.length, 'Runes');

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

  initPageChrome();

  const resetBonus = wireChipSet({
    container: 'bonusChips', set: state.bonus, dataAttr: 'bonus', clearId: 'clearBonus', render
  });

  // ---- Price / Caster Level filters (operator select + up to two numeric
  // inputs; wireRangeFilter/matchesRange are shared helpers in base.js).
  // Both values are plain integers in the data. ----
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

  // Category chips are generated dynamically (colors depend on the data).
  const resetCategories = buildColorChips(categoryColorOf, state.categories, 'categoryChips', {
    dataAttr: 'category', clearId: 'clearCategories', render
  });

  const search = initSearch({ state, render, example: 'flaming +keen -bane' });

  document.getElementById('clearAll').addEventListener('click', (e) => {
    e.stopPropagation();
    search.reset();
    resetBonus();
    priceFilter.reset();
    clFilter.reset();
    resetCategories();
    render();
  });

  const syncSortButtons = wireSortBar(state, render);

  wireCopyableList('runeList', 'rune-name');

  const queryMatch = createQueryMatcher();
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
  // the data. A missing bonus shows nothing (formatSigned alone would give "–").
  const bonusLabel = n => (n === null || n === undefined) ? '' : formatSigned(n);

  function cardHTML(r){
    const cVar = r._cardColor;
    const isOpen = state.open.has(r._idx);

    const spellsText = (r.crafting.spells && r.crafting.spells.length) ? r.crafting.spells.join(', ') : '';
    const clDisplay = formatOrdinal(r.caster_level);

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
          <span class="entry-meta">${escapeHtml(bonusLabel(r.bonus))}</span>
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
      list = list.filter(r => state.bonus.has(String(r.bonus)));
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
      sorted.sort((a, b) => (b.bonus || 0) - (a.bonus || 0) || a.name.localeCompare(b.name));
    } else if (state.sort === 'category') {
      sorted.sort((a, b) => (a._category || '').localeCompare(b._category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'bonus') {
      sorted.sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    setListTitle(results.length, 'Rune');
    renderList({
      state, results, listId: 'runeList', cardHTML,
      cardClass: 'rune-card', nameClass: 'rune-name',
      emptyNoun: 'runes', labelPlural: 'Runes', rerender: render
    });
  }

  render();
})();
