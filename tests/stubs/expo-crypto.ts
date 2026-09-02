import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto';

// Same contract as expo-crypto: a v4 uuid, and a hex SHA-1 of a string. The
// deterministic-id test depends on the hash being real, so it uses node's.
export const CryptoDigestAlgorithm = { SHA1: 'SHA-1', SHA256: 'SHA-256' } as const;

export function randomUUID(): string {
  return nodeRandomUUID();
}

export async function digestStringAsync(algorithm: string, data: string): Promise<string> {
  const node = algorithm === 'SHA-256' ? 'sha256' : 'sha1';
  return createHash(node).update(data, 'utf8').digest('hex');
}

export default { CryptoDigestAlgorithm, randomUUID, digestStringAsync };
