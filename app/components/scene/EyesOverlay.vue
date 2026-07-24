<script setup lang="ts">
// Компонент просто принимает класс .is-sleeping
</script>

<template>
  <div class="eyes-container">
    <div class="eyes-blur-backdrop" />
    
    <div class="eye-lid lid-top" />
    
    <div class="eye-lid lid-bottom" />
  </div>
</template>

<style scoped>
.eyes-container {
  position: absolute;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  overflow: hidden;
}

/* ========================================================
   1. СЛОЙ РАДИАЛЬНОГО РАЗМЫТИЯ (ФОКУС ПО ЦЕНТРУ)
   ======================================================== */
.eyes-blur-backdrop {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.3); /* Легкое базовое затемнение */
  backdrop-filter: blur(30px); /* Сильное размытие по краям */
  opacity: 0;
  
  /* Радиальная маска: 
     В центре (ellipse 80% 30%) — 100% прозрачно (картинка четкая).
     К краям этой зоны (до 80%) плавно нарастает черный цвет маски (включается блюр). */
  mask-image: radial-gradient(ellipse 85% 35% at center, transparent 15%, black 75%);
  -webkit-mask-image: radial-gradient(ellipse 85% 35% at center, transparent 15%, black 75%);
  
  will-change: opacity, transform;
  /* При просыпании этот слой плавно растворяется и слегка масштабируется наружу */
  transition: 
    opacity 2.2s cubic-bezier(0.25, 1, 0.3, 1),
    transform 2.5s cubic-bezier(0.25, 1, 0.3, 1);
  transform: scale(1.3);
}

/* Состояние сна для задника с блюром */
.is-sleeping .eyes-blur-backdrop {
  opacity: 1;
  transform: scale(1);
  pointer-events: all; /* Блокируем клики во время сна */
}


/* ========================================================
   2. ЛИНЕЙНЫЕ ВЕКИ (ШТОРКИ СВЕРХУ И СНИЗУ)
   ======================================================= */
.eye-lid {
  position: absolute;
  left: 0;
  right: 0;
  height: 60vh; /* С перекрытием центра */
  will-change: transform;
  transition: transform 2.5s cubic-bezier(0.25, 1, 0.3, 1);
}

/* Верхнее веко: уезжает далеко вверх */
.lid-top {
  top: 0;
  transform: translateY(-100%);
  /* Мягкий градиент: от глухой темноты сверху к очень плавному рассеиванию у края */
  background: linear-gradient(to bottom, 
    rgba(0, 0, 0, 0.95) 0%, 
    rgba(0, 0, 0, 0.85) 65%, 
    rgba(0, 0, 0, 0.4) 85%, 
    rgba(0, 0, 0, 0) 100%
  );
}

/* Нижнее веко: уезжает далеко вниз */
.lid-bottom {
  bottom: 0;
  transform: translateY(100%);
  /* Мягкий градиент снизу вверх */
  background: linear-gradient(to top, 
    rgba(0, 0, 0, 0.95) 0%, 
    rgba(0, 0, 0, 0.85) 65%, 
    rgba(0, 0, 0, 0.4) 85%, 
    rgba(0, 0, 0, 0) 100%
  );
}

/* ========================================================
   СОСТОЯНИЕ СОН: ПОКАЧИВАНИЕ ВЕК (МОРГАНИЕ)
   ======================================================== */
.is-sleeping .lid-top {
  transform: translateY(-20vh); /* Прикрывает экран сверху */
  animation: lazy-blink-top 7s ease-in-out infinite alternate;
}

.is-sleeping .lid-bottom {
  transform: translateY(20vh); /* Прикрывает экран снизу */
  animation: lazy-blink-bottom 7s ease-in-out infinite alternate;
}

/* Анимации медленного дыхания глаз */
@keyframes lazy-blink-top {
  0%   { transform: translateY(-20vh); }
  40%  { transform: translateY(-17vh); } /* Чуть приоткрыл глаза, область стала шире */
  80%  { transform: translateY(-11vh); } /* Глаза почти слиплись от усталости */
  100% { transform: translateY(-20vh); }
}

@keyframes lazy-blink-bottom {
  0%   { transform: translateY(20vh); }
  40%  { transform: translateY(17vh); }
  80%  { transform: translateY(11vh); }
  100% { transform: translateY(20vh); }
}
</style>