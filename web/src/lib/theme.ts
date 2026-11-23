/** 라이트·다크 모드 선택. 'system'이면 OS 설정을 따른다. 브라우저(localStorage)에만 저장한다. */

export type ThemePref = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "sk-themechange";

/**
 * 화면이 그려지기 전에 <head>에서 실행하는 스크립트.
 * 저장된 선택을 읽어 <html data-theme>을 붙이고, '시스템' 선택이면 OS 설정이 바뀔 때 따라간다.
 * (React보다 먼저 돌아야 다크 모드에서 하얀 화면이 번쩍이지 않는다)
 */
export const themeInitScript = `(function(){
var k=${JSON.stringify(THEME_STORAGE_KEY)},m=matchMedia("(prefers-color-scheme: dark)");
function pref(){try{return localStorage.getItem(k)}catch(e){return null}}
function apply(){var p=pref();var d=p==="dark"||(p!=="light"&&m.matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}
apply();m.addEventListener("change",apply);window.addEventListener(${JSON.stringify(THEME_CHANGE_EVENT)},apply);window.addEventListener("storage",apply);
})();`;

export function saveThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 이번 화면에만 적용된다
  }
  // 시작 스크립트의 리스너에 기대지 않고 바로 적용한다
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
