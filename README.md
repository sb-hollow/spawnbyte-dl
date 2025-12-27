# SpawnByte DL

A modern, dark-themed YouTube downloader with a sleek web interface. Download videos and audio at any available quality with optional time trimming.

![SpawnByte DL](https://img.shields.io/badge/SpawnByte-DL-blue?style=for-the-badge)

## Features

- **Video Downloads** - Download at the highest available quality (up to 4K)
- **Audio Extraction** - Extract audio as MP3 (up to 320kbps)
- **Smart Quality Detection** - Only shows qualities actually available for the video
- **Time Trimming** - Download specific portions with start/end timestamps
- **Modern Dark UI** - Clean, intuitive interface
- **Portable Build** - Self-contained Windows executable (no installation required)

## Screenshots

*Coming soon*

## Quick Start

### Portable Version (Windows)

1. Download the latest release from [Releases](../../releases)
2. Extract the zip
3. Run `SpawnByteDL.exe`
4. Browser opens automatically

### Development

**Prerequisites:**
- Node.js 18+
- yt-dlp
- ffmpeg

```bash
# Clone the repository
git clone https://github.com/spawnbyte/spawnbyte-dl.git
cd spawnbyte-dl

# Install dependencies
npm install

# Start the server
npm start
```

Open http://localhost:3000 in your browser.

### Building Portable Version

```bash
# Install pkg globally
npm install -g pkg

# Build for Windows
npm run build
```

The executable will be in the `dist/` folder. You'll need to add `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` to `dist/bin/`.

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** Vanilla HTML/CSS/JS
- **Download Engine:** yt-dlp
- **Media Processing:** ffmpeg

## License

This project is licensed under CC BY-NC 4.0 - free for non-commercial use.

See the [LICENSE](LICENSE) file for details.

---

Made with love by SpawnByte LLC
