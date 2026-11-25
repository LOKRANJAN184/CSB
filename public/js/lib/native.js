// Thin wrappers around Capacitor plugins. Capacitor injects window.Capacitor
// when the app runs inside the Android APK; in a normal browser it is absent,
// so every function here has a browser fallback.

const cap = () => window.Capacitor;
export const isNative = () => Boolean(cap()?.isNativePlatform?.());
const plugin = (name) => cap()?.Plugins?.[name];

/** The installed APK's version (from android/app/build.gradle), e.g. "2.0.0". */
export async function nativeVersion() {
  const App = plugin('App');
  if (!App) return null;
  try { return (await App.getInfo()).version; } catch { return null; }
}

/** Open a link outside the app: the system browser handles APK and PDF downloads. */
export async function openExternal(url) {
  const Browser = plugin('Browser');
  if (isNative() && Browser) return Browser.open({ url });
  window.open(url, '_blank', 'noopener');
}

/** Android hardware back button. */
export function onBackButton(handler) {
  plugin('App')?.addListener?.('backButton', handler);
}
export const exitApp = () => plugin('App')?.exitApp?.();

/** Run a callback whenever the app comes back to the foreground. */
export function onResume(handler) {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && handler());
}
