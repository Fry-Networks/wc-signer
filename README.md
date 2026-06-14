# WalletConnect Signer for Algorand

A CLI tool that uses WalletConnect v2 to sign Algorand transactions with Pera Wallet. Designed for secure contract deployment where the deployer's mnemonic never leaves their mobile device.

## Security Model

- **No mnemonics on server**: The tool never sees, stores, or logs private keys
- **Phone-based signing**: All transaction signing happens on your mobile device
- **Review before signing**: You can inspect every transaction in Pera before approving
- **Address verification**: The tool verifies the connected wallet matches the expected deployer

## Prerequisites

- Node.js 18 or later
- Pera Wallet mobile app (iOS or Android)
- Network connectivity for WalletConnect relay

## Installation

```bash
cd tools/wc-signer
npm install
```

## Usage

### Deploy FryGovernance Contract

Deploy the contract to testnet or mainnet:

```bash
# Testnet deployment
npx tsx src/index.ts deploy --network testnet --fry-asa-id 123456789

# Mainnet deployment
npx tsx src/index.ts deploy --network mainnet --fry-asa-id 987654321

# Skip address verification (for testing with different wallets)
npx tsx src/index.ts deploy --network testnet --fry-asa-id 123456789 --skip-address-check
```

The deploy command will:
1. Display a QR code for Pera Wallet
2. Wait for you to scan and connect
3. Verify your address matches the expected deployer
4. Build the ApplicationCreate transaction
5. Send it to Pera for signing
6. Submit the signed transaction to the network
7. Wait for confirmation and display the App ID

### Sign Any Transaction

Sign an unsigned transaction from a file:

```bash
npx tsx src/index.ts sign --txn-file /path/to/unsigned.txn --network mainnet
```

The signed transaction will be saved to `/path/to/unsigned.txn.signed`.

### Test Connection

Verify WalletConnect connectivity without signing anything:

```bash
npx tsx src/index.ts test-connection --network testnet
```

## Build (Optional)

Compile TypeScript to JavaScript:

```bash
npm run build
node dist/index.js --help
```

## WalletConnect Project ID

The tool uses a public WalletConnect project ID for the relay. To use your own:

1. Create a project at https://cloud.walletconnect.com/
2. Edit `src/wc-session.ts` and replace `PROJECT_ID`

Note: The project ID is not a secret - it identifies your application to the WalletConnect relay.

## Troubleshooting

### QR Code Not Scanning

- Ensure your phone and computer are on the same network (or both have internet)
- Try the manual URI copy option displayed below the QR code
- In Pera: Settings → WalletConnect → paste URI

### Connection Timeout

The tool waits 2 minutes for a wallet connection. If you need more time:
- The QR code and URI remain valid; re-run the command if it times out

### Signing Timeout

You have 60 seconds to review and approve each transaction in Pera. For complex transactions:
- Read the transaction details carefully before approving
- Re-run the command if you need more time

### "Address mismatch" Error

The tool verifies the connected address matches the expected deployer:
```
E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE
```

Use `--skip-address-check` for testing with other wallets.

### TEAL Compilation Errors

Ensure the contract artifacts exist:
```bash
ls ../../smart_contracts/fry_governance/artifacts/
# Should show FryGovernance.approval.teal and FryGovernance.clear.teal
```

### Network Issues

The tool uses Nodely public endpoints:
- Testnet: `https://testnet-api.4160.nodely.dev`
- Mainnet: `https://mainnet-api.4160.nodely.dev`

If these are unavailable, the code supports a local fallback at `http://192.168.9.2:4190`.

## Files

| File | Description |
|------|-------------|
| `src/index.ts` | CLI entry point with Commander |
| `src/wc-session.ts` | WalletConnect v2 session management |
| `src/deploy-contract.ts` | Algorand transaction builder |
| `src/utils.ts` | QR display and logging helpers |

## Security Notes

1. **Never share your mnemonic** - this tool is designed so you don't need to
2. **Verify transactions** - always review what you're signing in Pera
3. **Check addresses** - ensure you're connecting the correct wallet
4. **Network awareness** - double-check testnet vs mainnet before deploying
