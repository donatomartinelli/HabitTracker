<script>
    import { categories } from "../store.js";
</script>

<aside class="left-pane">
    <h2>Categorie</h2>
    {#if $categories.length === 0}
        <p class="empty-state">Nessuna categoria disponibile.</p>
    {:else}
        <ul class="category-list">
            {#each $categories as category}
                <li class="category-item">{category.name}</li>
            {/each}
        </ul>
    {/if}
</aside>

<style>
    h2 {
        margin-top: 0;
        font-size: 1.2rem;
        color: #4CAF50;
        border-bottom: 1px solid #333;
        padding-bottom: 10px;
        font-family: monospace;
    }
    .empty-state {
        color: #888;
        font-family: monospace;
    }
    .category-list {
        list-style: none;
        padding: 0;
        margin: 0;
        overflow-y: auto;
    }
    .category-item {
        padding: 12px 10px;
        margin-bottom: 6px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: monospace;
    }
    .category-item:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }
</style>