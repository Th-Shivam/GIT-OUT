import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export const MODEL_DIRECTORY = `${FileSystem.documentDirectory}models/`;

export interface StoredModel {
  name: string;
  uri: string;
  size?: number;
}

function safeModelName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function findStoredModel(): Promise<StoredModel | null> {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  try {
    const names = await FileSystem.readDirectoryAsync(MODEL_DIRECTORY);
    const modelName = names.find((name) => name.toLowerCase().endsWith('.gguf'));
    if (!modelName) {
      return null;
    }

    const uri = `${MODEL_DIRECTORY}${modelName}`;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? { name: modelName, uri, size: info.size } : null;
  } catch {
    return null;
  }
}

export async function pickAndStoreModel(): Promise<StoredModel | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset.name.toLowerCase().endsWith('.gguf')) {
    throw new Error('Choose a GGUF model file.');
  }

  await FileSystem.makeDirectoryAsync(MODEL_DIRECTORY, { intermediates: true });
  const name = safeModelName(asset.name);
  const uri = `${MODEL_DIRECTORY}${name}`;
  const existing = await FileSystem.getInfoAsync(uri);
  if (existing.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: asset.uri, to: uri });

  return { name, uri, size: asset.size };
}
