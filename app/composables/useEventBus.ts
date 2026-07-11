import { onUnmounted } from 'vue'
import mitt from 'mitt'

// 1. Описываем типы событий и данные, которые они передают
type ApplicationEvents = {
  'fishka:click': { id: number; timestamp: number }
  'fishka:hit': { force: number; type: 'floor' | 'fishka' }
  'game:reset': void // событие без данных
}

// 2. Создаем один глобальный инстанс шины событий
const emitter = mitt<ApplicationEvents>()

export function useEventBus() {
  
  // Метод для отправки события
  function emit<K extends keyof ApplicationEvents>(event: K, payload: ApplicationEvents[K]) {
    emitter.emit(event, payload)
  }

  // Метод для подписки, который автоматически отписывается при уничтожении компонента
  function on<K extends keyof ApplicationEvents>(event: K, callback: (payload: ApplicationEvents[K]) => void) {
    emitter.on(event, callback)

    // Важно! Защита от утечек памяти: отписываемся, когда компонент размонтируется
    onUnmounted(() => {
      emitter.off(event, callback)
    })
  }

  return {
    emit,
    on
  }
}