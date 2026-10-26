type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}>;

export type SaveResult =
  | { status: "saved" | "downloaded" | "cancelled" }
  | { status: "failed"; error: unknown };

// Invoke directly from the user gesture, before waiting for local persistence.
export async function savePlannerFile(
  data: unknown,
  filename: string,
  fallback: () => void,
  host: { showSaveFilePicker?: SavePicker } = window as Window & {
    showSaveFilePicker?: SavePicker;
  },
): Promise<SaveResult> {
  try {
    if (!host.showSaveFilePicker) {
      fallback();
      return { status: "downloaded" };
    }
    let handle;
    try {
      handle = await host.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Planner file",
            accept: { "application/json": [".json"] },
          },
        ],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return { status: "cancelled" };
      throw error;
    }
    const writable = await handle.createWritable();
    await writable.write(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
    );
    await writable.close();
    return { status: "saved" };
  } catch (error) {
    return { status: "failed", error };
  }
}
