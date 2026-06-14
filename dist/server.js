#!/usr/bin/env tsx
/**
 * FryGovernance Deployment Server
 *
 * Local Express server that serves a web page for deploying FryGovernance
 * using Pera Wallet for transaction signing.
 *
 * Usage: npx tsx src/server.ts [--port 3333]
 */
import express from "express";
import { program } from "commander";
import algosdk from "algosdk";
import { readFile } from "fs/promises";
import { readFileSync } from "fs";
import https from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// =============================================================================
// Configuration
// =============================================================================
const EXPECTED_DEPLOYER = "E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE";
const FRY_ASA_ID = "2485314946"; // String for JSON safety with large numbers
const METHOD_SELECTOR = [0x24, 0x0d, 0x2f, 0x67]; // create(uint64)void
const STATE_SCHEMA = {
    numGlobalInts: 5,
    numGlobalByteSlices: 1,
    numLocalInts: 0,
    numLocalByteSlices: 0,
};
const ALGOD_ENDPOINTS = {
    testnet: "https://testnet-api.4160.nodely.dev",
    mainnet: "https://mainnet-api.4160.nodely.dev",
};
// Path to TEAL artifacts (relative to this file)
const ARTIFACTS_DIR = join(__dirname, "..", "..", "..", "smart_contracts", "fry_governance", "artifacts");
const ARC56_PATH = join(ARTIFACTS_DIR, "FryGovernance.arc56.json");
// =============================================================================
// Logging
// =============================================================================
function log(message, level = "info") {
    const timestamp = new Date().toISOString();
    const colors = {
        info: "\x1b[36m", // Cyan
        error: "\x1b[31m", // Red
        success: "\x1b[32m", // Green
        warn: "\x1b[33m", // Yellow
    };
    const reset = "\x1b[0m";
    const prefix = { info: "INFO", error: "ERROR", success: "OK", warn: "WARN" };
    console.log(`${colors[level]}[${timestamp}] [${prefix[level]}]${reset} ${message}`);
}
// =============================================================================
// Algod Client
// =============================================================================
function getAlgodClient(network) {
    const endpoint = ALGOD_ENDPOINTS[network];
    if (!endpoint) {
        throw new Error(`Unknown network: ${network}`);
    }
    return new algosdk.Algodv2("", endpoint, "");
}
async function handleConfig(_req, res) {
    log("GET /api/config");
    res.json({
        expectedDeployer: EXPECTED_DEPLOYER,
        fryAsaId: FRY_ASA_ID,
        methodSelector: METHOD_SELECTOR,
        stateSchema: STATE_SCHEMA,
        algodEndpoints: ALGOD_ENDPOINTS,
    });
}
async function handleAbi(_req, res) {
    log("GET /api/abi");
    try {
        const arc56Spec = await readFile(ARC56_PATH, "utf-8");
        res.type("application/json").send(arc56Spec);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to read ARC56 spec: ${message}`, "error");
        res.status(500).json({ error: true, message: `Failed to read ABI: ${message}` });
    }
}
async function handleCompileTeal(req, res) {
    const { network } = req.body;
    log(`POST /api/compile-teal (network: ${network})`);
    // Validate network
    if (network !== "testnet" && network !== "mainnet") {
        res.status(400).json({ error: true, message: "Invalid network. Must be 'testnet' or 'mainnet'." });
        return;
    }
    try {
        // Read TEAL files
        const approvalPath = join(ARTIFACTS_DIR, "FryGovernance.approval.teal");
        const clearPath = join(ARTIFACTS_DIR, "FryGovernance.clear.teal");
        log(`Reading TEAL from: ${ARTIFACTS_DIR}`);
        const approvalTeal = await readFile(approvalPath, "utf-8");
        const clearTeal = await readFile(clearPath, "utf-8");
        log(`Approval TEAL: ${approvalTeal.length} bytes source`);
        log(`Clear TEAL: ${clearTeal.length} bytes source`);
        // Compile via algod
        const client = getAlgodClient(network);
        log("Compiling approval program...");
        const approvalResult = await client.compile(approvalTeal).do();
        const approvalProgram = approvalResult.result; // Already base64
        log("Compiling clear program...");
        const clearResult = await client.compile(clearTeal).do();
        const clearProgram = clearResult.result; // Already base64
        // Calculate compiled sizes
        const approvalBytes = Buffer.from(approvalProgram, "base64");
        const clearBytes = Buffer.from(clearProgram, "base64");
        log(`Compiled approval: ${approvalBytes.length} bytes`);
        log(`Compiled clear: ${clearBytes.length} bytes`);
        res.json({
            approvalProgram,
            clearProgram,
            approvalSize: approvalBytes.length,
            clearSize: clearBytes.length,
        });
        log("TEAL compilation successful", "success");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Compilation failed: ${message}`, "error");
        res.status(500).json({ error: true, message: `Compilation failed: ${message}` });
    }
}
async function handleSubmitSigned(req, res) {
    const { network, signedTxn } = req.body;
    log(`POST /api/submit-signed (network: ${network})`);
    // Validate network
    if (network !== "testnet" && network !== "mainnet") {
        res.status(400).json({ error: true, message: "Invalid network. Must be 'testnet' or 'mainnet'." });
        return;
    }
    if (!signedTxn) {
        res.status(400).json({ error: true, message: "Missing signedTxn parameter." });
        return;
    }
    try {
        // Decode signed transaction
        const signedTxnBytes = Buffer.from(signedTxn, "base64");
        log(`Signed txn size: ${signedTxnBytes.length} bytes`);
        // Submit to algod
        const client = getAlgodClient(network);
        log("Submitting transaction...");
        const sendResult = await client.sendRawTransaction(signedTxnBytes).do();
        const txId = sendResult.txid;
        log(`Transaction submitted: ${txId}`);
        // Wait for confirmation
        log("Waiting for confirmation...");
        const confirmedTxn = await algosdk.waitForConfirmation(client, txId, 10);
        // Convert BigInt to Number for JSON serialization (algosdk v3.x returns BigInt)
        const appId = Number(confirmedTxn.applicationIndex ?? 0);
        const confirmedRound = Number(confirmedTxn.confirmedRound ?? 0);
        log(`Transaction confirmed in round ${confirmedRound}`, "success");
        log(`App ID: ${appId}`, "success");
        res.json({
            txId,
            appId,
            confirmedRound,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Submission failed: ${message}`, "error");
        res.status(500).json({ error: true, message: `Submission failed: ${message}` });
    }
}
// =============================================================================
// Server Setup
// =============================================================================
function createServer(port) {
    const app = express();
    // Fix BigInt serialization for all JSON responses (algosdk v3.x returns BigInt)
    // This makes every res.json() call BigInt-safe globally
    app.set('json replacer', (_key, value) => typeof value === 'bigint' ? Number(value) : value);
    // Middleware
    app.use(express.json());
    // Serve static files from public/
    const publicDir = join(__dirname, "public");
    app.use(express.static(publicDir));
    // API routes
    app.get("/api/config", (req, res) => {
        handleConfig(req, res).catch((err) => {
            log(`Error in /api/config: ${err}`, "error");
            res.status(500).json({ error: true, message: String(err) });
        });
    });
    app.get("/api/abi", (req, res) => {
        handleAbi(req, res).catch((err) => {
            log(`Error in /api/abi: ${err}`, "error");
            res.status(500).json({ error: true, message: String(err) });
        });
    });
    app.post("/api/compile-teal", (req, res) => {
        handleCompileTeal(req, res).catch((err) => {
            log(`Error in /api/compile-teal: ${err}`, "error");
            res.status(500).json({ error: true, message: String(err) });
        });
    });
    app.post("/api/submit-signed", (req, res) => {
        handleSubmitSigned(req, res).catch((err) => {
            log(`Error in /api/submit-signed: ${err}`, "error");
            res.status(500).json({ error: true, message: String(err) });
        });
    });
    // Load SSL certificates
    const certDir = join(__dirname, "..", "certs");
    const httpsOptions = {
        key: readFileSync(join(certDir, "key.pem")),
        cert: readFileSync(join(certDir, "cert.pem")),
    };
    // Bind to all interfaces (LAN accessible)
    const HOST = "0.0.0.0";
    // Create HTTPS server
    const server = https.createServer(httpsOptions, app);
    server.listen(port, HOST, () => {
        console.log("");
        console.log("=".repeat(60));
        console.log("  FryGovernance Deployment Server (HTTPS)");
        console.log("=".repeat(60));
        console.log("");
        console.log(`  URL:      https://192.168.1.169:${port}`);
        console.log(`  Deployer: ${EXPECTED_DEPLOYER}`);
        console.log(`  FRY ASA:  ${FRY_ASA_ID}`);
        console.log("");
        console.log("  NOTE: Browser will show security warning (self-signed cert)");
        console.log("        Click 'Advanced' → 'Proceed' to continue");
        console.log("");
        console.log("=".repeat(60));
        console.log("");
    });
}
// =============================================================================
// CLI
// =============================================================================
program
    .name("wc-signer")
    .description("Local server for signing Algorand transactions with Pera Wallet")
    .option("-p, --port <number>", "Port to listen on", "3333")
    .action((options) => {
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        console.error("Invalid port number");
        process.exit(1);
    }
    createServer(port);
});
program.parse();
