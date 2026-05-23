<script setup>
import SortAnimator from './SortAnimator.vue'
import StepAnimator from './StepAnimator.vue'
import FormulaAnimator from './FormulaAnimator.vue'

const props = defineProps({
  data: { type: Object, required: true }
})

const componentMap = {
  sorting: SortAnimator,
  steps: StepAnimator,
  process: StepAnimator,
  formula: FormulaAnimator,
  math: FormulaAnimator
}

const component = componentMap[props.data?.type]
</script>

<template>
  <component v-if="component" :is="component" :data="data.data" :title="data.title" />
  <div v-else class="anim-unknown">不支持的动画类型: {{ data?.type || '未知' }}</div>
</template>

<style scoped>
.anim-unknown {
  padding: 12px 16px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 8px;
  font-size: 13px;
  margin: 8px 0;
}
</style>
