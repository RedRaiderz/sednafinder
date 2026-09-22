// Rear camera into a <video> element.
export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export function stopCamera(videoEl) {
  const s = videoEl.srcObject;
  if (s) for (const t of s.getTracks()) t.stop();
  videoEl.srcObject = null;
}
