let audioUnlocked = false;

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

export function unlockAudio(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);

        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            audioUnlocked = true;
            resolve(true);
          }).catch(() => {
            audioUnlocked = true;
            resolve(true);
          });
        } else {
          audioUnlocked = true;
          resolve(true);
        }
      } else {
        // Fallback with HTML5 Audio element
        const a = new Audio();
        a.play().then(() => {
          audioUnlocked = true;
          resolve(true);
        }).catch(() => {
          audioUnlocked = true;
          resolve(true);
        });
      }
    } catch {
      audioUnlocked = true;
      resolve(true);
    }
  });
}
