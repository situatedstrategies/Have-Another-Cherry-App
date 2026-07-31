export async function hashString(str: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(str.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Derive an AES-GCM key from a password (e.g. group invite code)
async function getEncryptionKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("have-another-cherry-salt"), // static salt for this app
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data: any, password: string): Promise<string> {
  const key = await getEncryptionKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encoded = enc.encode(JSON.stringify(data));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoded
  );
  
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  
  return ivBase64 + ":" + cipherBase64;
}

export async function decryptData(encryptedStr: string, password: string): Promise<any> {
  try {
    const parts = encryptedStr.split(':');
    if (parts.length !== 2) return null;
    
    const iv = new Uint8Array(atob(parts[0]).split('').map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(parts[1]).split('').map(c => c.charCodeAt(0)));
    
    const key = await getEncryptionKey(password);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch (e) {
    console.error("Decryption failed", e);
    return null;
  }
}
