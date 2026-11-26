export const accentColors={
 orange:{name:'Orange',dark:'#ff5a36',light:'#b63818'},
 copper:{name:'Copper',dark:'#ed9972',light:'#924224'},
 gold:{name:'Gold',dark:'#edc35d',light:'#82600a'},
 green:{name:'Green',dark:'#83cf90',light:'#286b37'},
 teal:{name:'Teal',dark:'#64d2c7',light:'#176e68'},
 blue:{name:'Blue',dark:'#78b6ff',light:'#245fa0'},
 violet:{name:'Violet',dark:'#bc9bff',light:'#6c43aa'},
 neutral:{name:'White / graphite',dark:'#f3f1ed',light:'#30343a'}
};
export function normalizeAppearance(value={}) {return {theme:['dark','light','system'].includes(value?.theme)?value.theme:'dark',accent:Object.hasOwn(accentColors,value?.accent)?value.accent:'orange'};}
