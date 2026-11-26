(function(){
  const state = {
    query:'',
    searchScope:SEARCH_SCOPE_NAMES,
    categories:new Set(),
    prereq:null, // null | 'none' | 'some'
    prereqQuery:'',
    abilities:new Set(), // any of: str, dex, con, int, wis, cha
    bab:false,
    skillRanks:false,
    classFeature:'', // '' = Any, else a key into CLASS_FEATURE_RX
    sort:'name',
    open:new Set(),
     // chain-tree nodes the user expanded ("<featIdx>|<path>"); "_" keeps it out of the filter signature
  };

  const ABILITY_RX = {
    str: /\bstr\s+\d+/i,
    dex: /\bdex\s+\d+/i,
    con: /\bcon\s+\d+/i,
    int: /\bint\s+\d+/i,
    wis: /\bwis\s+\d+/i,
    cha: /\bcha\s+\d+/i
  };
  const BAB_RX = /\bbab\b|\bbase attack bonus\b/i;
  const SKILL_RANKS_RX = /\b\d+\s+ranks?\b/i;
  const CLASS_FEATURE_RX = {
    animalCompanion: /animal companion/i,
    arcaneSchool: /arcane school/i,
    armorTraining: /armor training/i,
    bardicPerformance: /bardic performance/i,
    channelEnergy: /channel (positive |negative )?energy/i,
    domain: /\bdomain\b/i,
    familiar: /\bfamiliar\b/i,
    flurryOfBlows: /flurry of blows/i,
    gritPanache: /\bgrit\b|\bpanache\b/i,
    judgment: /\bjudgment\b/i,
    layOnHands: /lay on hands/i,
    rage: /\brage\b/i,
    sneakAttack: /sneak attack/i,
    uncannyDodge: /uncanny dodge/i,
    weaponTraining: /weapon training/i,
    wildShape: /wild shape|wild empathy/i
  };

  setBrandSub('Feat Library', FEATS_DATA.length, 'Feats');

  FEATS_DATA.forEach((f,i)=>{
    f._idx = i;
    f._prereqBlob = (f.prerequisites||'').toLowerCase();
    const p = f.prerequisites || '';
    f._abilities = new Set(Object.keys(ABILITY_RX).filter(k=>ABILITY_RX[k].test(p)));
    f._hasBab = BAB_RX.test(p);
    f._hasSkillRanks = SKILL_RANKS_RX.test(p);
    f._classFeatures = new Set(Object.keys(CLASS_FEATURE_RX).filter(k=>CLASS_FEATURE_RX[k].test(p)));
    f._nameBlob = (f.name || '').toLowerCase();
    f._blob = [
      f.name, f.category, f.prerequisites, f.benefits,
      f.normal, f.special
    ].filter(Boolean).join(' ').toLowerCase();
  });

  // ---- Feat chains -------------------------------------------------------
  // FEAT_CHAINS comes from data/feat_chains.json (build-feats-chains.js):
  //   byFeat: "Name|Category" -> id
  //   nodes:  id -> { name, category, parents: [[id,...],...], softParents, children: [id,...], root }
  // A parents entry with several ids means "any one of these". Empty arrays are
  // stripped at build time, so every array read goes through arr().
  const CHAINS = (typeof FEAT_CHAINS !== 'undefined') ? FEAT_CHAINS : null;
  const chainNodes = CHAINS ? CHAINS.nodes : {};
  const featIdxByChainId = {};
  const arr = v => v || [];

  FEATS_DATA.forEach(f=>{
    f._chainId = (CHAINS && CHAINS.byFeat[f.name + '|' + f.category]) || '';
    if(f._chainId) featIdxByChainId[f._chainId] = f._idx;
    const n = chainNodes[f._chainId];
    f._hasChain = !!n && (arr(n.parents).length + arr(n.softParents).length + arr(n.children).length) > 0;
  });

  initPageChrome();

  const categoryColorOf = buildTypeColorMap(FEATS_DATA.map(f=>f.category));
  FEATS_DATA.forEach(f=>{ f._cardColor = categoryColorOf[f.category]; });

  const resetCategories = buildColorChips(categoryColorOf, state.categories, 'categoryChips', {
    dataAttr: 'cat', clearId: 'clearCategories', render
  });

  const prereqChips = document.getElementById('prereqChips');
  prereqChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const val = chip.dataset.prereq;
      if(state.prereq === val){
        state.prereq = null;
        chip.classList.remove('active');
      } else {
        state.prereq = val;
        prereqChips.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
      }
      render();
    });
  });

  const resetAbilities = wireChipSet({
    container: 'abilityChips', set: state.abilities, dataAttr: 'ability', render
  });

  const babSkillChips = document.getElementById('babSkillChips');
  babSkillChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const flag = chip.dataset.flag;
      state[flag] = !state[flag];
      chip.classList.toggle('active');
      render();
    });
  });

  const classFeatureSelectEl = document.getElementById('classFeatureSelect');
  // Capture the full option list (value + label, in HTML order) once; the
  // <select> is then rebuilt on every render() from the class features
  // present in the base-filtered set — see updateClassFeatureOptions().
  const ALL_CLASS_FEATURE_OPTIONS = Array.from(classFeatureSelectEl.options)
    .filter(o=>o.value)
    .map(o=>({ value:o.value, label:o.textContent }));
  classFeatureSelectEl.addEventListener('change', e=>{
    state.classFeature = e.target.value;
    render();
  });

  const search = initSearch({ state, render, example: 'power attack +combat -fighter' });

  const prereqSearchInputEl = document.getElementById('prereqSearchInput');
  const prereqSearchWrapEl = document.getElementById('prereqSearchWrap');
  const prereqSearchClearIcon = document.getElementById('prereqSearchClearIcon');
  const syncPrereqSearchClearIcon = wireSearchInput({
    inputEl: prereqSearchInputEl,
    wrapEl: prereqSearchWrapEl,
    clearIconEl: prereqSearchClearIcon,
    onQuery: (q)=>{ state.prereqQuery = q; },
    render: ()=>render()
  });

  // Resets every prerequisite-related filter WITHOUT rendering.
  function resetPrereqFilters(){
    state.prereq = null;
    prereqChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    state.prereqQuery = '';
    prereqSearchInputEl.value = '';
    syncPrereqSearchClearIcon();
    resetAbilities();
    state.bab = false;
    state.skillRanks = false;
    babSkillChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    state.classFeature = '';
    classFeatureSelectEl.value = '';
  }

  document.getElementById('clearPrereq').addEventListener('click', ()=>{
    resetPrereqFilters();
    render();
  });

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    search.reset();
    resetCategories();
    resetPrereqFilters();
    render();
  });

  const syncSortButtons = wireSortBar(state, render);

  wireCopyableList('featList', 'feat-name');

  const queryMatch = createQueryMatcher();
  function matchesQuery(feat, query){
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? feat._blob : feat._nameBlob, query);
  }

  const prereqQueryMatch = createQueryMatcher();
  function matchesPrereqQuery(feat, query){
    return prereqQueryMatch(feat._prereqBlob, query);
  }

  // ---- Feat chain graph --------------------------------------------------
  // Drawn as a layered graph, left -> right: every feat the current one needs
  // (its ancestors), the current feat, then everything that builds on it.
  // A feat reached by several routes is drawn ONCE; lines that leave or enter
  // the same box share one elbow halfway between the two columns, so they
  // split and rejoin there. Boxes are absolutely positioned (fillChain) and
  // the lines are one SVG underneath. Every line is drawn solid.

  // "Ki Throw, Improved" -> "Improved Ki Throw" (chain boxes only)
  const chainName = n => n.replace(/^(.+), (Improved|Greater|Light|Medium|Heavy)$/, '$2 $1');
  const chainKey = id => chainName(chainNodes[id].name);

  const CHAIN_FALLBACK = { w: 200, gap: 56, h: 28, rowGap: 8 };  // px; w / gap come from CSS when readable
  // Where a vertical line crosses a horizontal one it is not joined to:
  //   'gap' = the vertical breaks (passes under).
  //   'hop' = the vertical bulges into a small half-circle to the right, broken where the
  //           horizontal runs through it, so it reads as ducking under the horizontal.
  //   r = half-height of the break / radius of the hop, in px.
  const CHAIN_CROSS = { mode: 'gap', r: 4 };

  // parent id -> dashed? (a solid link wins when the same pair appears twice)
  function chainParentLinks(id){
    const n = chainNodes[id], out = new Map();
    const add = (entry, soft) => entry.forEach(p => {
      const dashed = soft || entry.length > 1;
      out.set(p, out.has(p) ? (out.get(p) && dashed) : dashed);
    });
    arr(n.parents).forEach(e => add(e, false));
    arr(n.softParents).forEach(e => add(e, true));
    return out;
  }

  // Pure layout: returns { boxes:[{id,col,y}], paths:[{pts:[...ids], dashed}], cols, curCol, rows }
  // y values are in "row units" (multiplied by the box height later).
  function chainLayout(id){
    const anc = new Set(), desc = new Set();
    (function up(n){ chainParentLinks(n).forEach((_, p)=>{ if(!anc.has(p)){ anc.add(p); up(p); } }); })(id);
    (function down(n){ arr(chainNodes[n].children).forEach(c=>{ if(!desc.has(c)){ desc.add(c); down(c); } }); })(id);

    const inSet = n => n === id || anc.has(n) || desc.has(n);
    const sideOf = n => n === id ? 0 : anc.has(n) ? -1 : 1;
    const nodes = [id, ...anc, ...desc];
    const edges = [];                       // {from, to, dashed}
    const preds = {};
    nodes.forEach(n=>{
      preds[n] = [];
      chainParentLinks(n).forEach((dashed, p)=>{
        if(!inSet(p)) return;
        const sp = sideOf(p), sn = sideOf(n);
        if(sp !== 0 && sn !== 0 && sp !== sn) return;   // ancestor -> descendant shortcuts add nothing
        preds[n].push(p);
        edges.push({ from:p, to:n, dashed });
      });
    });

    // column = longest chain of requirements leading to the feat
    const col = {};
    const colOf = n => {
      if(col[n] !== undefined) return col[n];
      return col[n] = preds[n].reduce((m, p)=>Math.max(m, colOf(p) + 1), 0);
    };
    nodes.forEach(colOf);
    const curCol = col[id];
    const maxCol = Math.max(...nodes.map(n=>col[n]));

    // Rows: a tidy tree per side. Every feat hangs under ONE primary neighbour
    // (the nearest one toward the current feat); leaves take consecutive rows and
    // a feat sits at the middle of its children. Its other links are plain
    // lines to a box that is drawn only once.
    const succs = {};
    nodes.forEach(n=>{ succs[n] = []; });
    nodes.forEach(n=>preds[n].forEach(p=>succs[p].push(n)));
    const byKey = (a, b)=>chainKey(a).localeCompare(chainKey(b));
    const treeKids = {};
    nodes.forEach(n=>{ treeKids[n] = []; });
    anc.forEach(a=>{                                   // toward the current feat: smallest column
      const s = succs[a].slice().sort((p, q)=>col[p] - col[q] || byKey(p, q))[0];
      treeKids[s].push(a);
    });
    desc.forEach(d=>{                                  // from the current feat: largest column
      const p = preds[d].slice().sort((p, q)=>col[q] - col[p] || byKey(p, q))[0];
      treeKids[p].push(d);
    });
    const y = {};
    const place = (root, kidsOf)=>{
      let next = 0;
      const go = n=>{
        const kids = kidsOf(n);
        if(!kids.length){ y[n] = next++; return; }
        kids.forEach(go);
        y[n] = (y[kids[0]] + y[kids[kids.length - 1]]) / 2;
      };
      go(root);
    };
    const ancKids = n=>treeKids[n].filter(k=>anc.has(k)).sort(byKey);
    const descKids = n=>treeKids[n].filter(k=>desc.has(k)).sort(byKey);
    place(id, ancKids);
    const yAncRoot = y[id];
    const ancY = Object.assign({}, y);
    place(id, descKids);
    const descShift = anc.size && desc.size ? yAncRoot - y[id] : 0;
    // descendants keep their own rows (shifted to line the two roots up)
    desc.forEach(n=>{ ancY[n] = y[n] + descShift; });
    ancY[id] = anc.size ? yAncRoot : y[id];
    Object.keys(y).forEach(n=>delete y[n]);
    Object.assign(y, ancY);

    // A feat that several others lead to (or that leads to several) sits at the
    // middle of all of them, not just beside its primary neighbour.
    const spot = (n, want)=>{
      const taken = nodes.filter(m=>m !== n && col[m] === col[n]).map(m=>y[m]);
      const ok = v=>taken.every(t=>Math.abs(t - v) >= .999);
      return [want, ...taken.map(t=>t - 1), ...taken.map(t=>t + 1)].filter(ok)
        .sort((a, b)=>Math.abs(a - want) - Math.abs(b - want))[0];
    };
    const centre = (n, links)=>{
      if(links.length < 2) return;
      const ys = links.map(m=>y[m]);
      if(Math.max(...ys) - Math.min(...ys) > 2) return;   // far apart: centring would strand it among unrelated rows
      y[n] = spot(n, links.reduce((sum, m)=>sum + y[m], 0) / links.length);
    };
    [...anc].sort((a, b)=>col[b] - col[a]).forEach(n=>centre(n, succs[n]));
    [...desc].sort((a, b)=>col[a] - col[b]).forEach(n=>centre(n, preds[n]));

    // dummy nodes carry a line across the columns it skips, so it never runs behind a box
    const paths = [];
    let dummyN = 0;
    // nearest row in column c (to `want`) not covered by a box, so a skipping line never hides behind one
    const freeRow = (c, want)=>{
      const taken = nodes.filter(n=>col[n] === c).map(n=>y[n]);
      const ok = v=>taken.every(t=>Math.abs(t - v) >= .999);
      return [want, ...taken.map(t=>t - 1), ...taken.map(t=>t + 1)].filter(ok)
        .sort((a, b)=>Math.abs(a - want) - Math.abs(b - want))[0];
    };
    edges.forEach(e=>{
      const pts = [e.from];
      const ancSide = sideOf(e.from) === -1;
      for(let c = col[e.from] + 1; c < col[e.to]; c++){
        const d = '~' + (dummyN++);
        col[d] = c; y[d] = freeRow(c, ancSide ? y[e.from] : y[e.to]); pts.push(d);
      }
      pts.push(e.to);
      paths.push({ pts, dashed: e.dashed });
    });
    const minY = Math.min(...Object.values(y));
    Object.keys(y).forEach(n=>{ y[n] -= minY; });

    return {
      boxes: nodes.map(n=>({ id:n, col:col[n], y:y[n] })),
      dummies: Object.keys(col).filter(n=>n[0] === '~').map(n=>({ id:n, col:col[n], y:y[n] })),
      paths, maxCol, curCol,
      rows: Math.max(...Object.values(y)) + 1
    };
  }

  function chainBox(id){
    const idx = featIdxByChainId[id];
    const f = FEATS_DATA[idx];
    if(!f) return '';
    return `<button type="button" class="fc-box" style="--fcc:${f._cardColor}" data-chain-go="${idx}" data-chain-id="${id}" title="${escapeHtml(chainName(f.name) + ' · ' + f.category)}">${escapeHtml(chainName(f.name))}</button>`;
  }

  // Builds the graph inside an open card's chain section (once).
  function fillChain(idx, card){
    const section = card.querySelector('.fc-section');
    if(!section || section.dataset.ready) return;
    const f = FEATS_DATA[idx];
    const L = chainLayout(f._chainId);
    const wrap = section.querySelector('.fc-wrap');

    wrap.innerHTML = '<div class="fc-canvas">' +
      L.boxes.map(b=> b.id === f._chainId
        ? `<span class="fc-box fc-current" data-chain-id="${b.id}" style="--fcc:${f._cardColor}">${escapeHtml(chainName(f.name))}</span>`
        : chainBox(b.id)).join('') + '</div>';
    const canvas = wrap.firstChild;
    const els = {};
    canvas.querySelectorAll('[data-chain-id]').forEach(el=>{ els[el.dataset.chainId] = el; });

    // sizes from CSS (fall back if the card is not laid out)
    const css = getComputedStyle(section);
    const num = (v, d)=>{ const n = parseFloat(css.getPropertyValue(v)); return n > 0 ? n : d; };
    const W = num('--fc-w', CHAIN_FALLBACK.w), GAP = num('--fc-gap', CHAIN_FALLBACK.gap);
    const H = els[f._chainId].offsetHeight || CHAIN_FALLBACK.h;
    const ROW = H + CHAIN_FALLBACK.rowGap;
    const curW = Math.max(W, els[f._chainId].offsetWidth || 0);

    const left = [], right = [];
    let x = 0;
    for(let c = 0; c <= L.maxCol; c++){
      const w = c === L.curCol ? curW : W;
      left[c] = x; right[c] = x + w; x += w + GAP;
    }
    const totalW = x - GAP, totalH = (L.rows - 1) * ROW + H;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';
    L.boxes.forEach(b=>{
      const el = els[b.id];
      el.style.left = left[b.col] + 'px';
      el.style.top = (b.y * ROW) + 'px';
      el.style.width = (b.col === L.curCol ? curW : W) + 'px';
    });

    const yc = new Map(); L.boxes.concat(L.dummies).forEach(b=>yc.set(b.id, b.y * ROW + H / 2));
    const colOfId = new Map(); L.boxes.concat(L.dummies).forEach(b=>colOfId.set(b.id, b.col));

    // Lines between two columns split / rejoin on a vertical halfway across the
    // gap. Lines that share a start or end box share one vertical; unrelated
    // groups whose verticals would overlap get their own lane in the gap.
    const segs = [];                                  // {path, from, to, gap}
    L.paths.forEach((p, pi)=>{
      for(let i = 1; i < p.pts.length; i++){
        segs.push({ pi, i, from:p.pts[i-1], to:p.pts[i], gap:colOfId.get(p.pts[i-1]) });
      }
    });
    const laneX = new Map();                          // segment -> x of its vertical
    for(let g = 0; g < L.maxCol; g++){
      const gs = segs.filter(s=>s.gap === g);
      if(!gs.length) continue;
      const parent = new Map();
      const find = k => { while(parent.get(k) !== k){ parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
      const union = (a, b) => { parent.set(find(a), find(b)); };
      gs.forEach(s=>{ ['f:' + s.from, 't:' + s.to].forEach(k=>{ if(!parent.has(k)) parent.set(k, k); }); union('f:' + s.from, 't:' + s.to); });
      const groups = new Map();
      gs.forEach(s=>{
        const r = find('f:' + s.from);
        const yy = [yc.get(s.from), yc.get(s.to)];
        const gr = groups.get(r) || { segs:[], lo:Infinity, hi:-Infinity };
        gr.segs.push(s); gr.lo = Math.min(gr.lo, ...yy); gr.hi = Math.max(gr.hi, ...yy);
        groups.set(r, gr);
      });
      const order = [...groups.values()].sort((a, b)=>a.lo - b.lo || a.hi - b.hi);
      const laneEnd = [];                             // lowest y used so far per lane
      order.forEach(gr=>{
        let lane = laneEnd.findIndex(end=>end < gr.lo - 2);
        if(lane < 0){ lane = laneEnd.length; }
        laneEnd[lane] = gr.hi;
        gr.lane = lane;
      });
      order.forEach(gr=>gr.segs.forEach(s=>{
        laneX.set(s, right[g] + (left[g + 1] - right[g]) * (gr.lane + 1) / (laneEnd.length + 1));
      }));
    }
    const segAt = new Map(segs.map(s=>[s.pi + ':' + s.i, s]));

    // Each path as an orthogonal polyline of [x, y] points (collinear runs merged).
    // Every coordinate sits on a pixel centre (n + .5), so a 1px line covers exactly
    // one row / column of pixels instead of being smeared across two.
    const snap = v => Math.floor(v) + .5;
    const junctions = new Set();                      // "x|y" points where lines really join
    const pathPts = (pts, pi) => {
      const out = [[snap(right[colOfId.get(pts[0])]), snap(yc.get(pts[0]))]];
      const to = (x, y) => { x = snap(x); y = snap(y); const [px, py] = out[out.length - 1]; if(px !== x || py !== y) out.push([x, y]); };
      for(let i = 1; i < pts.length; i++){
        const c = colOfId.get(pts[i]), lx = laneX.get(segAt.get(pi + ':' + i)), y = yc.get(pts[i]);
        const y0 = out[out.length - 1][1];
        junctions.add(snap(lx) + '|' + y0).add(snap(lx) + '|' + snap(y));
        to(lx, y0); to(lx, y); to(left[c], y);
        if(pts[i][0] === '~') to(right[c], y);
      }
      return out.filter((p, k, a)=> k === 0 || k === a.length - 1 ||
        !((a[k-1][0] === p[0] && p[0] === a[k+1][0]) || (a[k-1][1] === p[1] && p[1] === a[k+1][1])));
    };
    const lines = L.paths.map((p, pi)=>pathPts(p.pts, pi));

    // Split into horizontal / vertical pieces and merge the ones that overlap, so
    // every stretch of line is drawn exactly once. (Lines drawn on top of each
    // other add up their anti-aliasing and look brighter / thicker.)
    const hRaw = [], vRaw = [];
    lines.forEach(pts=>{
      for(let k = 1; k < pts.length; k++){
        const [x1, y1] = pts[k-1], [x2, y2] = pts[k];
        if(y1 === y2) hRaw.push({ at:y1, a:Math.min(x1, x2), b:Math.max(x1, x2) });
        else          vRaw.push({ at:x1, a:Math.min(y1, y2), b:Math.max(y1, y2) });
      }
    });
    const merge = list => {
      const by = new Map(), out = [];
      list.forEach(s=>{ if(!by.has(s.at)) by.set(s.at, []); by.get(s.at).push(s); });
      by.forEach((arr, at)=>{
        arr.sort((p, q)=>p.a - q.a);
        let cur = null;
        arr.forEach(s=>{
          if(cur && s.a <= cur.b) cur.b = Math.max(cur.b, s.b);
          else out.push(cur = { at, a:s.a, b:s.b });
        });
      });
      return out;
    };
    const hs = merge(hRaw), vs = merge(vRaw);

    // Crossings: a vertical and a horizontal that meet strictly inside both and
    // not at a point where lines actually join.
    const R = CHAIN_CROSS.r, HOP = CHAIN_CROSS.mode === 'hop', EPS = .5;
    const G = R / 2, TX = Math.sqrt(R * R - G * G);
    let d = '';
    hs.forEach(h=>{ d += 'M' + h.a + ' ' + h.at + 'H' + h.b; });   // horizontals are never broken
    vs.forEach(v=>{
      const x = v.at;
      const at = hs.filter(h=>x > h.a + EPS && x < h.b - EPS && h.at > v.a + EPS && h.at < v.b - EPS &&
                              !junctions.has(x + '|' + h.at)).map(h=>h.at).sort((p, q)=>p - q);
      d += 'M' + x + ' ' + v.a;
      let last = null;
      at.forEach(y=>{
        if(last !== null && y - last < 2 * R) return;              // too close to the previous one
        last = y;
        if(!HOP){ d += 'V' + (y - R) + 'M' + x + ' ' + (y + R); return; }
        // hop: half-circle bulging right, cut G px above and below the horizontal
        d += 'V' + (y - R)
          + 'A' + R + ' ' + R + ' 0 0 1 ' + (x + TX) + ' ' + (y - G)
          + 'M' + (x + TX) + ' ' + (y + G)
          + 'A' + R + ' ' + R + ' 0 0 1 ' + x + ' ' + (y + R);
      });
      d += 'V' + v.b;
    });

    // one solid path for the whole graph
    canvas.insertAdjacentHTML('afterbegin',
      `<svg class="fc-lines" width="${totalW}" height="${totalH}" aria-hidden="true"><path d="${d}"/></svg>`);
    section.dataset.ready = '1';
  }

  // Jump to a feat from the tree: clear the filters, search its exact name and
  // open its card.
  function goToFeat(idx){
    const f = FEATS_DATA[idx];
    if(state.searchScope !== SEARCH_SCOPE_NAMES){
      document.querySelector('#searchScope [data-scope="' + SEARCH_SCOPE_NAMES + '"]').click();
    }
    resetCategories();
    resetPrereqFilters();
    document.getElementById('searchInput').value = f.name;
    state.query = f.name.trim().toLowerCase();
    search.syncClearIcon();
    state.open.add(idx);
    render();
    const card = document.querySelector('#featList .feat-card[data-idx="' + idx + '"]');
    if(card) card.scrollIntoView({ block:'start', behavior:'smooth' });
  }

  document.getElementById('featList').addEventListener('click', e=>{
    const go = e.target.closest('[data-chain-go]');
    if(go){ goToFeat(+go.dataset.chainGo); return; }
  });

  function cardHTML(f){
    const cVar = f._cardColor;
    const isOpen = state.open.has(f._idx);

    const flavorHtml = f.flavor_text ? `<p class="feat-flavor copyable" data-copy="${escapeHtml(f.flavor_text)}">${escapeHtml(f.flavor_text)}</p>` : '';

    const prereqHtml = (f.prerequisites && f.prerequisites.length>0) ? `
        <div class="entry-section copyable" data-copy="${escapeHtml(clipboardFormatText(f.prerequisites))}">
          <div class="entry-section-title">Prerequisites</div>
          <div class="entry-desc feat-desc"><div>${htmlFormatText(f.prerequisites)}</div></div>
        </div>` : '';

    const groupFields = [
      ['Benefits', f.benefits],
      ['Normal', f.normal],
      ['Special', f.special]
    ].filter(([label,val])=>val && val.length>0);

    const groupInnerHtml = groupFields.map(([label,val])=>{
      return `
        <div class="entry-section">
          <div class="entry-section-title">${escapeHtml(label)}</div>
          <div class="entry-desc feat-desc"><div>${htmlFormatText(val)}</div></div>
        </div>`;
    }).join('');

    const combinedCopyText = clipboardFormatText(
      groupFields.map(([label,val])=> label==='Benefits' ? val : `${label}: ${val}`).join('\n\n')
    );

    const groupHtml = groupFields.length
      ? `<div class="copyable" data-copy="${escapeHtml(combinedCopyText)}">${groupInnerHtml}
        </div>`
      : '';

    // Empty shell; the tree itself is built when the card opens (fillChain).
    const chainHtml = f._hasChain ? `
        <div class="entry-section fc-section">
          <div class="entry-section-title">Feat Chain</div>
          <div class="fc-scroll"><div class="fc-wrap"></div></div>
        </div>` : '';

    return `
    <div class="entry-card feat-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${f._idx}">
      <div class="entry-head" data-toggle="${f._idx}">
        <div class="entry-title-block">
          <span class="entry-name feat-name copyable" data-copy="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
          <span class="entry-tag">${escapeHtml(f.category)}</span>
        </div>
        <div class="entry-right">
          <span class="entry-badge entry-badge--responsive" title="${escapeHtml(f.flavor_text||'')}">${escapeHtml(f.flavor_text||'')}</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body">
        ${flavorHtml}${prereqHtml}${groupHtml}${chainHtml}
      </div>
    </div>`;
  }

  // Every filter except Class Feature — the population the Class Feature
  // dropdown's own options are computed from.
  function baseFiltered(){
    let list = FEATS_DATA;
    if(state.query){
      list = list.filter(f=>matchesQuery(f, state.query));
    }
    if(state.categories.size){
      list = list.filter(f=>state.categories.has(f.category));
    }
    if(state.prereq === 'none'){
      list = list.filter(f=>!f.prerequisites);
    } else if(state.prereq === 'some'){
      list = list.filter(f=>!!f.prerequisites);
    }
    if(state.prereqQuery){
      list = list.filter(f=>matchesPrereqQuery(f, state.prereqQuery));
    }
    if(state.abilities.size){
      list = list.filter(f=>{
        for(const a of state.abilities){ if(f._abilities.has(a)) return true; }
        return false;
      });
    }
    if(state.bab){
      list = list.filter(f=>f._hasBab);
    }
    if(state.skillRanks){
      list = list.filter(f=>f._hasSkillRanks);
    }
    return list;
  }

  // Rebuilds the Class Feature <select> keeping only features that appear
  // in the prerequisites of `list`. Resets to "Any" if the selection vanished.
  function updateClassFeatureOptions(list){
    const present = new Set();
    list.forEach(f=>f._classFeatures.forEach(k=>present.add(k)));
    if(state.classFeature && !present.has(state.classFeature)) state.classFeature = '';
    classFeatureSelectEl.innerHTML = '<option value="">Any</option>' +
      ALL_CLASS_FEATURE_OPTIONS.filter(o=>present.has(o.value))
        .map(o=>`<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    sortSelectOptions(classFeatureSelectEl);
    classFeatureSelectEl.value = state.classFeature;
  }

  function filtered(){
    const base = baseFiltered();
    updateClassFeatureOptions(base);
    const list = state.classFeature ? base.filter(f=>f._classFeatures.has(state.classFeature)) : base;
    const sorted = list.slice();
    if(state.sort==='name'){
      sorted.sort((a,b)=>a.name.localeCompare(b.name));
    } else if(state.sort==='name_desc'){
      sorted.sort((a,b)=>b.name.localeCompare(a.name));
    } else if(state.sort==='category'){
      sorted.sort((a,b)=>(a.category||'').localeCompare(b.category||'') || a.name.localeCompare(b.name));
    } else if(state.sort==='category_desc'){
      sorted.sort((a,b)=>(b.category||'').localeCompare(a.category||'') || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    setListTitle(results.length, 'Feat');
    renderList({
      state, results, listId: 'featList', cardHTML,
      cardClass: 'feat-card', nameClass: 'feat-name',
      emptyNoun: 'feats', labelPlural: 'Feats', rerender: render,
      onOpen: (idx, card)=>fillChain(idx, card)
    });
  }

  render();
})();
