/**
 * @file ai_selftest_vectors.h
 *
 * @brief Known input windows + expected model output for CONFIG_SA_AI_SELF_TEST.
 *
 * PLACEHOLDER -- no vectors yet. Regenerate this whole file with
 * tools/gen_selftest_vectors.py from windows whose expected result is known
 * (Hung's reference pipeline), then build with CONFIG_SA_AI_SELF_TEST=y and
 * check the "self-test: N/N passed" boot log.
 *
 * Copyright (C) 2026 MinhNhat & BaoViet
 */

#pragma once

#include "ai_input.h"

#include <stddef.h>

typedef struct {
    const char *name;
    float window[AI_INPUT_NUM_CHANNELS][AI_INPUT_WINDOW_LEN]; /* raw units, CO/NO2 in ug/m3 */
    int expected_signal;                                       /* 0 = safe, 1 = alert */
    float expected_p_alert;                                    /* softmax probability of class 1 */
} ai_selftest_vector_t;

/* Allowed |p_alert(device) - p_alert(expected)|. */
#define AI_SELFTEST_P_TOLERANCE 0.02f

/* The generated file also defines:
 *   static const ai_selftest_vector_t k_ai_selftest_vectors[AI_SELFTEST_VECTOR_COUNT];
 * It is omitted here because a zero-length array is not valid C. */
#define AI_SELFTEST_VECTOR_COUNT 0
