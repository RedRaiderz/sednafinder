import { startCamera } from './sensors/camera.js';

const startBtn = document.getElementById('start');
const video = document.getElementById('cam');

startBtn.addEventListener('click', async () => {
  try {
    await startCamera(video);
    startBtn.classList.add('hidden');
    startBtn.style.display = 'none';
  } catch (err) {
    startBtn.textContent = 'Camera blocked — check Settings';
    console.error(err);
  }
});
