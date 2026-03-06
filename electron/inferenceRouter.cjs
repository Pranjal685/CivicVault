/**
 * Inference Router — Context-aware routing interceptor.
 * Intercepts LLM inference requests, profiles the system hardware,
 * and dynamically routes to the optimal backend based on task type + VRAM.
 *
 * Returns: { routedBackend, status, hardware, tier, tierLabel, vramMB, rerouted }
 */

const { profileSystem } = require('./hardwareScanner.cjs');

/**
 * Executes routed inference setup with context-aware VRAM threshold logic.
 *
 * @param {string} prompt - Description of the inference task (for logging)
 * @param {string} taskType - Type of inference: 'timeline', 'search', 'chat', 'general'
 * @returns {Promise<object>} Routing status object
 */
async function executeRoutedInference(prompt = '', taskType = 'chat') {
    console.log(`\n[CivicVault Router] ══════════════════════════════════════`);
    console.log(`[CivicVault Router] Intercepted inference request.`);
    console.log(`[CivicVault Router] Task type: ${taskType}`);

    // Profile the system hardware
    const profile = await profileSystem();

    const gpu = profile.primaryGpu || profile.gpus[0] || 'CPU';
    let rerouted = false;
    let originalBackend = profile.backend;

    console.log(`[CivicVault Router] Target Hardware: ${gpu} | Target Backend: ${profile.backend}`);
    console.log(`[CivicVault Router] VRAM: ${profile.vramMB}MB | System RAM: ${profile.totalRamGB}GB`);
    console.log(`[CivicVault Router] Model Tier: ${profile.tierLabel}`);

    // ── Context-Aware VRAM Threshold Logic ─────────────────────────────
    // High-context tasks (timeline) require massive context windows.
    // If GPU VRAM is insufficient (<8GB), the context won't fit and VRAM
    // swapping will cause extreme latency. CPU with direct access to
    // high-speed system RAM handles large contexts faster in this case.
    if (taskType === 'timeline') {
        console.log(`[CivicVault Router] High-context task detected (timeline extraction).`);

        if (profile.backend === 'CUDA' && profile.vramMB < 8000) {
            originalBackend = profile.backend;
            profile.backend = 'CPU (AMD Ryzen Optimized)';
            rerouted = true;
            console.log(`[CivicVault Router] ⚠ GPU VRAM (${profile.vramMB}MB) insufficient for high-context task.`);
            console.log(`[CivicVault Router] ⚠ Rerouting from ${originalBackend} → ${profile.backend} to prevent latency bottlenecks.`);
        } else if (profile.backend === 'DirectML' && profile.vramMB < 8000) {
            originalBackend = profile.backend;
            profile.backend = 'CPU (AMD Ryzen Optimized)';
            rerouted = true;
            console.log(`[CivicVault Router] ⚠ GPU VRAM (${profile.vramMB}MB) insufficient for high-context task.`);
            console.log(`[CivicVault Router] ⚠ Rerouting from ${originalBackend} → ${profile.backend} to prevent latency bottlenecks.`);
        } else {
            console.log(`[CivicVault Router] GPU VRAM (${profile.vramMB}MB) sufficient. Keeping ${profile.backend} backend.`);
        }
    }

    console.log(`[CivicVault Router] Offloading ${profile.tier} inference to ${profile.backend}...`);

    // Simulate hardware backend initialization
    await new Promise(res => setTimeout(res, 800));

    console.log(`[CivicVault Router] ${profile.backend} backend initialized. Ready.`);
    console.log(`[CivicVault Router] ══════════════════════════════════════\n`);

    return {
        routedBackend: profile.backend,
        originalBackend: rerouted ? originalBackend : null,
        rerouted,
        status: rerouted ? 'Rerouted' : 'Active',
        hardware: gpu,
        tier: profile.tier,
        tierLabel: profile.tierLabel,
        totalRamGB: profile.totalRamGB,
        vramMB: profile.vramMB,
        gpuVendor: profile.gpuVendor,
    };
}

module.exports = { executeRoutedInference };
