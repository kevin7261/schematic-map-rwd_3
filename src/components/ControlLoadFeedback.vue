<script setup>
  import {
    controlLoadFeedback,
    controlLoadFeedbackClass,
  } from '@/utils/control/controlLoadFeedback.js';

  defineProps({
    layerId: { type: String, required: true },
  });
</script>

<template>
  <div
    v-if="controlLoadFeedback[layerId]?.message"
    class="my-font-size-xs pt-1 pb-2"
    :class="controlLoadFeedbackClass(controlLoadFeedback[layerId]?.tone)"
    style="line-height: 1.45; white-space: pre-wrap"
  >
    {{ controlLoadFeedback[layerId].message }}
  </div>
</template>
