(function(){
  // Canonical display order for the category chips (not alphabetical).
  // Any category found in the data that isn't listed here is appended,
  // title-cased and alphabetized, after these (see buildTypeColorMap
  // in base.js).
  const CATEGORY_ORDER = ['Light Armor', 'Shield', 'Medium Armor', 'Extra', 'Heavy Armor'];
  const state = {
    query: '',
    searchScope: SEARCH_SCOPE_NAMES,
    categories: new Set(),
    armorBonuses: new Set(),
    maxDexes: new Set(),
    acps: new Set(),
    spellFailures: new Set(),
    sort: 'name',
    open: new Set()
  };

  setBrandSub('Armor Catalogue', ARMORS_DATA.length, 'Armors');
  ARMORS_DATA.forEach((a, i) => {
    a._idx = i;
    a._category = formatTitleCase(a.category);
    a._nameBlob = (a.name || '').toLowerCase();
    a._blob = [
      a.name, a._category, a.description
    ].filter(Boolean).join(' ').toLowerCase();
  });

  const categoryColorOf = buildTypeColorMap(ARMORS_DATA.map(a => a._category), CATEGORY_ORDER);
  ARMORS_DATA.forEach(a => { a._cardColor = categoryColorOf[a._category]; });

  initPageChrome();

  // Category chips are generated dynamically (colors depend on the data).
  const chipResets = [
    buildColorChips(categoryColorOf, state.categories, 'categoryChips', {
      dataAttr: 'category', clearId: 'clearCategories', render
    })
  ];

  // Armor Bonus, Max Dexterity, Armor Check Penalty, and Arcane Spell
  // Failure chips are static markup (a small fixed set of values).
  [
    { set: state.armorBonuses, containerId: 'armorBonusChips', clearId: 'clearArmorBonus', dataAttr: 'armorBonus' },
    { set: state.maxDexes, containerId: 'maxDexChips', clearId: 'clearMaxDex', dataAttr: 'maxDex' },
    { set: state.acps, containerId: 'acpChips', clearId: 'clearACP', dataAttr: 'acp' },
    { set: state.spellFailures, containerId: 'spellFailureChips', clearId: 'clearSpellFailure', dataAttr: 'spellFailure' }
  ].forEach(g => {
    chipResets.push(wireChipSet({
      container: g.containerId, set: g.set, dataAttr: g.dataAttr, clearId: g.clearId, render
    }));
  });

  // "Names Only | All Fields" toggle under the search box (default: names).
  const search = initSearch({ state, render, example: 'chain sh +light -heavy' });

  document.getElementById('clearAll').addEventListener('click', (e) => {
    e.stopPropagation();
    search.reset();
    chipResets.forEach(reset => reset());
    render();
  });

  const syncSortButtons = wireSortBar(state, render);

  wireCopyableList('armorList', 'armor-name');

  // Live search:  terms match from the start of a word,
  // so results narrow as the user types instead of waiting for a full word.
  const queryMatch = createQueryMatcher();
  function matchesQuery(armor, query) {
    const blob = state.searchScope === SEARCH_SCOPE_ALL ? armor._blob : armor._nameBlob;
    return queryMatch(blob, query);
  }

  // Price is an integer/number; a missing price sorts before everything else.
  function priceValue(a){
    return typeof a.price === 'number' ? a.price : -1;
  }

  function speedReductionText(a){
    const has30 = a.speed_30ft && a.speed_30ft.length > 0;
    const has20 = a.speed_20ft && a.speed_20ft.length > 0;
    if (has30 && has20) return `${a.speed_30ft}/${a.speed_20ft}`;
    if (has30) return a.speed_30ft;
    if (has20) return a.speed_20ft;
    return '';
  }

  function buildStatFields(a){
    return [
      ['Armor Bonus', a.armor_bonus],
      ['Max Dexterity', a.max_dex ? a.max_dex : '—'],
      ['Armor Check Penalty', a.acp],
      ['Arcane Spell Failure', a.spell_failure],
      ['Speed Reduction 30/20', speedReductionText(a)],
      ['Price', formatGp(a.price)],
      ['Weight', a.weight],
    ].filter(([, val]) => val && val.length > 0);
  }

  // Max Dex / ACP sometimes hold non-numeric text ("See Text", "special");
  // the header quick-stats only ever show a real number there, "—" otherwise.
  function numericOrDash(val){
    return (val && /\d/.test(val)) ? val : '—';
  }

  function armorQuickStats(a){
    return quickStatsHTML([
      ['Bonus', numericOrDash(a.armor_bonus)],
      ['Max Dex', numericOrDash(a.max_dex)],
      ['ACP', numericOrDash(a.acp)],
      ['S.F.', a.spell_failure === '0%' ? '—' : (a.spell_failure || '—')],
      ['Price', formatGp(a.price, false) || '—'],
      ['Weight', (a.weight || '').replace(/\s*lbs?\.?/i, '') || '—'],
    ]);
  }

  function cardHTML(a){
    const cardStyle = a._cardColor ? ` style="--cardc:${a._cardColor}"` : '';
    const isOpen = state.open.has(a._idx);

    const categoryTagHtml = a._category ? `<span class="entry-tag">${escapeHtml(a._category)}</span>` : '';

    const statFields = buildStatFields(a);
    const statGridHtml = statFields.map(([l,v]) =>
      `<div class="stat copyable" data-copy="${escapeHtml(v)}"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${escapeHtml(v)}</div></div>`
    ).join('');

    const descText = clipboardFormatText(a.description || '');
    const descHtml = a.description ? `
      <div class="entry-section copyable" data-copy="${escapeHtml(descText)}">
        <div class="entry-section-title">Description</div>
        <div class="entry-desc"><div>${htmlFormatDescription(a.description)}</div></div>
      </div>` : '';

    return `
    <div class="entry-card entry-card--stats armor-card${isOpen?' open':''}"${cardStyle} data-idx="${a._idx}">
      <div class="entry-head" data-toggle="${a._idx}">
        <div class="entry-title-block">
          <span class="entry-name armor-name copyable" data-copy="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
          ${categoryTagHtml}
        </div>
        <div class="entry-right">
          ${armorQuickStats(a)}
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body">
        <div class="stat-grid">${statGridHtml}</div>
        ${descHtml}
      </div>
    </div>`;
  }

  function filtered(){
    let list = ARMORS_DATA;
    if (state.query) {
      list = list.filter(a => matchesQuery(a, state.query));
    }
    if (state.categories.size) {
      list = list.filter(a => state.categories.has(a._category));
    }
    if (state.armorBonuses.size) {
      list = list.filter(a => state.armorBonuses.has(a.armor_bonus));
    }
    if (state.maxDexes.size) {
      list = list.filter(a => state.maxDexes.has(a.max_dex || ''));
    }
    if (state.acps.size) {
      list = list.filter(a => state.acps.has(a.acp));
    }
    if (state.spellFailures.size) {
      list = list.filter(a => state.spellFailures.has(a.spell_failure));
    }
    const sorted = list.slice();
    if (state.sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sort === 'name_desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (state.sort === 'category') {
      sorted.sort((a, b) => (a._category || '').localeCompare(b._category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'price') {
      sorted.sort((a, b) => priceValue(a) - priceValue(b) || a.name.localeCompare(b.name));
    } else if (state.sort === 'price_desc') {
      sorted.sort((a, b) => priceValue(b) - priceValue(a) || a.name.localeCompare(b.name));
    } else if (state.sort === 'weight') {
      sorted.sort((a, b) => parseLeadingNumber(a.weight) - parseLeadingNumber(b.weight) || a.name.localeCompare(b.name));
    } else if (state.sort === 'weight_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.weight) - parseLeadingNumber(a.weight) || a.name.localeCompare(b.name));
    } else if (state.sort === 'armor_bonus') {
      sorted.sort((a, b) => parseLeadingNumber(a.armor_bonus) - parseLeadingNumber(b.armor_bonus) || a.name.localeCompare(b.name));
    } else if (state.sort === 'armor_bonus_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.armor_bonus) - parseLeadingNumber(a.armor_bonus) || a.name.localeCompare(b.name));
    } else if (state.sort === 'max_dex') {
      sorted.sort((a, b) => parseLeadingNumber(a.max_dex) - parseLeadingNumber(b.max_dex) || a.name.localeCompare(b.name));
    } else if (state.sort === 'max_dex_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.max_dex) - parseLeadingNumber(a.max_dex) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    setListTitle(results.length, 'Armor & Shield', 'Armors & Shields');
    renderList({
      state, results, listId: 'armorList', cardHTML,
      cardClass: 'armor-card', nameClass: 'armor-name',
      emptyNoun: 'armor', labelPlural: 'Armors & Shields', rerender: render
    });
  }

  render();
})();
