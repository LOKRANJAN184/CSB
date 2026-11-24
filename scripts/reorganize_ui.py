import re

def update_html():
    with open("public/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Update body tag: remove pb-24 from body so login gate doesn't have extra bottom padding
    html = re.sub(
        r'<body class="([^"]*)">',
        r'<body class="bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans min-h-screen antialiased select-none">',
        html,
        count=1
    )

    # 2. Extract modal-auth
    modal_auth_marker = "<!-- 1. AUTH / LOGIN MODAL (LARGE PIN KEYPAD) -->"
    modal_staff_marker = "<!-- 2. ADD / EDIT STAFF MODAL -->"
    auth_start = html.find(modal_auth_marker)
    staff_start = html.find(modal_staff_marker)

    if auth_start == -1 or staff_start == -1:
        raise Exception("Could not find modal markers in index.html")

    auth_block = html[auth_start:staff_start]

    # Clean auth block: remove modal-backdrop outer wrapper and close button, transform to login card
    # Replace the outer <div id="modal-auth" class="modal-backdrop ..."><div class="bg-white ..."> with clean login card
    # Find start of inner card
    card_open_match = re.search(r'<div\s+class="bg-white\s+w-full\s+max-w-sm[^>]*>', auth_block)
    if not card_open_match:
        raise Exception("Could not find inner card in auth_block")

    # Inside inner card, replace the top shop logo / title header to remove close button and add theme toggle
    inner_content = auth_block[card_open_match.end():]
    
    # Remove the last two closing </div>\s*</div> of modal-auth
    last_divs = inner_content.rfind("</div>\n  </div>")
    if last_divs != -1:
        inner_content = inner_content[:last_divs]
    else:
        # try another pattern
        inner_content = re.sub(r'</div>\s*</div>\s*$', '', inner_content.strip())

    # Replace the top header inside inner_content
    # Old header starts at <!-- Official Shop Logo & Title --> until <!-- Device Lock Notice Card
    logo_header_match = re.search(
        r'<!-- Official Shop Logo & Title -->[\s\S]*?(?=<!-- Device Lock Notice Card)',
        inner_content
    )
    if not logo_header_match:
        raise Exception("Could not find Official Shop Logo & Title in inner_content")

    new_login_card_header = """<!-- Official Shop Logo & Title with Theme Toggle -->
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-slate-800 p-1 border border-amber-200/80 dark:border-amber-600/30 shadow-xs flex items-center justify-center shrink-0">
            <img src="/images/logo.png" alt="Chendurar Logo" class="w-full h-full object-contain">
          </div>
          <div>
            <h3 class="font-display font-extrabold text-base text-slate-900 dark:text-slate-100 leading-tight">செந்தூரர் ஸ்வீட்ஸ்</h3>
            <p class="font-bold text-[11px] text-amber-700 dark:text-amber-400">Chendurar Sweets & Bakery</p>
            <p class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Select role & enter 4-digit PIN</p>
          </div>
        </div>
        <button type="button" onclick="app.toggleTheme()"
          class="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-400 flex items-center justify-center transition"
          title="Toggle Dark/Light Mode">
          <span id="login-theme-toggle-icon" class="flex items-center justify-center w-4 h-4">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="12" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          </span>
        </button>
      </div>

      """

    inner_content = inner_content[:logo_header_match.start()] + new_login_card_header + inner_content[logo_header_match.end():]

    # Build the new view-login-gate block
    new_login_gate_html = f"""  <!-- ==================== 1. FULL-SCREEN LOGIN GATEKEEPER VIEW ==================== -->
  <div id="view-login-gate" class="min-h-screen min-h-[100dvh] w-full bg-slate-100/70 dark:bg-slate-950 flex flex-col justify-start items-center px-4 overflow-y-auto" style="padding-top: max(env(safe-area-inset-top, 0px) + 24px, 48px); padding-bottom: max(env(safe-area-inset-bottom, 0px) + 24px, 32px);">
    <div id="modal-auth" class="w-full max-w-sm mx-auto bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800 space-y-4 animate-fade-in">
{inner_content.strip()}
    </div>
  </div>
"""

    # 3. Add Logout button to header
    # In <div id="header-user-badge" class="flex items-center space-x-1.5">
    logout_btn_html = """
        <button id="btn-header-logout" onclick="app.logout()"
          class="w-8 h-8 rounded-xl bg-black/20 hover:bg-black/30 active:scale-95 border border-white/20 flex items-center justify-center text-amber-100 transition"
          title="Logout">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>"""

    # Insert after btn-user-switch closing </button>
    btn_user_switch_end = html.find('id="btn-user-switch"')
    if btn_user_switch_end != -1:
        button_close = html.find('</button>', btn_user_switch_end)
        if button_close != -1:
            button_close += len('</button>')
            html = html[:button_close] + logout_btn_html + html[button_close:]

    # Re-compute landmark positions after logout button insertion
    header_start = html.find("<!-- TOP HEADER / APP BAR -->")
    modals_start = html.find("<!-- ==================== MODALS ==================== -->")
    modal_auth_start = html.find(modal_auth_marker)
    modal_staff_start = html.find(modal_staff_marker)

    # 4. Wrap header through nav in <div id="view-app-shell" class="hidden min-h-screen pb-24">
    # The shell starts at header_start and ends at modals_start (just before MODALS comment)
    shell_content = html[header_start:modals_start]

    wrapped_shell = f"""  <!-- ==================== 2. MAIN AUTHENTICATED APP SHELL (HIDDEN BY DEFAULT) ==================== -->
  <div id="view-app-shell" class="hidden min-h-screen pb-24">
{shell_content.strip()}
  </div>
"""

    # 5. Remove original modal-auth from modals section (from modal_auth_start to modal_staff_start)
    # And assemble the new HTML
    before_header = html[:header_start]
    after_auth = html[modal_staff_start:]

    new_html = before_header + new_login_gate_html + "\n\n" + wrapped_shell + "\n\n  <!-- ==================== MODALS ==================== -->\n\n  " + after_auth

    with open("public/index.html", "w", encoding="utf-8") as f:
        f.write(new_html)

    print("public/index.html successfully updated!")

if __name__ == "__main__":
    update_html()
