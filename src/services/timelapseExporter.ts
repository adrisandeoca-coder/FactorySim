/**
 * Time-lapse video exporter — zero-dependency WebM export using canvas MediaRecorder API.
 *
 * Takes captured animation frames (base64 PNGs with progress metadata),
 * composites each onto an offscreen canvas with a progress overlay,
 * and records via MediaRecorder to produce a downloadable WebM file.
 */

export interface TimelapseFrame {
  progress: number;
  base64: string;
  metadata?: { simTime?: number };
}

export interface TimelapseOptions {
  /** Duration each frame is held on screen, in ms (default: 1500) */
  frameDuration?: number;
  /** Canvas width (default: inferred from first frame) */
  width?: number;
  /** Canvas height (default: inferred from first frame) */
  height?: number;
  /** Output filename (default: 'factory-timelapse.webm') */
  filename?: string;
}

/**
 * Load a base64 PNG string into an HTMLImageElement.
 */
function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    const prefix = base64.startsWith('data:') ? '' : 'data:image/png;base64,';
    img.src = prefix + base64;
  });
}

/**
 * Draw a single frame onto the canvas: the image + progress overlay.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  simTime?: number,
) {
  // Draw the captured frame, scaled to fill
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  // Progress bar at bottom
  const barHeight = 6;
  const barY = height - barHeight;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, barY, width, barHeight);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(0, barY, width * (progress / 100), barHeight);

  // Progress label overlay (top-right badge)
  const label = `${Math.round(progress)}%`;
  ctx.font = 'bold 14px system-ui, sans-serif';
  const textWidth = ctx.measureText(label).width;
  const badgeW = textWidth + 16;
  const badgeH = 24;
  const badgeX = width - badgeW - 10;
  const badgeY = 10;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, badgeX + badgeW / 2, badgeY + badgeH / 2);

  // Sim time label (top-left) if available
  if (simTime != null) {
    const hrs = Math.floor(simTime / 3600);
    const mins = Math.floor((simTime % 3600) / 60);
    const timeLabel = `T+${hrs}h${mins.toString().padStart(2, '0')}m`;
    ctx.font = '12px system-ui, sans-serif';
    const tw = ctx.measureText(timeLabel).width;
    const tbW = tw + 12;
    const tbH = 22;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.roundRect(10, 10, tbW, tbH, 5);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeLabel, 10 + tbW / 2, 10 + tbH / 2);
  }
}

/**
 * Wait for a given number of milliseconds.
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Export captured frames as a WebM timelapse video.
 * Returns the Blob for programmatic use; also triggers a download.
 */
export async function exportTimelapse(
  frames: TimelapseFrame[],
  options?: TimelapseOptions,
): Promise<Blob> {
  if (frames.length === 0) {
    throw new Error('No frames to export');
  }

  const frameDuration = options?.frameDuration ?? 1500;
  const filename = options?.filename ?? 'factory-timelapse.webm';

  // Load first image to determine dimensions
  const firstImg = await loadImage(frames[0].base64);
  const width = options?.width ?? firstImg.naturalWidth;
  const height = options?.height ?? firstImg.naturalHeight;

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  // Set up MediaRecorder
  const stream = canvas.captureStream(30); // 30 fps capture rate
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
    recorder.onerror = (e) => reject(e);
  });

  // Start recording
  recorder.start();

  // Pre-load all images
  const images = await Promise.all(frames.map((f) => loadImage(f.base64)));

  // Draw each frame and hold for frameDuration
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    drawFrame(ctx, images[i], width, height, frame.progress, frame.metadata?.simTime);
    await wait(frameDuration);
  }

  // Stop recording
  recorder.stop();

  const blob = await recordingDone;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return blob;
}
