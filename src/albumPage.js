export function appendUniqueAlbums(previous, incoming) {
  return [...new Map([...previous, ...incoming].map(album => [String(album.id), album])).values()];
}

export function checkedAlbumPage(payload, offset) {
  if (!Array.isArray(payload?.albums) || !payload.page || !Object.hasOwn(payload.page, 'nextOffset')) throw new Error('Invalid album page');
  const nextOffset = payload.page?.nextOffset ?? null;
  if (nextOffset !== null && (!Number.isSafeInteger(nextOffset) || nextOffset <= offset)) {
    throw new Error('Album pagination did not advance');
  }
  return { albums: payload.albums, page: { ...payload.page, nextOffset } };
}
