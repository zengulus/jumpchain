export async function readJsonFile<T = unknown>(file: File): Promise<T> {
  const text = await file.text();

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`Unable to parse JSON from "${file.name}": ${message}`);
  }
}

export async function readTextFile(file: File): Promise<string> {
  return file.text();
}
