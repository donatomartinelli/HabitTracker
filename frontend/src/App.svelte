<script>
    import { onMount } from "svelte";
    import { migrateLegacyData } from "./db.js";
    import { loadAppData } from "./store.js";
    import LeftPane from "./components/LeftPane.svelte";
    import RightPane from "./components/RightPane.svelte";
    import "./layout.css";

    let isReady = false;

    onMount(async () => {
        await migrateLegacyData();
        await loadAppData();
        isReady = true;
    });
</script>

{#if isReady}
    <div class="app-container">
        <LeftPane />
        <RightPane />
    </div>
{:else}
    <main style="display: flex; height: 100vh; align-items: center; justify-content: center; background: #0f0f0f; color: #e0e0e0; font-family: monospace;">
        <p>Caricamento moduli...</p>
    </main>
{/if}
