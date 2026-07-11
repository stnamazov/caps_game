<script setup lang="ts">
import { EffectComposerPmndrs, TiltShiftPmndrs, BrightnessContrastPmndrs } from '@tresjs/post-processing'
</script>

<template>
    <Suspense>
        <EffectComposerPmndrs>
        <TiltShiftPmndrs :focusArea="0.85" :feather="0.6" />
        <BrightnessContrastPmndrs :brightness="0.05" :contrast="0.45" />
        </EffectComposerPmndrs>
    </Suspense>
</template>