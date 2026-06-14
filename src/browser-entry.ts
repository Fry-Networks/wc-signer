// Browser entry point - bundled by esbuild for client-side use
// Buffer polyfill MUST be first - WalletConnect depends on it
import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;
(window as any).Buffer = Buffer;

import * as PeraModule from "@perawallet/connect";
import algosdk from "algosdk";
import { sha512_256 } from "js-sha512";

// Handle potential bundler wrapping (.default) or direct named export
const PeraWalletConnect = (PeraModule as any).default?.PeraWalletConnect
  || (PeraModule as any).default
  || (PeraModule as any).PeraWalletConnect
  || PeraModule;

// Expose as globals for browser scripts
(window as any).PeraWalletConnect = PeraWalletConnect;
(window as any).algosdk = algosdk;
(window as any).sha512_256 = sha512_256;

// Debug logging for verification
console.log("[bundle] PeraWalletConnect type:", typeof PeraWalletConnect);
console.log("[bundle] algosdk type:", typeof algosdk);
console.log("[bundle] sha512_256 type:", typeof sha512_256);
