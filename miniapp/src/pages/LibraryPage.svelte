<script lang="ts">
  import type { Category } from '../lib/types'
  import CategoryList from '../components/CategoryList.svelte'

  let { categories, onCategory }: { categories: Category[]; onCategory: (category: Category) => void } = $props()
</script>

<section class="page-heading">
  <p class="eyebrow">THE WHOLE LIBRARY</p>
  <h1>Topics</h1>
  <p>Choose a subject to find the official answer.</p>
</section>
<CategoryList categories={categories} onSelect={onCategory} />
