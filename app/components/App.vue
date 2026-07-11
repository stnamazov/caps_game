<template>
  <div>
    <UiGameOverlay />
    <TresCanvas clear-color="#020420" window-size >
      
      <SceneCamera />
      <SceneLight />
      <ScenePostProcessing />

      <ObjectsCaps />
      <ObjectsFloor />

    </TresCanvas>
  </div>
</template>