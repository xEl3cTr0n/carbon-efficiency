// Single switch to show/hide the marketing demo-video tab without
// touching any other code. Flip to false (or delete the "video" tab
// block in App.jsx entirely) to remove it.
export const SHOW_VIDEO_TAB = true

// Set VITE_DEMO_VIDEO_URL once the demo video is hosted somewhere
// (YouTube/Vimeo watch link, or a direct .mp4 URL). Until then the
// tab shows an intentional "coming soon" placeholder instead of
// looking broken.
export const DEMO_VIDEO_URL = import.meta.env.VITE_DEMO_VIDEO_URL || null
