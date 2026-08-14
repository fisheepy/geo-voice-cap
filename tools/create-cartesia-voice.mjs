import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import process from "node:process";

const API_VERSION = "2026-03-01";
const MIME_TYPES = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

function usage() {
  console.log(`Create an authorized Cartesia voice clone for the avatar companion.

Usage:
  npm run voice:create:cartesia -- --clip <audio.wav> --confirm-rights [options]

Options:
  --persona <kai|mira>   Target persona (default: kai)
  --name <name>          Voice name (default: Kai - Gentle Young Male)
  --description <text>   Private voice description
  --write-env            Save the returned voice ID to .env.local
  --dry-run              Validate the file and arguments without uploading
  --help                 Show this help

Required environment:
  CARTESIA_API_KEY=sk_car_...
`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--confirm-rights" || token === "--write-env" || token === "--dry-run" || token === "--help") {
      args[token.slice(2)] = true;
      continue;
    }
    if (!token.startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`Invalid argument: ${token}`);
    }
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function updateEnvFile(key, value) {
  const path = resolve(".env.local");
  let contents = "";
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}${contents.trim() ? "\n" : ""}${line}\n`;
  await writeFile(path, next, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.clip) throw new Error("Missing --clip <audio file>.");

  const persona = String(args.persona ?? "kai").toLowerCase();
  if (persona !== "kai" && persona !== "mira") throw new Error("--persona must be kai or mira.");
  const clipPath = resolve(args.clip);
  const extension = extname(clipPath).toLowerCase();
  const mimeType = MIME_TYPES[extension];
  if (!mimeType) throw new Error(`Unsupported audio format: ${extension || "unknown"}.`);
  const clip = await readFile(clipPath);
  if (!clip.byteLength) throw new Error("The audio clip is empty.");
  if (clip.byteLength > 25 * 1024 * 1024) throw new Error("The audio clip must be smaller than 25 MB.");

  const name = args.name ?? (persona === "kai" ? "Kai - Gentle Young Male" : "Mira - Warm Young Female");
  const description = args.description ?? "Authorized private character voice for the avatar companion MVP.";
  if (args["dry-run"]) {
    console.log(`Validated ${basename(clipPath)} (${clip.byteLength} bytes) for ${persona}. No upload was made.`);
    return;
  }
  if (!args["confirm-rights"]) {
    throw new Error("Add --confirm-rights only after the adult speaker has explicitly authorized this voice clone.");
  }

  try {
    process.loadEnvFile?.(".env.local");
  } catch {
    // Environment variables may be supplied by the shell instead.
  }
  const apiKey = process.env.CARTESIA_API_KEY?.trim();
  if (!apiKey) throw new Error("CARTESIA_API_KEY is not configured.");

  const form = new FormData();
  form.set("clip", new Blob([clip], { type: mimeType }), basename(clipPath));
  form.set("name", name);
  form.set("description", description);
  form.set("language", "zh");

  const response = await fetch("https://api.cartesia.ai/voices/clone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Cartesia-Version": API_VERSION,
    },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.id !== "string") {
    throw new Error(body.message ?? body.error?.message ?? `Cartesia voice creation failed (${response.status}).`);
  }

  const envKey = persona === "kai" ? "CARTESIA_KAI_VOICE_ID" : "CARTESIA_MIRA_VOICE_ID";
  if (args["write-env"]) await updateEnvFile(envKey, body.id);
  console.log(`Created ${name}: ${body.id}`);
  console.log(args["write-env"] ? `Saved ${envKey} to .env.local.` : `Set ${envKey}=${body.id} to enable it.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
