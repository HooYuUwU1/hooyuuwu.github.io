import JSZip from 'jszip';

export async function extractZip(file: File | Blob): Promise<Map<string, Uint8Array>> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  const files = new Map<string, Uint8Array>();

  for (const [path, zipEntry] of Object.entries(contents.files)) {
    if (!zipEntry.dir) {
      const data = await zipEntry.async('uint8array');
      files.set(path, data);
    }
  }

  return files;
}

export async function createZip(files: Map<string, Uint8Array | string>): Promise<Blob> {
  const zip = new JSZip();

  for (const [path, content] of files.entries()) {
    zip.file(path, content);
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}
