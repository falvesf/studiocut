// Extracts normalized waveform peaks (0..1) from an audio/video URL using Web Audio API
const waveformCache = new Map();

export async function extractWaveformPeaks(url, buckets = 100) {
  if (!url) return [];
  const cacheKey = `${url}::${buckets}`;
  if (waveformCache.has(cacheKey)) {
    return waveformCache.get(cacheKey);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const arrayBuffer = await response.arrayBuffer();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return [];
    const ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const blockSize = Math.max(1, Math.floor(totalSamples / buckets));

    const peaks = [];
    let globalMax = 0.001;

    for (let i = 0; i < buckets; i++) {
      const start = i * blockSize;
      const end = Math.min(totalSamples, start + blockSize);
      let max = 0;
      // Stride for fast processing on long audio files
      const step = Math.max(1, Math.floor((end - start) / 64));
      for (let j = start; j < end; j += step) {
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      if (max > globalMax) globalMax = max;
      peaks.push(max);
    }

    const normalized = peaks.map((p) => Math.min(1, p / globalMax));
    try {
      await ctx.close();
    } catch (e) {}

    waveformCache.set(cacheKey, normalized);
    return normalized;
  } catch (err) {
    return [];
  }
}
