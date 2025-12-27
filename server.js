const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// Determine base path (works for both dev and pkg-compiled)
const isPackaged = typeof process.pkg !== 'undefined';
const basePath = isPackaged ? path.dirname(process.execPath) : __dirname;

// Paths to bundled binaries (for portable version)
const ytdlpPath = isPackaged
    ? path.join(basePath, 'bin', 'yt-dlp.exe')
    : 'yt-dlp';
const ffmpegPath = isPackaged
    ? path.join(basePath, 'bin', 'ffmpeg.exe')
    : 'ffmpeg';

// Set ffmpeg location for yt-dlp
const ffmpegDir = isPackaged ? path.join(basePath, 'bin') : null;

// Downloads directory
const downloadsDir = path.join(basePath, 'downloads');

// Ensure downloads directory exists
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Static file serving - use basePath for packaged version
const publicPath = isPackaged ? path.join(basePath, 'public') : 'public';

app.use(cors());
app.use(express.json());
app.use(express.static(publicPath));
app.use('/downloads', express.static(downloadsDir));

// Store active downloads
const activeDownloads = new Map();

// Get video info with available formats
app.post('/api/info', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await getVideoInfo(url);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start download
app.post('/api/download', (req, res) => {
    const { url, type, quality, startTime, endTime } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const downloadId = uuidv4();
    activeDownloads.set(downloadId, { progress: 0, status: 'starting', filename: null });

    startDownload(downloadId, url, type, quality, startTime, endTime);

    res.json({ downloadId });
});

// Get download progress (SSE)
app.get('/api/progress/:id', (req, res) => {
    const { id } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = () => {
        const download = activeDownloads.get(id);
        if (download) {
            res.write(`data: ${JSON.stringify(download)}\n\n`);

            if (download.status === 'complete' || download.status === 'error') {
                res.end();
                return;
            }
        }
        setTimeout(sendProgress, 500);
    };

    sendProgress();

    req.on('close', () => {
        // Client disconnected
    });
});

// Get video info using yt-dlp
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const args = [
            '-J',  // JSON output
            '--no-playlist',
            url
        ];

        // Add ffmpeg location if packaged
        if (ffmpegDir) {
            args.unshift('--ffmpeg-location', ffmpegDir);
        }

        const ytdlp = spawn(ytdlpPath, args);
        let stdout = '';
        let stderr = '';

        ytdlp.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytdlp.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || 'Failed to get video info'));
                return;
            }

            try {
                const info = JSON.parse(stdout);

                // Extract available video qualities
                const videoFormats = new Map();
                const audioFormats = new Map();

                if (info.formats) {
                    for (const format of info.formats) {
                        // Video formats
                        if (format.vcodec && format.vcodec !== 'none' && format.height) {
                            const height = format.height;
                            const label = getQualityLabel(height);
                            if (!videoFormats.has(height) || format.filesize > videoFormats.get(height).filesize) {
                                videoFormats.set(height, {
                                    height,
                                    label,
                                    format_id: format.format_id,
                                    ext: format.ext,
                                    filesize: format.filesize || 0
                                });
                            }
                        }

                        // Audio formats
                        if (format.acodec && format.acodec !== 'none' && !format.vcodec || format.vcodec === 'none') {
                            const abr = format.abr || 0;
                            if (abr > 0 && !audioFormats.has(abr)) {
                                audioFormats.set(abr, {
                                    abr,
                                    label: `${Math.round(abr)}kbps`,
                                    format_id: format.format_id,
                                    ext: format.ext
                                });
                            }
                        }
                    }
                }

                // Sort and format available qualities
                const availableVideoQualities = Array.from(videoFormats.values())
                    .sort((a, b) => b.height - a.height)
                    .map(f => ({ value: f.height.toString(), label: f.label }));

                const availableAudioQualities = Array.from(audioFormats.values())
                    .sort((a, b) => b.abr - a.abr)
                    .map(f => ({ value: f.abr.toString(), label: f.label }));

                // If no specific audio formats, provide defaults
                if (availableAudioQualities.length === 0) {
                    availableAudioQualities.push(
                        { value: '320', label: '320kbps' },
                        { value: '256', label: '256kbps' },
                        { value: '192', label: '192kbps' },
                        { value: '128', label: '128kbps' }
                    );
                }

                resolve({
                    title: info.title,
                    thumbnail: info.thumbnail,
                    duration: info.duration,
                    channel: info.channel || info.uploader,
                    videoQualities: availableVideoQualities,
                    audioQualities: availableAudioQualities
                });
            } catch (e) {
                reject(new Error('Failed to parse video info'));
            }
        });
    });
}

function getQualityLabel(height) {
    if (height >= 2160) return '4K (2160p)';
    if (height >= 1440) return '2K (1440p)';
    if (height >= 1080) return 'Full HD (1080p)';
    if (height >= 720) return 'HD (720p)';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    return `${height}p`;
}

function startDownload(downloadId, url, type, quality, startTime, endTime) {
    // Build yt-dlp arguments
    const args = [
        '--no-playlist',
        '--newline',  // Progress on new lines
        '-o', path.join(downloadsDir, '%(title)s.%(ext)s')
    ];

    // Add ffmpeg location if packaged
    if (ffmpegDir) {
        args.unshift('--ffmpeg-location', ffmpegDir);
    }

    if (type === 'audio') {
        args.push('-x');  // Extract audio
        args.push('--audio-format', 'mp3');
        args.push('--audio-quality', quality + 'k');
    } else {
        // Video with audio - re-encode audio to AAC for compatibility
        args.push('-f', `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`);
        args.push('--merge-output-format', 'mp4');

        // Build ffmpeg post-processor args (AAC audio + optional trimming)
        const ffmpegArgs = ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k'];
        if (startTime) ffmpegArgs.push('-ss', startTime);
        if (endTime) ffmpegArgs.push('-to', endTime);
        args.push('--postprocessor-args', `ffmpeg:${ffmpegArgs.join(' ')}`);
    }

    // Time trimming for audio-only downloads
    if (type === 'audio' && (startTime || endTime)) {
        const postArgs = [];
        if (startTime) postArgs.push('-ss', startTime);
        if (endTime) postArgs.push('-to', endTime);
        if (postArgs.length > 0) {
            args.push('--postprocessor-args', `ffmpeg:${postArgs.join(' ')}`);
        }
    }

    args.push(url);

    const ytdlp = spawn(ytdlpPath, args);
    let lastFilename = null;

    ytdlp.stdout.on('data', (data) => {
        const output = data.toString();

        // Parse progress
        const progressMatch = output.match(/(\d+\.?\d*)%/);
        if (progressMatch) {
            const progress = parseFloat(progressMatch[1]);
            activeDownloads.set(downloadId, {
                ...activeDownloads.get(downloadId),
                progress,
                status: 'downloading'
            });
        }

        // Parse filename
        const destMatch = output.match(/Destination: (.+)/);
        if (destMatch) {
            lastFilename = path.basename(destMatch[1]);
        }

        const mergeMatch = output.match(/Merging formats into "(.+)"/);
        if (mergeMatch) {
            lastFilename = path.basename(mergeMatch[1]);
        }
    });

    ytdlp.stderr.on('data', (data) => {
        console.error('yt-dlp stderr:', data.toString());
    });

    ytdlp.on('close', (code) => {
        if (code === 0) {
            // Find the downloaded file
            const files = fs.readdirSync(downloadsDir);
            const latestFile = files
                .map(f => ({ name: f, time: fs.statSync(path.join(downloadsDir, f)).mtime }))
                .sort((a, b) => b.time - a.time)[0];

            activeDownloads.set(downloadId, {
                progress: 100,
                status: 'complete',
                filename: latestFile ? latestFile.name : lastFilename
            });
        } else {
            activeDownloads.set(downloadId, {
                progress: 0,
                status: 'error',
                error: 'Download failed'
            });
        }
    });
}

// Graceful shutdown
function shutdown() {
    console.log('\n  Shutting down SpawnByte DL...');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

// Windows-specific: handle console close
if (process.platform === 'win32') {
    process.on('SIGBREAK', shutdown);
}

const server = app.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════╗');
    console.log('  ║                                           ║');
    console.log('  ║   SpawnByte DL is running!                ║');
    console.log('  ║                                           ║');
    console.log('  ║   Opening browser...                      ║');
    console.log('  ║                                           ║');
    console.log('  ║   Close this window to stop the server    ║');
    console.log('  ║                                           ║');
    console.log('  ╚═══════════════════════════════════════════╝');
    console.log('');

    // Auto-open browser
    const url = `http://localhost:${PORT}`;
    const { exec } = require('child_process');

    // Cross-platform browser open
    const command = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`;

    exec(command, (err) => {
        if (err) {
            console.log(`  Could not auto-open browser. Visit: ${url}`);
        }
    });
});
