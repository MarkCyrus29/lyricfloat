export const JUNK_TERMS = [
  'official video',
  'official music video',
  'official lyric video',
  'official audio',
  'lyric video',
  'lyrics',
  'audio',
  'hd',
  '4k',
  'explicit',
  'visualizer',
  'mv',
  'full video',
  'official',
  'live'
];

/**
 * Cleans up media titles by removing common junk phrases like "(Official Video)".
 * 
 * @param {string} title - The original track title
 * @param {string} artist - The original artist
 * @returns {{ cleanTitle: string, cleanArtist: string }}
 */
export function cleanTitleInfo(title, artist) {
  let cleanTitle = title || '';
  let cleanArtist = artist || '';

  const cleanString = (str) => {
    let result = str;
    
    // Remove terms within brackets or parentheses
    for (const term of JUNK_TERMS) {
      // Matches (term), [term], - term
      const regex = new RegExp(`[\\(\\[\\-]?\\s*\\b${term}\\b\\s*[\\)\\]]?`, 'gi');
      result = result.replace(regex, '');
    }

    // Clean up empty brackets or loose hyphens/pipes
    result = result.replace(/\(\s*\)/g, '');
    result = result.replace(/\[\s*\]/g, '');
    result = result.replace(/[-|•]+\s*$/, '');
    result = result.replace(/^\s*[-|•]+/, '');
    
    return result.trim();
  };

  cleanTitle = cleanString(cleanTitle);
  cleanArtist = cleanString(cleanArtist);

  return { cleanTitle, cleanArtist };
}
