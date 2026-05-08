/**
 * FanWolf Engine — provider-agnostic generation layer.
 *
 * Usage:
 *   const engine = new FanWolfEngine({ provider: 'mock' });
 *   const job = engine.generate({ tool: 'image', prompt: '...', count: 4 });
 *   for await (const evt of job) {
 *     // evt = { type: 'queued' | 'started' | 'progress' | 'result' | 'done' | 'error', ... }
 *   }
 *
 * Switch providers by changing the constructor config. Mock provider is the
 * default and uses local /images/* media to simulate output. Real providers
 * (fal, replicate, civitai) are stubbed — drop in your API key + a small
 * model-mapping table to wire them up.
 */

const RESULTS_POOL = [
    { type:'image', src:'images/girl-1.jpg' },
    { type:'image', src:'images/girl-2.jpg' },
    { type:'image', src:'images/girl-3.jpg' },
    { type:'image', src:'images/girl-4.jpg' },
    { type:'image', src:'images/girl-5.jpg' },
    { type:'image', src:'images/girl-6.jpg' },
    { type:'video', src:'images/girl-1.mp4' },
    { type:'video', src:'images/girl-2.mp4' },
    { type:'video', src:'images/girl-3.mp4' },
    { type:'video', src:'images/girl-4.mp4' },
];

// Prompt-side safety filter — blocks generation BEFORE any model call.
// CSAM-adjacent terms only. Add more as needed.
const BLOCKED_TERMS = [
    /\b(child|children|kid|kids|minor|minors|underage|teen|teens|teenager)\b/i,
    /\b(?:young\s+(?:girl|boy|child))\b/i,
    /\b(?:1[0-7]|[0-9])[\s-]*(?:y\.?o|year[\s-]?old|yrs?[\s-]?old)\b/i,
    /\b(?:loli|lolita|shota|shotacon|lolicon)\b/i,
    /\b(?:school[\s-]?(?:girl|boy)|elementary|middle[\s-]?school|preschool)\b/i,
    /\b(?:infant|baby|toddler|preteen|pre[\s-]teen)\b/i,
];

function safetyCheck(prompt) {
    const p = (prompt || '').toString();
    for (const re of BLOCKED_TERMS) {
        if (re.test(p)) {
            return { ok: false, reason: 'Prompt contains blocked terms.' };
        }
    }
    return { ok: true };
}

// ---------- Providers ----------

class MockProvider {
    constructor() { this.name = 'mock'; }
    async *generate({ tool, prompt, count = 1, refMedia = null }) {
        yield { type:'queued', tool, prompt };
        await delay(400);
        yield { type:'started' };
        const total = count;
        for (let i = 0; i < total; i++) {
            await delay(800 + Math.random() * 700);
            yield { type:'progress', current: i + 1, total };
            const pool = filterPool(tool, refMedia);
            const pick = pool[Math.floor(Math.random() * pool.length)];
            yield { type:'result', media: pick, index: i };
        }
        yield { type:'done', total };
    }
}

class FalProvider {
    constructor(apiKey) { this.name = 'fal'; this.apiKey = apiKey; }
    async *generate(_) {
        // Stub: real implementation would POST to https://fal.run/v1/...
        // and stream progress via Server-Sent Events.
        yield { type:'error', message:'fal.ai provider not configured. Set FAL_KEY in engine config.' };
    }
}

class ReplicateProvider {
    constructor(apiKey) { this.name = 'replicate'; this.apiKey = apiKey; }
    async *generate(_) {
        // Stub: real implementation would POST to https://api.replicate.com/v1/predictions
        // and poll the prediction URL until status === 'succeeded'.
        yield { type:'error', message:'Replicate provider not configured. Set REPLICATE_TOKEN in engine config.' };
    }
}

class CivitaiProvider {
    constructor(apiKey) { this.name = 'civitai'; this.apiKey = apiKey; }
    async *generate(_) {
        // Stub: Civitai's image gen API (orchestrator endpoint).
        yield { type:'error', message:'Civitai provider not configured. Set CIVITAI_KEY in engine config.' };
    }
}

// ---------- Engine ----------

class FanWolfEngine {
    constructor(cfg = {}) {
        this.config = {
            provider: cfg.provider || 'mock',
            falKey: cfg.falKey || null,
            replicateToken: cfg.replicateToken || null,
            civitaiKey: cfg.civitaiKey || null,
        };
        this.provider = this._buildProvider();
    }
    _buildProvider() {
        switch (this.config.provider) {
            case 'fal': return new FalProvider(this.config.falKey);
            case 'replicate': return new ReplicateProvider(this.config.replicateToken);
            case 'civitai': return new CivitaiProvider(this.config.civitaiKey);
            case 'mock':
            default: return new MockProvider();
        }
    }
    async *generate(params) {
        const check = safetyCheck(params.prompt);
        if (!check.ok) {
            yield { type:'error', message: check.reason, blocked: true };
            return;
        }
        yield* this.provider.generate(params);
    }
    setProvider(name, opts = {}) {
        this.config.provider = name;
        Object.assign(this.config, opts);
        this.provider = this._buildProvider();
    }
}

// ---------- helpers ----------

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function filterPool(tool, refMedia) {
    // Tools that produce video output prefer mp4 in the mock pool.
    if (tool === 'video' || tool === 'scene' || tool === 'workspace') {
        const videos = RESULTS_POOL.filter(m => m.type === 'video');
        if (videos.length) return videos;
    }
    // Image tools prefer images.
    if (tool === 'image' || tool === 'adult' || tool === 'model') {
        const images = RESULTS_POOL.filter(m => m.type === 'image');
        if (images.length) return images;
    }
    return RESULTS_POOL;
}

// expose globally for studio.html
window.FanWolfEngine = FanWolfEngine;
