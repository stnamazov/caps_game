<script setup lang="ts">
import { GLTFModel } from '@tresjs/cientos'

const path = '/models/location.glb'
</script>

<template>
    <GLTFModel :path="path" :scale="3.5" :position="[0, -0.01, 0]" :rotation="[0, Math.PI / -2.5, 0]" />
</template>