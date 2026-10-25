import { readFile } from "node:fs/promises";

export async function openDock(page, name) {
  if (name === "Tool settings") {
    const expand = page.getByRole("button", {
      name: "Expand writing tools",
      exact: true,
    });
    if (await expand.isVisible()) await expand.click();
  }
  const trigger = page.getByRole("button", { name, exact: true });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
}

// Preserve the caller's open panel when inspecting editable backup data.
export async function downloadBackup(page) {
  const active = page.locator('.dock-launcher[aria-expanded="true"]');
  const previous = (await active.count())
    ? await active.getAttribute("aria-label")
    : null;
  await openDock(page, "Files");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  const result = JSON.parse(
    await readFile(await (await downloading).path(), "utf8"),
  );
  await page.getByRole("button", { name: "Close Files", exact: true }).click();
  if (previous && previous !== "Files") await openDock(page, previous);
  return result;
}
