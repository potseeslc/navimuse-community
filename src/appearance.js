import {accentColors,normalizeAppearance} from '../shared/appearance.js';
export function applyAppearance(value,root=document.documentElement,media=window.matchMedia('(prefers-color-scheme: dark)')) {
 const preference=normalizeAppearance(value);
 const update=()=>{const theme=preference.theme==='system'?(media.matches?'dark':'light'):preference.theme;root.dataset.theme=theme;root.style.colorScheme=theme;root.style.setProperty('--nm-accent',accentColors[preference.accent][theme]);root.style.setProperty('--nm-focus',accentColors[preference.accent][theme]);};
 update();media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update);
}
