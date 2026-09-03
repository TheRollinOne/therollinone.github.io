(function(){
  function slugify(str){
    return (str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  const state = {
    query: '',
    bonus: new Set(),
    categories: new Set(),
    sort: 'name',
    open: new Set()
  };

  document.getElementById('brandSub').textContent = `Rune Repository · ${RUNES_DATA.length} Runes`;

  RUNES_DATA.forEach((r, i) => {
    r._idx = i;
    r._slug = slugify(r.category);
    r._blob = [
      r.name, r.category, r.bonus, r.short_description, r.description, r.aura
    ].filter(Boolean).join(' ').toLowerCase();
  });

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

  const categoryChips = document.getElementById('categoryChips');
  categoryChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.category;
      if (state.categories.has(val)) state.categories.delete(val);
      else state.categories.add(val);
      chip.classList.toggle('active');
      render();
    });
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
    render: () => render()
  });

  document.getElementById('clearAll').addEventListener('click', (e) => {
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    searchWrapEl.classList.remove('has-query');
    state.bonus.clear();
    bonusChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    state.categories.clear();
    categoryChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  wireSortSelect(state, () => render());

  wireCopyableList('runeList', 'rune-name');

  function matchesQuery(rune, query) {
    return matchesQueryOnBlob(rune._blob, query);
  }

  function formatCasterLevel(cl){
    if (!cl) return '';
    const n = Number(cl);
    if (Number.isNaN(n)) return String(cl);
    const suffix =
      n === 1 ? 'st' :
      n === 2 ? 'nd' :
      n === 3 ? 'rd' :
      'th';
    return `${n}${suffix}`;
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
    }).join(' — ');
  }

  function cardHTML(r){
    const cVar = `var(--cat-${r._slug})`;
    const isOpen = state.open.has(r._idx);

    const spellsText = (r.crafting.spells && r.crafting.spells.length) ? r.crafting.spells.join(', ') : '';
    const clDisplay = formatCasterLevel(r.caster_level);

    const metaPairs = [
      ['Price', r.price],
      ['Aura', r.aura],
      ['Caster Level', clDisplay]
    ];
    const craftingPairs = [
      ['Spells', spellsText],
      ['Special', r.crafting.special],
      ['Cost', r.crafting.cost]
    ];

    const metaLineHtml = buildLabeledLine(metaPairs, true);
    const craftingLineHtml = buildLabeledLine(craftingPairs, true);
    const metaLineCopy = buildLabeledLine(metaPairs, false);
    const craftingLineCopy = buildLabeledLine(craftingPairs, false);

    const bodyHtml = `
      <div class="rune-meta-line">${metaLineHtml}</div>
      <div class="rune-section">
        <div class="rune-section-title">Description</div>
        <div class="rune-desc"><div>${boldLeadingLabel(r.description||'')}</div></div>
      </div>
      <div class="rune-section">
        <div class="rune-section-title">Crafting</div>
        <div class="rune-desc">${craftingLineHtml}</div>
      </div>`;

    const copyText =
      `${metaLineCopy}\n${boldLeadingLabelText(r.description||'')}\n\nCRAFTING\n${craftingLineCopy}`;

    return `
    <div class="rune-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${r._idx}">
      <div class="rune-head" data-toggle="${r._idx}">
        <div class="rune-title-block">
          <span class="rune-name copyable" data-copy="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
          <span class="rune-bonus-tag">${escapeHtml(r.bonus||'')}</span>
          <span class="rune-category-tag">${escapeHtml(r.category)}</span>
        </div>
        <div class="rune-right">
          <span class="rune-badge" title="${escapeHtml(r.short_description||'')}">${escapeHtml(r.short_description||'')}</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="rune-body">
        <div class="rune-copy-group copyable" data-copy="${escapeHtml(copyText)}">${bodyHtml}
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
    if (state.categories.size) {
      list = list.filter(r => state.categories.has(r.category));
    }
    const sorted = list.slice();
    if (state.sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sort === 'category') {
      sorted.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'bonus') {
      sorted.sort((a, b) => (parseInt(a.bonus, 10) || 0) - (parseInt(b.bonus, 10) || 0) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Rune${results.length !== 1 ? 's' : ''} Listed`;
    const listEl = document.getElementById('runeList');
    if (results.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><span class="big">No runes found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    listEl.innerHTML = results.map(cardHTML).join('');
    wireCardToggle(listEl, state, 'rune-card', 'rune-name');
  }

  render();
})();