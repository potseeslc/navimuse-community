export const libraryBrowsePageSize = 100;

export function visibleLibraryItems(items, visibleCount) {
  return items.slice(0, Math.max(libraryBrowsePageSize, visibleCount));
}

export function nextVisibleLibraryCount(currentCount, totalCount) {
  return Math.min(totalCount, Math.max(libraryBrowsePageSize, currentCount) + libraryBrowsePageSize);
}
