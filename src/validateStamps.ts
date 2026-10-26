import { type Stamp } from "./model";

export function validateStamps(library: Stamp[]) {
  if (!Array.isArray(library) || library.length > 500)
    throw Error("Invalid stamp library (maximum 500).");
  const ids = new Set<string>();
  let count = 0;
  for (const stamp of library) {
    if (
      !stamp ||
      typeof stamp.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(stamp.id) ||
      ids.has(stamp.id) ||
      typeof stamp.name !== "string" ||
      !stamp.name.trim() ||
      stamp.name.length > 60 ||
      (stamp.hidden !== undefined && typeof stamp.hidden !== "boolean") ||
      !Array.isArray(stamp.strokes) ||
      !stamp.strokes.length ||
      stamp.strokes.length > 1000
    )
      throw Error("Invalid stamp.");
    ids.add(stamp.id);
    const seen = new Set<string>();
    for (const s of stamp.strokes) {
      if (
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        s.id.length > 100 ||
        seen.has(s.id) ||
        (s.tool !== undefined && s.tool !== "pen") ||
        typeof s.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(s.color) ||
        !Number.isFinite(s.width) ||
        s.width < 1 ||
        s.width > 6 ||
        !Array.isArray(s.points) ||
        !s.points.length
      )
        throw Error("Invalid stamp drawing.");
      seen.add(s.id);
      for (const p of s.points) {
        if (
          ++count > 500000 ||
          !p ||
          ![p.x, p.y, p.pressure].every(Number.isFinite) ||
          p.x < 0 ||
          p.x > 200 ||
          p.y < 0 ||
          p.y > 200 ||
          p.pressure < 0 ||
          p.pressure > 1
        )
          throw Error("Invalid or excessive stamp points.");
      }
    }
  }
}
