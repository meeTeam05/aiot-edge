idf_component_register(
    SRCS
        "src/ai_inference.cpp"
    INCLUDE_DIRS
        "include"
    REQUIRES
        ai_input
    EMBED_FILES
        "model/model_beijing_freeze_int8.tflite"
        "model/model_beijing_nofreeze_int8.tflite"
)

# esp-tflite-micro is declared in idf_component.yml; the component manager
# adds it to this component's requirements automatically, so no explicit
# target_link_libraries() is needed.
