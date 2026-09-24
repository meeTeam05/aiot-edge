import { sendCommand } from '../services/commands.js';
import { normalizeDeviceId } from '../utils/device-id.js';
import { checkDeviceAccess } from '../utils/check-access.js';
import { COMMANDS_MAX_LIMIT, COMMAND_TYPES, RATE_LIMIT_COMMAND } from '../constants.js';
import { parsePositiveInt } from '../utils/parse.js';

const BLOCKED_GENERIC_COMMAND_TYPES = new Set(['set_config', 'ota_update']);
const MAX_UINT32 = 4_294_967_295;
const COMMANDS_MAX_OFFSET = 2_147_483_647;

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(payload, allowedKeys) {
    return Object.keys(payload).every((key) => allowedKeys.includes(key));
}

export function validateCommandPayload(payload) {
    if (!isPlainObject(payload)) {
        return { ok: false, error: 'payload required' };
    }

    if (typeof payload.type !== 'string') {
        return { ok: false, error: `payload.type must be one of: ${COMMAND_TYPES.join(', ')}` };
    }

    if (BLOCKED_GENERIC_COMMAND_TYPES.has(payload.type)) {
        return { ok: false, error: `${payload.type} is not accepted on the generic command endpoint` };
    }

    if (!COMMAND_TYPES.includes(payload.type)) {
        return { ok: false, error: `payload.type must be one of: ${COMMAND_TYPES.join(', ')}` };
    }

    if (payload.type === 'relay_set') {
        if (!hasOnlyKeys(payload, ['type', 'relay', 'state'])) {
            return { ok: false, error: 'relay_set accepts only type, relay, state' };
        }
        if (!Number.isInteger(payload.relay) || payload.relay < 1 || payload.relay > 3) {
            return { ok: false, error: 'relay_set.relay must be an integer from 1 to 3' };
        }
        if (typeof payload.state !== 'boolean') {
            return { ok: false, error: 'relay_set.state must be boolean' };
        }
        return { ok: true };
    }

    if (payload.type === 'device_mode') {
        if (!hasOnlyKeys(payload, ['type', 'mode'])) {
            return { ok: false, error: 'device_mode accepts only type, mode' };
        }
        if (payload.mode !== 'on' && payload.mode !== 'off') {
            return { ok: false, error: 'device_mode.mode must be on or off' };
        }
        return { ok: true };
    }

    if (payload.type === 'ai_set') {
        if (!hasOnlyKeys(payload, ['type', 'state'])) {
            return { ok: false, error: 'ai_set accepts only type, state' };
        }
        if (typeof payload.state !== 'boolean') {
            return { ok: false, error: 'ai_set.state must be boolean' };
        }
        return { ok: true };
    }

    if (payload.type === 'set_time') {
        if (!hasOnlyKeys(payload, ['type', 'ts'])) {
            return { ok: false, error: 'set_time accepts only type, ts' };
        }
        if (!Number.isInteger(payload.ts) || payload.ts <= 0 || payload.ts > MAX_UINT32) {
            return { ok: false, error: 'set_time.ts must be a finite Unix timestamp in seconds' };
        }
        return { ok: true };
    }

    if (payload.type === 'calibrate_co' || payload.type === 'calibrate_no2') {
        if (!hasOnlyKeys(payload, ['type'])) {
            return { ok: false, error: `${payload.type} accepts only type` };
        }
        return { ok: true };
    }

    return { ok: false, error: `payload.type must be one of: ${COMMAND_TYPES.join(', ')}` };
}

export default async function commandsRoutes(fastify) {
    const auth = { preHandler: fastify.authenticate };

    fastify.post('/devices/:id/command', { preHandler: fastify.authenticate, config: { rateLimit: RATE_LIMIT_COMMAND } }, async (request, reply) => {
        const deviceId = normalizeDeviceId(request.params.id);
        if (!deviceId) return reply.code(400).send({ error: 'Invalid device ID' });
        const userId = request.user.sub;
        const allowed = await checkDeviceAccess(fastify, deviceId, userId);
        if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

        const { payload } = request.body || {};
        const validation = validateCommandPayload(payload);
        if (!validation.ok) return reply.code(400).send({ error: validation.error });

        const commandId = await sendCommand(fastify, deviceId, payload, userId);
        return reply.code(201).send({ command_id: commandId });
    });

    fastify.post('/devices/:id/relay/:channel', {
        preHandler: fastify.authenticate,
        config: { rateLimit: RATE_LIMIT_COMMAND },
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    channel: { type: 'integer', minimum: 1, maximum: 3 },
                },
                required: ['id', 'channel'],
            },
            body: {
                type: 'object',
                properties: {
                    state: { type: 'boolean' },
                },
                required: ['state'],
            },
        },
    }, async (request, reply) => {
        const deviceId = normalizeDeviceId(request.params.id);
        if (!deviceId) return reply.code(400).send({ error: 'Invalid device ID' });
        const userId = request.user.sub;
        const allowed = await checkDeviceAccess(fastify, deviceId, userId);
        if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

        const payload = {
            type: 'relay_set',
            relay: request.params.channel,
            state: request.body.state,
        };

        const commandId = await sendCommand(fastify, deviceId, payload, userId);
        return reply.code(201).send({ command_id: commandId });
    });

    fastify.post('/devices/:id/mode', {
        preHandler: fastify.authenticate,
        config: { rateLimit: RATE_LIMIT_COMMAND },
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
            body: {
                type: 'object',
                properties: {
                    mode: { type: 'string', enum: ['on', 'off'] },
                },
                required: ['mode'],
            },
        },
    }, async (request, reply) => {
        const deviceId = normalizeDeviceId(request.params.id);
        if (!deviceId) return reply.code(400).send({ error: 'Invalid device ID' });
        const userId = request.user.sub;
        const allowed = await checkDeviceAccess(fastify, deviceId, userId);
        if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

        const payload = {
            type: 'device_mode',
            mode: request.body.mode,
        };

        const commandId = await sendCommand(fastify, deviceId, payload, userId);
        return reply.code(201).send({ command_id: commandId });
    });

    fastify.post('/devices/:id/ai', {
        preHandler: fastify.authenticate,
        config: { rateLimit: RATE_LIMIT_COMMAND },
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
            body: {
                type: 'object',
                properties: {
                    state: { type: 'boolean' },
                },
                required: ['state'],
            },
        },
    }, async (request, reply) => {
        const deviceId = normalizeDeviceId(request.params.id);
        if (!deviceId) return reply.code(400).send({ error: 'Invalid device ID' });
        const userId = request.user.sub;
        const allowed = await checkDeviceAccess(fastify, deviceId, userId);
        if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

        const payload = {
            type: 'ai_set',
            state: request.body.state,
        };

        const commandId = await sendCommand(fastify, deviceId, payload, userId);
        return reply.code(201).send({ command_id: commandId });
    });

    fastify.get('/devices/:id/commands', auth, async (request, reply) => {
        const deviceId = normalizeDeviceId(request.params.id);
        if (!deviceId) return reply.code(400).send({ error: 'Invalid device ID' });
        const userId = request.user.sub;
        const allowed = await checkDeviceAccess(fastify, deviceId, userId);
        if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

        const limit = parsePositiveInt(request.query.limit, 50, COMMANDS_MAX_LIMIT);
        const offset = parsePositiveInt(request.query.offset, 0, COMMANDS_MAX_OFFSET);
        if (limit === null || offset === null) {
            return reply.code(400).send({ error: 'limit and offset must be non-negative integers' });
        }

        const { rows } = await fastify.db.query(
            `SELECT id, payload, status, created_at, executed_at
             FROM commands WHERE device_id = $1
             ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [deviceId, limit, offset]
        );
        return rows;
    });
}
