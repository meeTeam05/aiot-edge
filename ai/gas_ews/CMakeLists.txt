idf_component_register(
    SRCS
        "src/gas_ews.c"
        "src/gas_ews_model.cpp"
    INCLUDE_DIRS
        "include"
    PRIV_INCLUDE_DIRS
        "src"
    PRIV_REQUIRES
        freertos
    EMBED_FILES
        "model/gas_ews_int8.tflite"
)

# esp-tflite-micro comes from idf_component.yml (component manager adds it
# to this component's requirements automatically).
