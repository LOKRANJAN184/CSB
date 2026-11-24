with open('/home/ranjan/CSB PROJECT/public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

svg_camera_sm = '<svg class="w-5 h-5 text-amber-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
svg_branch_lg = '<svg class="w-6 h-6 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>'
svg_lock_lg = '<svg class="w-6 h-6 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
svg_close = '<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

html = html.replace('''            <div
              class="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-lg">
              📷
            </div>''',
'''            <div
              class="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800">
              ''' + svg_camera_sm + '''
            </div>''')

html = html.replace('''          <div
            class="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">
            🏢
          </div>''',
'''          <div
            class="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
            ''' + svg_branch_lg + '''
          </div>''')

html = html.replace('''          <div
            class="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">
            🔒
          </div>''',
'''          <div
            class="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
            ''' + svg_lock_lg + '''
          </div>''')

# Close buttons
html = html.replace('>✕</button>', '>' + svg_close + '</button>')
html = html.replace('> ✕ </button>', '>' + svg_close + '</button>')
html = html.replace('>\n            ✕\n          </button>', '>\n            ' + svg_close + '\n          </button>')

with open('/home/ranjan/CSB PROJECT/public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# Now app.js
with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

js = js.replace('⚠️ ${sign}₹', '${sign}₹')
js = js.replace('⚠️ ${diffSign}₹', '${diffSign}₹')
js = js.replace('✓ ₹0', '₹0')
js = js.replace('<span>🚫</span> <span>Block Shop Device</span>', '<span>Block Shop Device</span>')
js = js.replace('🟢 ${sum.present}P', '${sum.present}P')
js = js.replace('🟡 ${sum.halfDay}H', '${sum.halfDay}H')
js = js.replace('🔴 ${sum.absent}A', '${sum.absent}A')

svg_edit = '<svg class="w-3.5 h-3.5 text-amber-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
svg_trash = '<svg class="w-3.5 h-3.5 text-rose-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'

js = js.replace('>\\n            ✏️\\n          </button>', '>\\n            ' + svg_edit + '\\n          </button>')
js = js.replace('>\\n            🗑️\\n          </button>', '>\\n            ' + svg_trash + '\\n          </button>')

with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print('Final cleanup complete!')

