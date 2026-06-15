import { ko } from "./ko";
import { en } from "./en";

export const locales = { ko, en };
export type LocaleType = typeof ko;
export type Language = "ko" | "en";
