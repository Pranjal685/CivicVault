/**
 * Inference Router — Intercepts LLM inference requests, profiles the system,
 * and routes to the optimal hardware backend.
 *
 * Returns: { routedBackend, status, hardware, tier, tierLabel }
 */

const { profileSystem } = require('./hardwareScanner.cjs');

/**
 * Executes routed inference setup.
 * Profiles the system, logs routing decisions, and simulates backend initialization.
 *
 * @param {string} prompt - Description of the inference task (for logging)
 * @param {string} type - Type of inference: 'timeline', 'search', 'general'
 * @returns {Promise<object>} Routing status object
 */
async function executeRoutedInference(prompt = '', type = 'general') {
    console.log(`\n[CivicVault Router] ══════════════════════════════════════`);
    console.log(`[CivicVault Router] Intercepted inference request.`);
    console.log(`[CivicVault Router] Task type: ${type}`);

    // Profile the system hardware
    const profile = await profileSystem();

    const gpu = profile.primaryGpu || profile.gpus[0] || 'CPU';

    console.log(`[CivicVault Router] Target Hardware: ${gpu} | Target Backend: ${profile.backend}`);
    console.log(`[CivicVault Router] Model Tier: ${profile.tierLabel}`);
    console.log(`[CivicVault Router] RAM Available: ${profile.totalRamGB}GB`);
    console.log(`[CivicVault Router] Offloading ${profile.tier} inference to ${profile.backend}...`);

    // Simulate hardware backend initialization
    await new Promise(res => setTimeout(res, 800));

    console.log(`[CivicVault Router] ${profile.backend} backend initialized. Ready.`);
    console.log(`[CivicVault Router] ══════════════════════════════════════\n`);

    return {
        routedBackend: profile.backend,
        status: 'Active',
        hardware: gpu,
        tier: profile.tier,
        tierLabel: profile.tierLabel,
        totalRamGB: profile.totalRamGB,
        gpuVendor: profile.gpuVendor,
    };
}

module.exports = { executeRoutedInference };
