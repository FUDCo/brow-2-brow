import { generateKeyPairFromSeed, marshalPrivateKey, marshalPublicKey } from '@libp2p/crypto/keys';
import { peerIdFromKeys } from '@libp2p/peer-id';

export function toHex(arr) {
  let result = '';
  for (let i = 0; i < arr.length; i++) {
    const hex = arr[i].toString(16);
    result += hex.length === 1 ? `0${hex}` : hex;
  }
  return result;
}

export function fromHex(str) {
  const len = str.length;
  const resultLen = len / 2;
  const bytes = new Uint8Array(resultLen);
  let inIdx = 0;
  let outIdx = 0;
  while (outIdx < resultLen) {
    var digits = str.slice(inIdx, inIdx + 2);
    bytes[outIdx++] = parseInt(digits, 16);
    inIdx += 2;
  }
  return bytes;
};

// seed: 1 peerId: 12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
// seed: 2 peerId: 12D3KooWH3uVF6wv47WnArKHk5p6cvgCJEb74UTmxztmQDc298L3
// seed: 3 peerId: 12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKyTkoWBDWez9kSCVe2Xo
// seed: 4 peerId: 12D3KooWLJtG8fd2hkQzTn96MrLvThmnNQjTUFZwGEsLRz5EmSzc
// seed: 5 peerId: 12D3KooWSHj3RRbBjD15g6wekV8y3mm57Pobmps2g2WJm6F67Lay

export async function generatePeerId(localId) {
  let seed;
  if (localId < 1 || 255 < localId) {
    seed = globalThis.crypto.getRandomValues(new Uint8Array(32));
  } else {
    seed = new Uint8Array(32);
    seed[0] = localId;
  }
  const keyPair = await generateKeyPairFromSeed('Ed25519', seed);
  const peerId = peerIdFromKeys(marshalPublicKey(keyPair.public), marshalPrivateKey(keyPair));
  return peerId;
}
