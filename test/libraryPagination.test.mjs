import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryBrowsePageSize, nextVisibleLibraryCount, visibleLibraryItems } from '../src/libraryPagination.js';

test('large library rendering mounts only the initial incremental page', () => {
  const library = Array.from({ length: 1372 }, (_, index) => ({ id: index }));
  const visible = visibleLibraryItems(library, libraryBrowsePageSize);

  assert.equal(libraryBrowsePageSize, 100);
  assert.equal(visible.length, 100);
  assert.deepEqual(visible.at(-1), { id: 99 });
});

test('incremental library rendering keeps stable order and caps its final page', () => {
  const library = Array.from({ length: 1372 }, (_, index) => ({ id: index }));
  const nextCount = nextVisibleLibraryCount(100, library.length);

  assert.equal(nextCount, 200);
  assert.deepEqual(visibleLibraryItems(library, nextCount).map((item) => item.id), Array.from({ length: 200 }, (_, index) => index));
  assert.equal(nextVisibleLibraryCount(1300, library.length), 1372);
});
