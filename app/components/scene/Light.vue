<template>
  <TresAmbientLight :intensity="10" :color="0x404040" cast-shadow />
  <TresDirectionalLight :position="[0, 1, 0]" :intensity="1" cast-shadow />
</template>