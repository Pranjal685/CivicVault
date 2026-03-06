/**
 * Hardware Scanner — Profiles the user's system to determine
 * optimal LLM inference backend and model tier.
 *
 * Returns: { backend, tier, totalRamGB, gpus: [string] }
 */

const os = require('os');

async function profileSystem() {
    const si = require('systeminformation');

    // ── Gather hardware info ──────────────────────────────────────────
    const [graphics, mem] = await Promise.all([
        si.graphics(),
        si.mem(),
    ]);

    const totalRamGB = Math.round(mem.total / (1024 ** 3));
    const platform = os.platform(); // 'win32', 'linux', 'darwin'

    // ── GPU Detection ─────────────────────────────────────────────────
    const gpuControllers = graphics.controllers || [];
    const gpuModels = gpuControllers.map(c => c.model || c.name || 'Unknown GPU');

    // Detect primary GPU vendor from all controllers
    let detectedVendor = 'Unknown';
    let detectedModel = '';
    let detectedVramMB = 0;

    for (const controller of gpuControllers) {
        const vendor = (controller.vendor || '').toUpperCase();
        const model = (controller.model || controller.name || '').toUpperCase();

        if (vendor.includes('NVIDIA') || model.includes('NVIDIA') || model.includes('GEFORCE') || model.includes('RTX') || model.includes('GTX')) {
            detectedVendor = 'NVIDIA';
            detectedModel = controller.model || controller.name;
            detectedVramMB = controller.vram || 0;
            break; // NVIDIA takes priority
        } else if (vendor.includes('AMD') || vendor.includes('ADVANCED MICRO') || model.includes('RADEON') || model.includes('RX ')) {
            detectedVendor = 'AMD';
            detectedModel = controller.model || controller.name;
            detectedVramMB = controller.vram || 0;
            // Don't break — NVIDIA might be found next
        } else if (vendor.includes('INTEL') || model.includes('INTEL') || model.includes('UHD') || model.includes('IRIS')) {
            if (detectedVendor === 'Unknown') {
                detectedVendor = 'Intel';
                detectedModel = controller.model || controller.name;
                detectedVramMB = controller.vram || 0;
            }
        }
    }

    // ── Backend Routing ───────────────────────────────────────────────
    let backend = 'CPU (OpenBLAS)';

    if (detectedVendor === 'NVIDIA') {
        backend = 'CUDA';
    } else if (detectedVendor === 'AMD') {
        // Check for Ryzen AI NPU
        const hasNPU = detectedModel.toUpperCase().includes('RYZEN') || detectedModel.toUpperCase().includes('AI');
        if (hasNPU) {
            backend = 'ONNX_VAIP';
        } else if (platform === 'win32') {
            backend = 'DirectML';
        } else if (platform === 'linux') {
            backend = 'ROCm';
        } else {
            backend = 'CPU (OpenBLAS)';
        }
    } else if (detectedVendor === 'Intel') {
        backend = 'CPU (OpenBLAS)';
    }

    // ── Model Tier Determination ──────────────────────────────────────
    let tier, tierLabel;

    if (totalRamGB < 10) {
        tier = 'lite';
        tierLabel = 'Lite Tier (3.8B · 4-bit)';
    } else if (totalRamGB <= 24) {
        tier = 'standard';
        tierLabel = 'Standard Tier (7B · 5-bit)';
    } else {
        tier = 'pro';
        tierLabel = 'Pro Tier (8B+ · 8-bit)';
    }

    const profile = {
        backend,
        tier,
        tierLabel,
        totalRamGB,
        vramMB: detectedVramMB,
        gpus: gpuModels,
        primaryGpu: detectedModel || 'Integrated',
        gpuVendor: detectedVendor,
        platform,
    };

    console.log('[CivicVault] ═══ Hardware Profile ═══');
    console.log(`  GPU:     ${detectedModel || 'No discrete GPU'} (${detectedVendor})`);
    console.log(`  VRAM:    ${detectedVramMB} MB`);
    console.log(`  RAM:     ${totalRamGB} GB`);
    console.log(`  Backend: ${backend}`);
    console.log(`  Tier:    ${tierLabel}`);
    console.log('[CivicVault] ════════════════════════');

    return profile;
}

module.exports = { profileSystem };
