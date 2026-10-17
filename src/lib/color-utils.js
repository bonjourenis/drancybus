/**
 * Determines if a hex color is light (should use dark text) or dark (should use light text)
 * Uses relative luminance calculation based on WCAG guidelines
 * @param {string} hexColor - Hex color string (e.g., "#E4B4D3" or "E4B4D3")
 * @returns {boolean} True if the color is light, false if dark
 */
export function isLightColor(hexColor) {
  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance using sRGB formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return true if color is light (luminance > 0.5)
  return luminance > 0.5;
}

/**
 * Returns the appropriate text color (black or white) for a given background color
 * @param {string} hexColor - Hex color string
 * @returns {string} "#000000" for light backgrounds, "#FFFFFF" for dark backgrounds
 */
export function getContrastTextColor(hexColor) {
  return isLightColor(hexColor) ? '#000000' : '#FFFFFF';
}
