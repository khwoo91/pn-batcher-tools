/**
 * Pure functions for renaming files.
 */

export function applyReplace(name: string, find: string, replace: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot !== -1 ? name.substring(0, lastDot) : name;
  const ext = lastDot !== -1 ? name.substring(lastDot) : "";
  const newBase = base.split(find).join(replace);
  return newBase + ext;
}

export function applyPrefix(name: string, prefix: string): string {
  return prefix + name;
}

export function applySuffix(name: string, suffix: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot !== -1 ? name.substring(0, lastDot) : name;
  const ext = lastDot !== -1 ? name.substring(lastDot) : "";
  return base + suffix + ext;
}

export function applyRemove(name: string, start: number, len: number): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot !== -1 ? name.substring(0, lastDot) : name;
  const ext = lastDot !== -1 ? name.substring(lastDot) : "";

  const startIdx = start - 1; // 1-based index to 0-based
  if (startIdx < 0 || startIdx >= base.length) return name;
  const newBase = base.substring(0, startIdx) + base.substring(startIdx + len);
  return newBase + ext;
}

export function applyKeepNumbers(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot !== -1 ? name.substring(0, lastDot) : name;
  const ext = lastDot !== -1 ? name.substring(lastDot) : "";

  const newBase = base.replace(/[^0-9]/g, "");
  return newBase + ext;
}

export function applyRemoveBrackets(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot !== -1 ? name.substring(0, lastDot) : name;
  const ext = lastDot !== -1 ? name.substring(lastDot) : "";

  const newBase = base
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\{[^}]*\}/g, "")
    .trim();
  return newBase + ext;
}

export function applyNumbering(
  name: string,
  num: number,
  digits: number,
  position: "prefix" | "suffix",
): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot !== -1 ? name.substring(0, lastDot) : name;
  const ext = lastDot !== -1 ? name.substring(lastDot) : "";

  const formattedNum = String(num).padStart(digits, "0");
  if (position === "prefix") {
    return formattedNum + base + ext;
  } else {
    return base + formattedNum + ext;
  }
}

export function applyExtension(
  name: string,
  mode: "keep" | "remove" | "change",
  newExt: string,
): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot !== -1 ? name.substring(0, lastDot) : name;

  if (mode === "remove") {
    return base;
  } else if (mode === "change") {
    const formattedExt = newExt.startsWith(".") ? newExt : `.${newExt}`;
    return base + formattedExt;
  }
  return name;
}

export function applyClearFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot !== -1 ? name.substring(lastDot) : "";
  return ext;
}
