// Keep legacy repeat=true as repeat-one when restoring older queues.
export const repeatMode = controls => controls?.repeat === true ? 'one' : controls?.repeatAll === true ? 'all' : 'off';
export function nextRepeatControls(controls) {
 const mode=repeatMode(controls);
 return {repeat:mode==='all',repeatAll:mode==='off'};
}
export function repeatLabel(controls) {
 return {off:'Repeat off. Repeat queue',all:'Repeat queue. Repeat one track',one:'Repeat one track. Turn repeat off'}[repeatMode(controls)];
}
