import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { segmented } from '../ui/components.js';
import { openSheet, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { store } from '../store.js';
import { checkForUpdate, downloadUpdate } from '../lib/update.js';
import { isNative } from '../lib/native.js';
import { applyTheme, currentTheme } from '../lib/theme.js';

export default async function moreScreen(ctx) {
  const u = store.user;
  ctx.setTitle('More', `${u.name} · ${u.role === 'owner' ? 'Owner' : 'Shop Manager'}`);

  const link = (href, iconName, title, sub, badge) =>
    h('li', null, h('a', { class: 'row', href }, icon(iconName), h('div', { class: 'row__main' }, h('strong', null, title), sub && h('span', null, sub)), badge, icon('chevronRight')));

  const versionRow = h('span', null, 'Checking…');
  const updateBtn = h('button', { class: 'row', onclick: () => busy(updateBtn, runUpdateCheck) }, icon('download'), h('div', { class: 'row__main' }, h('strong', null, 'App version'), versionRow));

  async function runUpdateCheck(manual = true) {
    const r = await checkForUpdate();
    if (r.hasUpdate) {
      versionRow.textContent = `v${r.current} → v${r.latest.version} available`;
      if (manual) openUpdateSheet(r);
    } else {
      versionRow.textContent = `v${r.current}${r.latest ? ' · up to date' : ''}`;
      if (manual) toast(r.error ? r.error : isNative() ? 'You have the latest version' : 'The web version is always up to date', r.error ? 'bad' : 'good');
    }
  }

  mount(ctx.root,
    h('p', { class: 'section-label' }, 'Shop'),
    h('section', { class: 'card card--flush' }, h('ul', { class: 'list' },
      link('#/staff', 'users', 'Staff', store.isOwner ? 'Add staff, set per-day salary' : 'Add or remove staff'),
      store.isOwner && link('#/branches', 'store', 'Branches & devices', 'Approve shop phones, manager PINs',
        store.pendingDevices ? h('span', { class: 'badge badge--bad' }, `${store.pendingDevices} waiting`) : null),
      store.isOwner && link('#/history', 'history', 'Edit history', 'Every change, who made it and when')
    )),
    h('p', { class: 'section-label' }, 'App'),
    h('section', { class: 'card card--flush' }, h('ul', { class: 'list' },
      store.isOwner && link('#/security', 'key', 'Owner login PINs', 'Change PIN, add or remove phones'),
      h('li', null, h('div', { class: 'row' }, icon('sun'), h('div', { class: 'row__main' }, h('strong', null, 'Appearance')))),
      h('li', { style: { padding: '0 16px 12px' } }, segmented({ label: 'Theme', options: [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], value: currentTheme(), onChange: applyTheme })),
      h('li', null, updateBtn)
    )),
    h('button', { class: 'btn btn--danger btn--block', onclick: async () => { if (await confirmSheet({ title: 'Log out?', message: 'You will need your PIN to log in again.', confirmLabel: 'Log out', danger: true })) ctx.logout(); } }, icon('logout'), 'Log out')
  );
  runUpdateCheck(false);
}

export function openUpdateSheet({ current, latest }) {
  const sheet = openSheet({
    title: `Update to v${latest.version}`,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `You have v${current}.${latest.apkSize ? ` Download size ${(latest.apkSize / 1048576).toFixed(1)} MB.` : ''}`),
      latest.notes && h('div', { class: 'card', style: { whiteSpace: 'pre-wrap', fontSize: '14px' } }, latest.notes),
      h('p', { class: 'small muted' }, 'The download opens in your browser. When it finishes, tap it and choose Install. If Android asks, allow "Install unknown apps" for your browser. Your data is safe — it lives on the server.')
    ),
    actions: [h('button', { class: 'btn btn--primary btn--block', onclick: () => { downloadUpdate(latest); sheet.close(); } }, icon('download'), 'Download update')],
  });
}
