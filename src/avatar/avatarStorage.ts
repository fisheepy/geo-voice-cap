const DATABASE_NAME = "mira-avatar-library";
const STORE_NAME = "avatars";
const ACTIVE_AVATAR_KEY = "active";
const MAX_AVATAR_BYTES = 64 * 1024 * 1024;

export type StoredAvatar = {
  blob: Blob;
  name: string;
  size: number;
  specification: "VRM 0.x" | "VRM 1.0";
  savedAt: number;
};

type VrmJson = {
  extensions?: {
    VRM?: { meta?: { title?: string } };
    VRMC_vrm?: { meta?: { name?: string } };
  };
  extensionsUsed?: string[];
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开角色库。"));
  });
}

async function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("角色存储失败。"));
      transaction.onabort = () => reject(transaction.error ?? new Error("角色存储被中断。"));
    });
  } finally {
    database.close();
  }
}

export async function validateVrmFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".vrm")) {
    throw new Error("请选择 .vrm 角色文件。");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("角色文件超过 64 MB，请先在 Blender 中优化后再导入。");
  }
  if (file.size < 20) throw new Error("这个 VRM 文件不完整。");

  const header = new DataView(await file.slice(0, 20).arrayBuffer());
  const magic = header.getUint32(0, true);
  const version = header.getUint32(4, true);
  const declaredLength = header.getUint32(8, true);
  const jsonLength = header.getUint32(12, true);
  const jsonChunkType = header.getUint32(16, true);
  if (magic !== 0x46546c67 || version !== 2 || declaredLength !== file.size || jsonChunkType !== 0x4e4f534a) {
    throw new Error("这不是有效的 VRM/GLB 2.0 角色文件。");
  }
  if (jsonLength <= 0 || jsonLength > file.size - 20) throw new Error("这个 VRM 文件的场景描述无效。");

  const jsonText = new TextDecoder().decode(await file.slice(20, 20 + jsonLength).arrayBuffer()).trimEnd();
  let document: VrmJson;
  try {
    document = JSON.parse(jsonText) as VrmJson;
  } catch {
    throw new Error("这个 VRM 文件包含无法读取的模型数据。");
  }

  const used = new Set(document.extensionsUsed ?? []);
  const isVrm1 = used.has("VRMC_vrm") || Boolean(document.extensions?.VRMC_vrm);
  const isVrm0 = used.has("VRM") || Boolean(document.extensions?.VRM);
  if (!isVrm1 && !isVrm0) throw new Error("该文件是 GLB，但不包含 VRM 角色定义。");

  return {
    specification: (isVrm1 ? "VRM 1.0" : "VRM 0.x") as StoredAvatar["specification"],
    modelName: document.extensions?.VRMC_vrm?.meta?.name ?? document.extensions?.VRM?.meta?.title ?? file.name.replace(/\.vrm$/i, ""),
  };
}

export async function saveAvatar(file: File, specification: StoredAvatar["specification"], modelName: string) {
  const record: StoredAvatar = {
    blob: file,
    name: modelName.trim() || file.name.replace(/\.vrm$/i, ""),
    size: file.size,
    specification,
    savedAt: Date.now(),
  };
  await runTransaction("readwrite", (store) => store.put(record, ACTIVE_AVATAR_KEY));
  return record;
}

export async function loadAvatar() {
  return (await runTransaction("readonly", (store) => store.get(ACTIVE_AVATAR_KEY))) as StoredAvatar | undefined;
}

export async function removeAvatar() {
  await runTransaction("readwrite", (store) => store.delete(ACTIVE_AVATAR_KEY));
}

export function formatAvatarSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
