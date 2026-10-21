// ===== DARK MODE (Tim, Oct 20 2026: the light pages strain his eyes on the computer) =====
// Per device, remembered: the moon in the header turns the page dark, the
// sun turns it back. The <head> sets it before the page paints; the colours
// are in dark.css and the generated dark-*.gen.css (tools/dark_css.py).
const THEME_KEY = 'cfaBudaTheme';
const THEME_BAR = {light: '#F6F1E8', dark: '#121418'};

function themeIsDark(){ return document.documentElement.dataset.theme === 'dark'; }

function themeSet(dark){
  if(dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try{ if(dark) localStorage.setItem(THEME_KEY, 'dark'); else localStorage.removeItem(THEME_KEY); }catch(e){}
  const bar = document.querySelector('meta[name="theme-color"]');
  if(bar) bar.content = dark ? THEME_BAR.dark : THEME_BAR.light;
  themeSyncButton();
}

function themeSyncButton(){
  const btn = document.getElementById('hdrTheme');
  if(!btn) return;
  const dark = themeIsDark();
  btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  btn.title = btn.ariaLabel = dark ? 'Light mode' : 'Dark mode';
}

document.addEventListener('click', e => {
  if(e.target.closest('#hdrTheme')) themeSet(!themeIsDark());
});
themeSyncButton();
