import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCommandPayload } from '../src/routes/commands.js';

test('generic command validation accepts supported command schemas', () => {
    const validPayloads = [
        { type: 'relay_set', relay: 1, state: true },
        { type: 'device_mode', mode: 'off' },
        { type: 'set_time', ts: 1777631761 },
        { type: 'calibrate_co' },
        { type: 'calibrate_no2' },
        { type: 'ai_set', state: true },
        { type: 'ai_set', state: false },
    ];

    for (const payload of validPayloads) {
        assert.equal(validateCommandPayload(payload).ok, true, payload.type);
    }
});

test('generic command validation rejects credential and OTA commands', () => {
    for (const type of ['set_config', 'ota_update']) {
        const result = validateCommandPayload({ type });
        assert.equal(result.ok, false, type);
        assert.match(result.error, /not accepted/);
    }
});

test('generic command validation rejects invalid command shapes', () => {
    const invalidPayloads = [
        null,
        { type: 'relay_set', relay: 4, state: true },
        { type: 'relay_set', relay: 1, state: true, extra: true },
        { type: 'device_mode', mode: 'auto' },
        { type: 'set_time', ts: 1777631761000 },
        { type: 'calibrate_co', value: 1 },
        { type: 'ai_set' },
        { type: 'ai_set', state: 'true' },
        { type: 'ai_set', state: 1 },
        { type: 'ai_set', state: true, extra: true },
    ];

    for (const payload of invalidPayloads) {
        assert.equal(validateCommandPayload(payload).ok, false, JSON.stringify(payload));
    }
});
