/**
 * Checks if a file path is likely a translatable text file.
 */
export function isTranslatable(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  const translatableExtensions = [
    'json', 'lang', 'txt', 'mcfunction', 'js', 'ts',
    'material', 'entity', 'behavior', 'animation',
    'animation_controller', 'item', 'block', 'recipe', 'ui'
  ];
  return !!ext && translatableExtensions.includes(ext);
}

/**
 * Checks if a file is a known binary type to skip entirely.
 */
export function isBinary(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  const binaryExtensions = [
    'png', 'jpg', 'jpeg', 'ogg', 'wav', 'mp3', 'ttf',
    'bin', 'dll', 'exe', 'dat', 'fsb'
  ];
  return !!ext && binaryExtensions.includes(ext);
}

/**
 * Attempts to detect and read the content of a file as a string.
 */
export async function readFileAsText(data: Uint8Array): Promise<{ content: string; encoding: string }> {
  // Simple encoding detection
  if (data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) {
    return { content: new TextDecoder('utf-8').decode(data), encoding: 'UTF-8 with BOM' };
  }

  if (data[0] === 0xFE && data[1] === 0xFF) {
    return { content: new TextDecoder('utf-16be').decode(data), encoding: 'UTF-16BE' };
  }

  if (data[0] === 0xFF && data[1] === 0xFE) {
    return { content: new TextDecoder('utf-16le').decode(data), encoding: 'UTF-16LE' };
  }

  // Fallback to UTF-8
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return { content: decoder.decode(data), encoding: 'UTF-8' };
  } catch (e) {
    // If UTF-8 fails, try ASCII/Latin-1
    return { content: new TextDecoder('windows-1252').decode(data), encoding: 'Windows-1252' };
  }
}
