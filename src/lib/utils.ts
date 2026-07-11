/** 通用工具函数 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn
 *
 * @param ...inputs - 
 * @returns 
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
