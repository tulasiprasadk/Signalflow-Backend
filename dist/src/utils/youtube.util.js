"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchYouTubeVideos = searchYouTubeVideos;
async function searchYouTubeVideos(query, maxResults = 2) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
        return [];
    }
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error('YouTube API error: ' + res.statusText);
    const data = await res.json();
    if (!data.items)
        return [];
    return data.items.map((item) => `https://www.youtube.com/watch?v=${item.id.videoId}`).filter(Boolean);
}
//# sourceMappingURL=youtube.util.js.map