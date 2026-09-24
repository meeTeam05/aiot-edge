set(srcs
    "ai.c"
    "ai_input.c"
)
set(embed_files "")

# The TFLite Micro wrapper and the embedded model are only built when the
# feature is enabled; ai.c provides no-op stubs otherwise.
if(CONFIG_SA_ENABLE_AI)
    list(APPEND srcs "ai_inference.cpp")
    list(APPEND embed_files "model/model_beijing_freeze_int8.tflite")
endif()

idf_component_register(
    SRCS
        ${srcs}
    INCLUDE_DIRS
        "include"
    REQUIRES
        esp_common
    PRIV_REQUIRES
        buzzer
        config
        esp_timer
        freertos
        heap
        json
        sa_mqtt
    EMBED_FILES
        ${embed_files}
)

# esp-tflite-micro is declared in idf_component.yml; the component manager
# adds it to this component's requirements automatically.
