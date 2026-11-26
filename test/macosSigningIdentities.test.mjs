import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCodesigningIdentities,
  signingIdentityPreflight
} from '../scripts/macos-signing-identities.mjs';

const duplicateIdentityOutput = `
  1) 1dfd72aaa84f60257e4459b2d242d1651847d902 "Developer ID Application: Example Developer (ABCDE12345)"
  2) C878C461D3C420B0A538B857375043BE43726B52 "Developer ID Application: Example Developer (ABCDE12345)"
     2 valid identities found
`;

test('macOS signing identity parser retains bounded exact names and fingerprints', () => {
  assert.deepEqual(parseCodesigningIdentities(duplicateIdentityOutput), [
    {
      fingerprint: '1DFD72AAA84F60257E4459B2D242D1651847D902',
      name: 'Developer ID Application: Example Developer (ABCDE12345)'
    },
    {
      fingerprint: 'C878C461D3C420B0A538B857375043BE43726B52',
      name: 'Developer ID Application: Example Developer (ABCDE12345)'
    }
  ]);
});

test('duplicate display names require an explicit fingerprint while a fingerprint is ready', () => {
  assert.deepEqual(
    signingIdentityPreflight('Developer ID Application: Example Developer (ABCDE12345)', duplicateIdentityOutput),
    {
      status: 'ambiguous',
      matchingFingerprints: [
        '1DFD72AAA84F60257E4459B2D242D1651847D902',
        'C878C461D3C420B0A538B857375043BE43726B52'
      ]
    }
  );
  assert.deepEqual(
    signingIdentityPreflight('1dfd72aaa84f60257e4459b2d242d1651847d902', duplicateIdentityOutput),
    { status: 'ready', matchingFingerprints: [] }
  );
});
