/** Native OS file dialogs for scheme save/load (Chromium File System Access API). */

const SCHEME_ACCEPT: Record<string, string[]> = {
  'application/json': ['.json', '.mrv.json'],
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
};

type OpenFilePickerOptions = {
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
};

type FileSystemWritable = {
  write: (data: string | BufferSource | Blob) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<FileSystemWritable>;
};

function getWindowWithPicker(): Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
} {
  return window;
}

/** Save text via the OS save dialog; falls back to a browser download. */
export async function saveTextWithDialog(
  text: string,
  suggestedName: string,
  mimeType = 'application/json',
): Promise<string> {
  const w = getWindowWithPicker();
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'MRV scheme', accept: SCHEME_ACCEPT }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return handle.name || suggestedName;
    } catch (err) {
      // User cancelled the dialog.
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // Fall through to download if the picker is unavailable/blocked.
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return suggestedName;
}

/** Open a text/JSON file via the OS open dialog; falls back to <input type="file">. */
export async function openTextFileWithDialog(
  accept = '.json,.mrv.json,application/json',
): Promise<{ name: string; text: string } | null> {
  const w = getWindowWithPicker();
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'MRV scheme', accept: SCHEME_ACCEPT }],
      });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text() };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      // Fall through to input element.
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ name: file.name, text: await file.text() });
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

export function isUserCancelled(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
