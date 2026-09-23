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

# esp-tflite-micro ships its own CMake target; depending on the exact
# component-manager version this may register as "tflite-lib" or
# "esp-tflite-micro" -- verify the exact target name once `idf.py build`
# has pulled the dependency (declared in idf_component.yml) and adjust this
# line if the build fails with "target not found".
target_link_libraries(${COMPONENT_LIB} PRIVATE tflite-lib)
