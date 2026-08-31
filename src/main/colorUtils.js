/**
 * Calculates the text color (black or white) that provides the best contrast
 * for a given RGB background color using the YIQ formula.
 *
 * @param {string} rgbStr - An rgb color string, e.g., "rgb(255, 0, 0)"
 * @returns {string} 'black' or 'white'
 */
export function getTextColorForBackground(rgbStr) {
  if (!rgbStr) return 'white';
  
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return 'white';
  
  const r = parseInt(match[0], 10);
  const g = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  
  // Calculate relative luminance using the YIQ formula.
  // The YIQ threshold is usually 128, we use a slightly lower threshold (e.g. 135)
  // to give a bit more bias towards dark text on mid-tone backgrounds
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  return (yiq >= 135) ? 'black' : 'white';
}
