// Shared FORMATTING helpers (all pages). Only formatting functions live here.
//
// Load AFTER base.js (htmlFormat... functions use escapeHtml from it):
//   <script src="js/base.js"></script>
//   <script src="js/format.js"></script>
//
// ---- NAMING CONVENTION ---------------------------------------------------
// Every function name starts with the kind of output it produces:
//
//   htmlFormat...       HTML display output (cards, tables, bold/italic tags).
//                       Input is raw source text and gets HTML-escaped, except
//                       the low-level "Bold / Italic / LabelBold" helpers,
//                       which take text that is ALREADY escaped.
//   clipboardFormat...  Plain-text output for copy-to-clipboard (data-copy).
//                       Uses Markdown (**bold**), never HTML. No escaping.
//   format...           Shared value formatters, independent of HTML or
//                       clipboard: raw value in, display string out.
//
// Markup supported in source text (by htmlFormat... and clipboardFormat...):
//   >> H1/H2/H3  + following "a | b | c" lines   -> <table>   (HTML only)
//   >> Heading   (no "|" rows after it)           -> bold heading line
//   Label:       (short leading label)            -> <b>Label:</b>
//   **text**                                      -> <b>text</b>
//   *text*                                        -> <i>text</i>

// =========================================================================
// 1. HTML FORMATTING  (htmlFormat...)
// =========================================================================

// ---- Single-purpose functions -------------------------------------------
// htmlFormatBold, htmlFormatItalic and htmlFormatLabelBold take text that is
// ALREADY HTML-escaped, so they never introduce unescaped user text.

// **text** -> <b>text</b> (single line only).
function htmlFormatBold(escapedHtml){
  return (escapedHtml || '').replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>');
}

// *text* -> <i>text</i> (single line only; "**" is left alone).
function htmlFormatItalic(escapedHtml){
  return (escapedHtml || '').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<i>$1</i>');
}

// Short leading "Label:" (up to 5 words) -> <b>Label:</b>. An optional
// leading "- " bullet is kept outside the bold. A label that contains "**"
// is skipped (that line is already explicit bold markup).
function htmlFormatLabelBold(escapedLine){
  return (escapedLine || '').replace(
    /^(\s*(?:-\s*)?)((?:\S+\s+){0,4}\S*?:)/,
    (m, lead, label) => label.includes('**') ? m : `${lead}<b>${label}</b>`
  );
}

// Escapes plain text, then applies **bold** and *italic*. For table cells and
// any single field that should only get inline markup (no label bolding).
function htmlFormatInline(text){
  return htmlFormatItalic(htmlFormatBold(escapeHtml(text || '')));
}

// One line: ">> Heading" -> bold heading; otherwise escape + Label: + ** + *.
function htmlFormatLine(line){
  const heading = String(line || '').match(/^\s*>>\s*(.*)$/);
  if(heading) return `<b>${htmlFormatInline(heading[1])}</b>`;
  return htmlFormatItalic(htmlFormatBold(htmlFormatLabelBold(escapeHtml(line || ''))));
}

// Multi-line text without tables: every line through htmlFormatLine.
// Use for fields like Benefits / Normal / Special / Prerequisites.
function htmlFormatText(text){
  return (text || '').split('\n').map(htmlFormatLine).join('\n');
}

// Builds a table from header cells and rows (arrays of cell strings).
// Rows shorter than the widest row are padded with empty cells.
function htmlFormatTable(headers, rows){
  const cols = Math.max(headers.length, ...rows.map(r => r.length));
  const pad = arr => Array.from({length: cols}, (_, k) => arr[k]);
  const cell = (tag, v) => `<${tag}>${htmlFormatInline(v || '')}</${tag}>`;
  const head = pad(headers).map(h => cell('th', h)).join('');
  const body = rows.map(r => `<tr>${pad(r).map(c => cell('td', c)).join('')}</tr>`).join('');
  return `<div class="desc-table-wrap"><table class="desc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---- Group function -----------------------------------------------------

// Full "description" formatting: tables + Label: + **bold** + *italic*.
//
// A ">>" line opens a table when the next line contains "|" (and doesn't
// start with "**"): text after ">>" is the header (columns split by "/"),
// each following "|" line is a row (cells split by "|"). The table ends at
// the first line without "|"; that line is then formatted normally.
// Blank lines right after a table are dropped. Text just before a table keeps
// its own newlines (one "\n" is added for the break into the table).
function htmlFormatDescription(text){
  const lines = (text || '').split('\n');
  const pieces = [];
  let buf = [];
  let afterTable = false;
  const flush = beforeTable => {
    if(buf.length) pieces.push(htmlFormatText(buf.join('\n')) + (beforeTable ? '\n' : ''));
    buf = [];
  };
  const isRow = l => l !== undefined && l.includes('|') && !/^\s*\*\*/.test(l);

  for(let i = 0; i < lines.length; i++){
    const head = lines[i].match(/^\s*>>\s*(.*)$/);
    if(head && isRow(lines[i + 1])){
      const headers = head[1].split('/').map(h => h.trim());
      const rows = [];
      let j = i + 1;
      while(j < lines.length && isRow(lines[j])){
        rows.push(lines[j].split('|').map(c => c.trim()));
        j++;
      }
      flush(true);
      pieces.push(htmlFormatTable(headers, rows));
      afterTable = true;
      i = j - 1;
    } else {
      if(afterTable && !lines[i].trim()) continue;
      afterTable = false;
      buf.push(lines[i]);
    }
  }
  flush(false);
  return pieces.join('');
}

// =========================================================================
// 2. CLIPBOARD FORMATTING  (clipboardFormat...)
// =========================================================================
// Plain-text output for data-copy / navigator.clipboard. Raw text in, raw
// text out: no HTML, no escaping.

// Same label rule as htmlFormatText, for clipboard text: a ">> Heading" line
// or a short leading "Label:" (up to 5 words) is wrapped in Markdown ** **
// instead of <b>. Any *italic* / **bold** markup already in the text is kept.
function clipboardFormatText(text){
  return (text || '').split('\n').map(line => {
    const headingMatch = line.match(/^\s*>>\s*(.*)$/);
    if(headingMatch) return `**${headingMatch[1]}**`;
    return line.replace(/^(\s*(?:-\s*)?)((?:\S+\s+){0,4}\S*?:)/, '$1**$2**');
  }).join('\n');
}

// =========================================================================
// 3. SHARED FORMATTING  (format...)
// =========================================================================
// Turn a raw value (number, string) into a display string. Used for both
// HTML and clipboard output.

// 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11/12/13 -> "th", 21 -> "21st".
// Non-numeric input is returned as a string unchanged ('' for null/undefined).
function formatOrdinal(value){
  const n = Number(value);
  if(value === null || value === undefined || value === '' || !isFinite(n)){
    return (value === null || value === undefined) ? '' : String(value);
  }
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  if(lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch(abs % 10){
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// 3 -> "+3", 0 -> "+0", -2 -> "–2" (true en dash, as in the stat blocks).
// null/undefined -> "–".
function formatSigned(value){
  if(value === null || value === undefined) return '–';
  return value >= 0 ? `+${value}` : `–${Math.abs(value)}`;
}

// Uppercases the first character only ("light armor" -> "Light armor").
function formatCapitalize(str){
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// Title-cases every word ("light armor" -> "Light Armor"). Used to normalize
// category/type-like fields that may come from the data with inconsistent
// casing, before they're used as chip labels / color-map keys.
function formatTitleCase(str){
  return (str || '').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Decimal challenge rating -> the fraction form used in the books
// (0.5 -> "1/2", 0.75 -> "3/4", 0.66 -> "2/3", 1.5 -> "1 1/2").
// Whole numbers pass through. emptyText is what to show for a missing CR:
// '—' by default (monsters page); pass '-' to keep the NPC page's look.
function formatChallengeRating(cr, emptyText = '—'){
  if(cr === null || cr === undefined || cr === '') return emptyText;
  const n = Number(cr);
  if(!isFinite(n)) return String(cr);
  if(Number.isInteger(n)) return String(n);
  const whole = Math.floor(n), frac = n - whole;
  for(let d = 2; d <= 12; d++){
    const num = Math.round(frac * d);
    if(num > 0 && num < d && Math.abs(frac - num / d) < 0.01){
      return (whole ? whole + ' ' : '') + num + '/' + d;
    }
  }
  return String(cr);
}
