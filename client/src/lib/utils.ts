import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Encodes a name by keeping the first letter and removing vowels from the rest
 * Example: "VISHAWJEET" -> "VSHWJT", "ANKUSH" -> "ANKSH"
 */
export function encodeName(name: string | null | undefined): string {
  if (!name) return "";
  
  const trimmed = name.trim();
  if (trimmed.length === 0) return "";
  
  // Keep first letter, remove vowels from rest
  const firstLetter = trimmed[0];
  const rest = trimmed.slice(1);
  const encodedRest = rest.replace(/[aeiouAEIOU]/g, "");
  
  return firstLetter + encodedRest;
}

/**
 * Encodes a full name (first name + last name) by encoding each part separately
 * Example: "VISHAWJEET KUMA" -> "VSHWJT KM"
 */
export function encodeFullName(firstName: string | null | undefined, lastName?: string | null | undefined): string {
  const encodedFirst = encodeName(firstName);
  const encodedLast = encodeName(lastName);
  
  if (encodedLast) {
    return `${encodedFirst} ${encodedLast}`;
  }
  return encodedFirst;
}
