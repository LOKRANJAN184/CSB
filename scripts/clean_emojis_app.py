with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

replacements = [
    ("showToast(`🔔 Device approval request from Shop Manager (${payload.deviceName})`, 'warning');",
     "showToast(`Device approval request from Shop Manager (${payload.deviceName})`, 'warning');"),
    ("showToast('🎉 Device approved by Owner! Enter PIN to login.', 'success');",
     "showToast('Device approved by Owner! Enter PIN to login.', 'success');"),
    ("showToast(`⚠️ Blocked attempt from unauthorized device: ${payload.deviceName}`, 'warning');",
     "showToast(`Blocked attempt from unauthorized device: ${payload.deviceName}`, 'warning');"),
    ("showToast('🎉 Your device is approved! Enter PIN to login.', 'success');",
     "showToast('Your device is approved! Enter PIN to login.', 'success');"),
    ("showToast('❌ This device is not approved. Access allowed only from shop device.', 'error');",
     "showToast('This device is not approved. Access allowed only from shop device.', 'error');"),
    ("if (iconEl) iconEl.textContent = '👤';",
     "if (iconEl) iconEl.innerHTML = window.renderIcon ? renderIcon('manager', 'w-3.5 h-3.5') : '';"),
    ("if (nameEl) nameEl.textContent = isOwner ? '👑 Owner' : '👔 Manager';",
     "if (nameEl) nameEl.textContent = isOwner ? 'Owner' : 'Manager';"),
    ("if (iconEl) iconEl.textContent = isOwner ? '👑' : '👔';",
     "if (iconEl) iconEl.innerHTML = window.renderIcon ? renderIcon(isOwner ? 'owner' : 'manager', 'w-3.5 h-3.5') : '';"),
    ("calIndicator.textContent = isOwner ? '👑 Owner (Edit Any Date)' : '👔 Manager (Edit Today Only)';",
     "calIndicator.textContent = isOwner ? 'Owner (Edit Any Date)' : 'Manager (Edit Today Only)';"),
    ("<span>📷</span> <span>Attach Bill</span>",
     "<span class=\"flex items-center gap-1.5\"><svg class=\"w-3.5 h-3.5 shrink-0\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z\"/><circle cx=\"12\" cy=\"13\" r=\"4\"/></svg> <span>Attach Bill</span></span>"),
    ("tallyTitle.innerHTML = '<span>⚖️ Sales Tally Status</span>';",
     "tallyTitle.innerHTML = '<span>Sales Tally Status</span>';"),
    ("tallyBadge.textContent = 'MATCHED ✓';",
     "tallyBadge.textContent = 'MATCHED';"),
    ("tallyBadge.textContent = 'MISMATCH ⚠️';",
     "tallyBadge.textContent = 'MISMATCH';"),
    ("🟢 Present", "Present"),
    ("🟡 Half-day", "Half-day"),
    ("🔴 Absent", "Absent"),
    ("<span>🕒</span> <span>In-Time</span>", "<span>In-Time</span>"),
    ("<span class=\"text-xs\">🕒</span>", ""),
    ("<span>🕒</span> <span>Out-Time</span>", "<span>Out-Time</span>"),
    ("if (elP) elP.textContent = `🟢 ${p} Present`;",
     "if (elP) elP.textContent = `${p} Present`;"),
    ("if (elH) elH.textContent = `🟡 ${h} Half`;",
     "if (elH) elH.textContent = `${h} Half`;"),
    ("if (elA) elA.textContent = `🔴 ${a} Absent`;",
     "if (elA) elA.textContent = `${a} Absent`;"),
    ("<span>✏️</span> <span>Edit This Date</span>", "<span>Edit This Date</span>"),
    ("🔒 View Only", "View Only"),
    ("<h5 class=\"font-display font-bold text-sm text-slate-800\">💰 Sales & Tally Summary</h5>",
     "<h5 class=\"font-display font-bold text-sm text-slate-800\">Sales & Tally Summary</h5>"),
    ("<h5 class=\"font-display font-bold text-sm text-slate-800\">🧾 Expenses (கடை செலவுகள்)</h5>",
     "<h5 class=\"font-display font-bold text-sm text-slate-800\">Expenses</h5>"),
    ("<span>🔍</span> <span>View Bill</span>", "<span>View Bill</span>"),
    ("<h5 class=\"font-display font-bold text-sm text-slate-800\">👥 Staff Attendance",
     "<h5 class=\"font-display font-bold text-sm text-slate-800\">Staff Attendance"),
    ("options += '<option value=\"all\">🏢 Consolidated: All Branches</option>';",
     "options += '<option value=\"all\">Consolidated: All Branches</option>';"),
    ("const roleIcon = log.performedBy.role === 'owner' ? '👑' : '👔';",
     "const roleIcon = log.performedBy.role === 'owner' ? 'Owner' : 'Manager';"),
    ("<span>🏢</span> ${log.branchName || 'Main Branch'}",
     "${log.branchName || 'Main Branch'}"),
    ("<span>👔</span> <span>${mgrUser}</span>",
     "<span>Manager: ${mgrUser}</span>"),
    ("<span>🔑</span> <span>Reset PIN</span>",
     "<span>Reset PIN</span>"),
    ("<span>✏️</span> <span>Edit Branch</span>",
     "<span>Edit Branch</span>"),
    ("return `<option value=\"${b._id}\" ${selected}>🏢 ${b.name} (${b.code})</option>`;",
     "return `<option value=\"${b._id}\" ${selected}>${b.name} (${b.code})</option>`;"),
    ("<span>🔓</span> <span>Unblock</span>", "<span>Unblock</span>"),
    ("<span>✅</span> <span>Allow</span>", "<span>Allow</span>"),
    ("<span>🚫</span> <span>Block</span>", "<span>Block</span>")
]

for old, new in replacements:
    text = text.replace(old, new)

with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('Cleaned emojis in app.js')

