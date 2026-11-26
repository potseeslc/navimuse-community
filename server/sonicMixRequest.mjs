// NaviMuse-owned contract; AudioMuse remains behind the authenticated BFF.
export function sonicMixRequest(body) {
  const invalid = () => { throw Object.assign(new Error('Choose a sound description or at least one included song or artist.'), {status:400, publicMessage:'Choose a sound description or at least one included song or artist.'}); };
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['mode','query','items','limit'].includes(key))) invalid();
  const limit = body.limit ?? 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalid();
  if (body.mode === 'sound') {
    if (body.items !== undefined || typeof body.query !== 'string' || /[\x00-\x1f\x7f]/.test(body.query)) invalid();
    const query = body.query.trim().replace(/\s+/g, ' ');
    if (query.length < 3 || query.length > 240) invalid();
    return {path:'/api/clap/search', payload:{query,limit:Math.min(100,limit * 2)},limit};
  }
  if (body.mode !== 'blend' || body.query !== undefined || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 8) invalid();
  const keys = new Set();
  const items = body.items.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['id','type','op'].includes(key)) || !['song','artist'].includes(item.type) || !['ADD','SUBTRACT'].includes(item.op) || typeof item.id !== 'string' || !/^[A-Za-z0-9._:-]{1,512}$/.test(item.id)) invalid();
    const key = `${item.type}:${item.id}`;
    if (keys.has(key)) invalid();
    keys.add(key);
    return {id:item.id,type:item.type,op:item.op};
  });
  if (!items.some(item => item.op === 'ADD')) invalid();
  return {path:'/api/alchemy',payload:{items,n:Math.min(100,limit * 2)},limit};
}
