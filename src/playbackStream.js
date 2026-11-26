export function playbackStreamForCurrentQueueItem(currentItem, fallbackStreamUrl) {
  const explicitStreamUrl = currentItem?.song?.streamUrl;
  return typeof explicitStreamUrl === 'string' && explicitStreamUrl
    ? explicitStreamUrl
    : fallbackStreamUrl;
}
