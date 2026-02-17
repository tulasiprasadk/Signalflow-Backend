// YouTube video search utility
// Usage: await searchYouTubeVideos(query)

export async function searchYouTubeVideos(query: string, maxResults = 2): Promise<string[]> {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    // No API key — return empty array so caller can provide fallbacks.
    return [];
  }
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('YouTube API error: ' + res.statusText);
  const data = await res.json() as { items?: any[] };
  if (!data.items) return [];
  return data.items.map((item: any) => `https://www.youtube.com/watch?v=${item.id.videoId}`).filter(Boolean);
}
