<script setup lang="ts">
import { EffectComposerPmndrs, TiltShiftPmndrs, BrightnessContrastPmndrs } from '@tresjs/post-processing'
</script>

<template>
    <Suspense>
        <EffectComposerPmndrs>
            <TiltShiftPmndrs :focusArea="0.6" :feather="0.5" />
            <BrightnessContrastPmndrs :brightness="0.01" :contrast="0.25" />
        </EffectComposerPmndrs>
    </Suspense>
</template>
