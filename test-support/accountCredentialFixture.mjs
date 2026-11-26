// Structurally valid private record for storage-only tests, not a real password.
export const accountCredentialFixture = Object.freeze({version:'argon2id-v1',hash:`$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'A'.repeat(43)}`});
