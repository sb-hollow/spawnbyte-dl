// DOM Elements
const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const videoCard = document.getElementById('video-card');
const videoThumbnail = document.getElementById('video-thumbnail');
const videoDuration = document.getElementById('video-duration');
const videoTitle = document.getElementById('video-title');
const videoChannel = document.getElementById('video-channel');
const optionsCard = document.getElementById('options-card');
const qualitySelect = document.getElementById('quality-select');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const downloadBtn = document.getElementById('download-btn');
const progressCard = document.getElementById('progress-card');
const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent');
const progressBar = document.getElementById('progress-bar');
const completeCard = document.getElementById('complete-card');
const downloadLink = document.getElementById('download-link');
const newDownloadBtn = document.getElementById('new-download-btn');
const toggleBtns = document.querySelectorAll('.toggle-btn');

// State
let currentVideoInfo = null;
let downloadType = 'video';

// Format duration from seconds to HH:MM:SS
function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Validate YouTube URL
function isValidYouTubeUrl(url) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=)[\w-]+/,
        /^(https?:\/\/)?(www\.)?(youtu\.be\/)[\w-]+/,
        /^(https?:\/\/)?(www\.)?(youtube\.com\/shorts\/)[\w-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
}

// Fetch video info
async function fetchVideoInfo() {
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }

    if (!isValidYouTubeUrl(url)) {
        alert('Please enter a valid YouTube URL');
        return;
    }

    // Show loading state
    fetchBtn.classList.add('loading');
    fetchBtn.disabled = true;

    // Hide previous cards
    videoCard.classList.add('hidden');
    optionsCard.classList.add('hidden');
    completeCard.classList.add('hidden');
    progressCard.classList.add('hidden');

    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch video info');
        }

        currentVideoInfo = data;

        // Update video card
        videoThumbnail.src = data.thumbnail || '';
        videoDuration.textContent = formatDuration(data.duration);
        videoTitle.textContent = data.title;
        videoChannel.textContent = data.channel;

        // Update quality select based on current type
        updateQualityOptions();

        // Update end time placeholder with video duration
        endTimeInput.placeholder = formatDuration(data.duration) || 'End';

        // Show cards
        videoCard.classList.remove('hidden');
        optionsCard.classList.remove('hidden');

    } catch (error) {
        alert(error.message);
    } finally {
        fetchBtn.classList.remove('loading');
        fetchBtn.disabled = false;
    }
}

// Update quality options based on selected type
function updateQualityOptions() {
    if (!currentVideoInfo) return;

    qualitySelect.innerHTML = '';

    const qualities = downloadType === 'video'
        ? currentVideoInfo.videoQualities
        : currentVideoInfo.audioQualities;

    if (!qualities || qualities.length === 0) {
        const option = document.createElement('option');
        option.value = downloadType === 'video' ? '720' : '128';
        option.textContent = downloadType === 'video' ? 'HD (720p)' : '128kbps';
        qualitySelect.appendChild(option);
        return;
    }

    qualities.forEach((q, index) => {
        const option = document.createElement('option');
        option.value = q.value;
        option.textContent = q.label;
        if (index === 0) option.selected = true;
        qualitySelect.appendChild(option);
    });
}

// Handle download type toggle
toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        toggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        downloadType = btn.dataset.type;
        updateQualityOptions();
    });
});

// Start download
async function startDownload() {
    const url = urlInput.value.trim();
    const quality = qualitySelect.value;
    const startTime = startTimeInput.value.trim() || null;
    const endTime = endTimeInput.value.trim() || null;

    // Hide options, show progress
    optionsCard.classList.add('hidden');
    progressCard.classList.remove('hidden');
    progressStatus.textContent = 'Starting download...';
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                type: downloadType,
                quality,
                startTime,
                endTime
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to start download');
        }

        // Listen for progress updates
        const eventSource = new EventSource(`/api/progress/${data.downloadId}`);

        eventSource.onmessage = (event) => {
            const progress = JSON.parse(event.data);

            if (progress.status === 'downloading') {
                progressStatus.textContent = 'Downloading...';
                progressPercent.textContent = `${Math.round(progress.progress)}%`;
                progressBar.style.width = `${progress.progress}%`;
            } else if (progress.status === 'complete') {
                eventSource.close();
                showComplete(progress.filename);
            } else if (progress.status === 'error') {
                eventSource.close();
                alert('Download failed: ' + (progress.error || 'Unknown error'));
                resetUI();
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            // Check if download completed before error
            setTimeout(() => {
                if (progressBar.style.width !== '100%') {
                    alert('Connection lost. Please try again.');
                    resetUI();
                }
            }, 1000);
        };

    } catch (error) {
        alert(error.message);
        resetUI();
    }
}

// Show download complete
function showComplete(filename) {
    progressCard.classList.add('hidden');
    completeCard.classList.remove('hidden');
    downloadLink.href = `/downloads/${encodeURIComponent(filename)}`;
    downloadLink.download = filename;
}

// Reset UI for new download
function resetUI() {
    videoCard.classList.add('hidden');
    optionsCard.classList.add('hidden');
    progressCard.classList.add('hidden');
    completeCard.classList.add('hidden');
    urlInput.value = '';
    startTimeInput.value = '';
    endTimeInput.value = '';
    currentVideoInfo = null;
}

// Event Listeners
fetchBtn.addEventListener('click', fetchVideoInfo);

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        fetchVideoInfo();
    }
});

// Auto-fetch when pasting URL
urlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
        const url = urlInput.value.trim();
        if (isValidYouTubeUrl(url)) {
            fetchVideoInfo();
        }
    }, 100);
});

downloadBtn.addEventListener('click', startDownload);

newDownloadBtn.addEventListener('click', resetUI);

// Validate time input format
function validateTimeInput(input) {
    input.addEventListener('blur', () => {
        const value = input.value.trim();
        if (!value) return;

        // Accept formats: SS, MM:SS, HH:MM:SS
        const patterns = [
            /^\d+$/,           // Just seconds
            /^\d+:\d{2}$/,     // MM:SS
            /^\d+:\d{2}:\d{2}$/ // HH:MM:SS
        ];

        const isValid = patterns.some(p => p.test(value));
        if (!isValid) {
            input.style.borderColor = 'var(--error)';
        } else {
            input.style.borderColor = '';
        }
    });
}

validateTimeInput(startTimeInput);
validateTimeInput(endTimeInput);
