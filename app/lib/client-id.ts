type ClientCryptoSource = {
  randomUUID?: () => string;
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

function browserCrypto(): ClientCryptoSource {
  return {
    randomUUID: globalThis.crypto.randomUUID?.bind(globalThis.crypto),
    getRandomValues: (array) => globalThis.crypto.getRandomValues(array),
  };
}

export function createClientId(prefix: string, cryptoSource = browserCrypto()) {
  let token = "";

  try {
    token = cryptoSource.randomUUID?.().replaceAll("-", "").slice(0, 8) ?? "";
  } catch {
    token = "";
  }

  if (!token) {
    const bytes = cryptoSource.getRandomValues(new Uint8Array(4));
    token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `${prefix}${token}`;
}
