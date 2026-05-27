import { decrypt, encrypt } from './encryption.util';

describe('encryption util', () => {
  const secret = 'top-secret-key-for-tests';

  it('encrypts and decrypts back to the original payload', () => {
    const payload = JSON.stringify({ id: 'u1', role: 'admin' });

    const encrypted = encrypt(payload, secret);
    const decrypted = decrypt(encrypted, secret);

    expect(encrypted).toContain(':');
    expect(encrypted).not.toEqual(payload);
    expect(decrypted).toEqual(payload);
  });

  it('uses a random IV so encryption output differs for same input', () => {
    const payload = 'same-payload';

    const encryptedA = encrypt(payload, secret);
    const encryptedB = encrypt(payload, secret);

    expect(encryptedA).not.toEqual(encryptedB);
    expect(decrypt(encryptedA, secret)).toEqual(payload);
    expect(decrypt(encryptedB, secret)).toEqual(payload);
  });

  it('throws when decrypting with the wrong secret', () => {
    const encrypted = encrypt('sensitive-data', secret);

    expect(() => decrypt(encrypted, 'wrong-secret')).toThrow();
  });
});
