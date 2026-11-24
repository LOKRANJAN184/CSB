import re

# 1. Update index.html
with open('/home/ranjan/CSB PROJECT/public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

svg_close = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
svg_lock = '<svg class="w-4 h-4 text-amber-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
svg_alert = '<svg class="w-5 h-5 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
svg_camera = '<svg class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
svg_search = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
svg_settings = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'

html = html.replace('⚙️', svg_settings)
html = html.replace('<span id="global-alert-icon" class="text-2xl">⚠️</span>', '<span id="global-alert-icon" class="w-6 h-6 flex items-center shrink-0">' + svg_alert + '</span>')
html = html.replace('<span class="text-base">🔒</span>', svg_lock)
html = html.replace('<span class="text-lg">🔒</span>', svg_lock)
html = html.replace('class="text-slate-400 hover:text-slate-600 font-bold px-1">✕</button>', 'class="text-slate-400 hover:text-slate-600 font-bold px-1 flex items-center justify-center">' + svg_close + '</button>')
html = html.replace('<span class="text-xs font-bold text-emerald-700 block">✓ Bill Photo Attached</span>', '<span class="text-xs font-bold text-emerald-700 flex items-center gap-1"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Bill Photo Attached</span>')
html = html.replace('<span class="text-[10px] text-amber-700 font-semibold underline">🔍 Tap to Zoom / View</span>', '<span class="text-[10px] text-amber-700 font-semibold underline flex items-center gap-1">' + svg_search + ' Tap to Zoom / View</span>')
html = html.replace('<span class="text-lg">⚠️</span>', svg_alert)
html = html.replace('🟢 0 Present', '0 Present')
html = html.replace('🟡 0 Half', '0 Half')
html = html.replace('🔴 0 Absent', '0 Absent')
html = html.replace('All Present ✓', 'All Present')
html = html.replace('✅ 0 Days Matched', '0 Days Matched')
html = html.replace('⚠️ 0 Days Mismatch', '0 Days Mismatch')
html = html.replace('Attendance Based ✓', 'Attendance Based')
html = html.replace('⚠️ Approving this device will grant Shop Manager access and replace any previously approved device.', 'Approving this device will grant Shop Manager access and replace any previously approved device.')
html = html.replace('View All ➔', 'View All &rarr;')

# Replace camera icon placeholder in upload preview
html = html.replace('<div class="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-2xl text-slate-400">\n            📷\n          </div>',
                    '<div class="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">' + svg_camera + '</div>')

# Replace modal close buttons with svg_close
html = re.sub(r'class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold active:scale-95 transition">\s*✕\s*</button>',
              'class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold active:scale-95 transition">' + svg_close + '</button>', html)
html = re.sub(r'class="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center font-bold text-xl active:scale-90">\s*✕\s*</button>',
              'class="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center font-bold active:scale-90">' + svg_close + '</button>', html)

with open('/home/ranjan/CSB PROJECT/public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Cleaned index.html successfully')

# 2. Update app.js
with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

js_replacements = [
    ("if (statusEl) statusEl.textContent = '✓ Bill photo attached';",
     "if (statusEl) statusEl.textContent = 'Bill photo attached';"),
    ("${sales.isTallied ? 'TALLY MATCHED ✓' : `MISMATCH (Diff: ₹${sales.difference})`}",
     "${sales.isTallied ? 'TALLY MATCHED' : `MISMATCH (Diff: ₹${sales.difference})`}"),
    ('<span class="font-bold text-slate-800 block">✓ Bill Photo Attached</span>',
     '<span class="font-bold text-slate-800 block">Bill Photo Attached</span>'),
    ("document.getElementById('rep-matched-days').textContent = `✅ ${sales.matchedDaysCount} Days Matched`;",
     "document.getElementById('rep-matched-days').textContent = `${sales.matchedDaysCount} Days Matched`;"),
    ("document.getElementById('rep-mismatch-days').textContent = `⚠️ ${sales.mismatchDaysCount} Days Discrepancy`;",
     "document.getElementById('rep-mismatch-days').textContent = `${sales.mismatchDaysCount} Days Discrepancy`;"),
    ('<span class="text-amber-700">🟡 Half: ${staff.halfDays}</span>',
     '<span class="text-amber-700">Half: ${staff.halfDays}</span>'),
    ("if (statusText) statusText.textContent = '✅ All Branches Tally: Perfect Match (₹0 Difference)';",
     "if (statusText) statusText.textContent = 'All Branches Tally: Perfect Match (₹0 Difference)';"),
    ("if (statusText) statusText.textContent = `⚠️ All Branches Tally Discrepancy: ${sign}₹${diff.toLocaleString('en-IN')}`;",
     "if (statusText) statusText.textContent = `All Branches Tally Discrepancy: ${sign}₹${diff.toLocaleString('en-IN')}`;"),
    ("? `<span class=\"inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded text-[11px]\">⚠️ ${sign}₹${b.difference.toLocaleString('en-IN')}</span>`",
     "? `<span class=\"inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded text-[11px]\">${sign}₹${b.difference.toLocaleString('en-IN')}</span>`"),
    (": `<span class=\"inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]\">✓ Matched</span>`",
     ": `<span class=\"inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]\">Matched</span>`"),
    ("${grand.difference === 0 ? '✓ ₹0' : `${netSign}₹${grand.difference.toLocaleString('en-IN')}`}",
     "${grand.difference === 0 ? '₹0' : `${netSign}₹${grand.difference.toLocaleString('en-IN')}`}"),
    ("if (statusText) statusText.textContent = `✅ ${data.branchName || ''} Tally: Perfect Match (₹0 Difference)`;",
     "if (statusText) statusText.textContent = `${data.branchName || ''} Tally: Perfect Match (₹0 Difference)`;"),
    ("if (statusText) statusText.textContent = `⚠️ ${data.branchName || ''} Tally: Discrepancy of ${sign}₹${diff.toLocaleString('en-IN')}`;",
     "if (statusText) statusText.textContent = `${data.branchName || ''} Tally: Discrepancy of ${sign}₹${diff.toLocaleString('en-IN')}`;"),
    ("? `<span class=\"inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded text-[11px]\">⚠️ ${diffSign}₹${rec.difference.toLocaleString('en-IN')}</span>`",
     "? `<span class=\"inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded text-[11px]\">${diffSign}₹${rec.difference.toLocaleString('en-IN')}</span>`"),
    (": `<span class=\"inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]\">✓ ₹0</span>`",
     ": `<span class=\"inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]\">₹0</span>`"),
    ("${totals.difference === 0 ? '✓ ₹0' : `${netSign}₹${totals.difference.toLocaleString('en-IN')}`}",
     "${totals.difference === 0 ? '₹0' : `${netSign}₹${totals.difference.toLocaleString('en-IN')}`}"),
    ('<span class="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">🟢 Present: ${staff.present}</span>',
     '<span class="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">Present: ${staff.present}</span>'),
    ('<span class="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">🟡 Half: ${staff.halfDay}</span>',
     '<span class="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">Half: ${staff.halfDay}</span>'),
    ('<span class="text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px]">🔴 Absent: ${staff.absent}</span>',
     '<span class="text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px]">Absent: ${staff.absent}</span>'),
    ('<span>✅</span> <span>Allow Access (அனுமதி)</span>',
     '<span>Allow Access</span>'),
    ('<span>🚫</span> <span>Block Device (தடைசெய்)</span>',
     '<span>Block Device</span>'),
    ('<span>⚙️</span> <span>Device Settings</span>',
     '<span>Device Settings</span>'),
    ('${staff.phone ? `<p class="text-[11px] text-slate-400">📞 ${staff.phone}</p>` : \'\'}',
     '${staff.phone ? `<p class="text-[11px] text-slate-400 font-medium">${staff.phone}</p>` : \'\'}'),
    ('${b.phone ? `<p class="text-slate-500 text-[11px]">📞 ${b.phone}</p>` : \'\'}',
     '${b.phone ? `<p class="text-slate-500 text-[11px] font-medium">${b.phone}</p>` : \'\'}'),
    ("alertIcon.textContent = '✅';",
     "alertIcon.innerHTML = window.renderIcon ? renderIcon('check', 'w-6 h-6 text-emerald-500') : '';"),
    ("alertIcon.textContent = '⚠️';",
     "alertIcon.innerHTML = window.renderIcon ? renderIcon('alert', 'w-6 h-6 text-amber-500') : '';"),
    ("alertIcon.textContent = '❌';",
     "alertIcon.innerHTML = window.renderIcon ? renderIcon('close', 'w-6 h-6 text-rose-500') : '';")
]

for old, new in js_replacements:
    js = js.replace(old, new)

# Staff list action buttons: replace ✏️ and 🗑️ with SVG icons
js = js.replace('>✏️</button>', ' title="Edit"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>')
js = js.replace('>🗑️</button>', ' title="Delete"><svg class="w-3.5 h-3.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>')

with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print('Cleaned app.js successfully')

