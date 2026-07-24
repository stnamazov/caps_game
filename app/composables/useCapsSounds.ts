import { Howl, Howler } from 'howler'

// Не пытаемся поднимать AudioContext до жеста пользователя
Howler.autoUnlock = false

let chipsSound: Howl | null = null

function getChipsSound() {
  if (!chipsSound) {
    chipsSound = new Howl({
      src: ['/audio/chips.mp3'],
      // По умолчанию pool=5 — лишние одновременные приземления просто не играют
      pool: 32,
      preload: true,
      sprite: {
        first_hit_1: [9040, 200],
        first_hit_2: [7060, 200],
        first_hit_3: [37070, 200],
        slam_flat_1: [2000, 100],
        slam_flat_2: [2090, 100],
        slam_flat_3: [4240, 100],
        slam_flat_4: [13020, 100],
        slam_flat_5: [14140, 100],
        slam_flat_6: [21050, 100],
        slam_flat_7: [25070, 100],
        slam_flat_8: [26200, 100],
        slam_flat_9: [27110, 100],
        slam_flat_10: [29050, 100],
        dribble: [47250, 250],
      },
    })
  }
  return chipsSound
}

export function useCapsSounds() {
  function resumeAudioContext() {
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      void Howler.ctx.resume()
    }
  }

  // Метод для принудительного "прогрева" аудио по первому HTML-клику
  function unlockMobileAudio() {
    // Создаём Howl только после жеста — иначе Chrome ругается на autoplay
    getChipsSound()
    resumeAudioContext()

    const ctx = Howler.ctx
    if (ctx) {
      const buffer = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
    }
  }

  function playFirstHit() {
    const sound = getChipsSound()
    resumeAudioContext()
    const index = Math.floor(Math.random() * 3) + 1
    sound.play(`first_hit_${index}`)
  }

  function playSlamFlat() {
    const sound = getChipsSound()
    resumeAudioContext()
    const index = Math.floor(Math.random() * 10) + 1
    sound.play(`slam_flat_${index}`)
  }

  function playDribble() {
    const sound = getChipsSound()
    resumeAudioContext()
    sound.play('dribble')
  }

  return {
    resumeAudioContext,
    unlockMobileAudio,
    playFirstHit,
    playSlamFlat,
    playDribble,
  }
}
