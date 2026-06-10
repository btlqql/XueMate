<script setup>
import SortAnimator from './SortAnimator.vue'
import StepAnimator from './StepAnimator.vue'
import FormulaAnimator from './FormulaAnimator.vue'
import TreeAnimator from './TreeAnimator.vue'

const props = defineProps({
  data: { type: Object, required: true }
})

const componentMap = {
  sorting: SortAnimator,
  steps: StepAnimator,
  process: StepAnimator,
  formula: FormulaAnimator,
  math: FormulaAnimator,
  tree: TreeAnimator,
  bst: TreeAnimator,
  binarytree: TreeAnimator
}

const component = componentMap[props.data?.type]

// 兼容两种 JSON 格式：
// 1. 嵌套格式: {type, title, data: {nodes, steps}}
// 2. 扁平格式: {type, title, nodes, steps}（LLM 可能省略 data 包装层）
const innerData = props.data?.data && typeof props.data.data === 'object'
  ? props.data.data
  : (() => {
      const { type, title, data, ...rest } = props.data || {}
      return Object.keys(rest).length > 0 ? rest : data || {}
    })()
const animTitle = props.data?.title || ''
</script>

<template>
  <component v-if="component" :is="component" :data="innerData" :title="animTitle" />
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
