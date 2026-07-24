<template>
  <TresAmbientLight :intensity="20" :color="0x404040" cast-shadow />
  <TresDirectionalLight :position="[0, 1, 0]" :intensity="2.5" cast-shadow />
</template>