cmake_minimum_required(VERSION 3.21)
project(NoSignal LANGUAGES CXX)

if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "NoSignal targets x64 only")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/MP /W4 /permissive- /Zc:__cplusplus)
    add_compile_options("$<$<CONFIG:Release>:/O2>" "$<$<CONFIG:Release>:/GL>" "$<$<CONFIG:Release>:/Gy>")
    add_link_options("$<$<CONFIG:Release>:/LTCG>")
endif()

include(FetchContent)

# ---------------------------------------------------------------------------
# MinHook - inline hooking engine
# ---------------------------------------------------------------------------
FetchContent_Declare(
    minhook
    GIT_REPOSITORY https://github.com/TsudaKageyu/minhook.git
    GIT_TAG v1.3.3
)
FetchContent_MakeAvailable(minhook)

# ---------------------------------------------------------------------------
# Dear ImGui - overlay UI (docking branch, for the multi-pane layout)
# ---------------------------------------------------------------------------
FetchContent_Declare(
    imgui
    GIT_REPOSITORY https://github.com/ocornut/imgui.git
    GIT_TAG docking
)
FetchContent_MakeAvailable(imgui)

add_library(imgui STATIC
    ${imgui_SOURCE_DIR}/imgui.cpp
    ${imgui_SOURCE_DIR}/imgui_draw.cpp
    ${imgui_SOURCE_DIR}/imgui_widgets.cpp
    ${imgui_SOURCE_DIR}/imgui_tables.cpp
    ${imgui_SOURCE_DIR}/imgui_demo.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_win32.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_dx11.cpp
)
target_include_directories(imgui PUBLIC
    ${imgui_SOURCE_DIR}
    ${imgui_SOURCE_DIR}/backends
)

# ---------------------------------------------------------------------------
# OpenXR loader - VR swapchain/session interop
# ---------------------------------------------------------------------------
FetchContent_Declare(
    openxr
    GIT_REPOSITORY https://github.com/KhronosGroup/OpenXR-SDK.git
    GIT_TAG release-1.1.42
)
FetchContent_MakeAvailable(openxr)

# ---------------------------------------------------------------------------
# nlohmann/json - config persistence
# ---------------------------------------------------------------------------
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# ---------------------------------------------------------------------------
# NoSignal core - built as version.dll (proxy loader)
# ---------------------------------------------------------------------------
add_library(NoSignal SHARED
    src/dllmain.cpp
    src/logger.cpp
    src/config.cpp
)

target_include_directories(NoSignal PRIVATE src)

target_link_libraries(NoSignal PRIVATE
    minhook
    imgui
    openxr_loader
    nlohmann_json::nlohmann_json
    d3d11
    dxgi
    dwmapi
)

set_target_properties(NoSignal PROPERTIES
    OUTPUT_NAME "version"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/dist"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_BINARY_DIR}/dist"
)

target_compile_definitions(NoSignal PRIVATE
    UNICODE _UNICODE
    WIN32_LEAN_AND_MEAN NOMINMAX
    $<$<CONFIG:Debug>:NOSIGNAL_DEBUG>
)

# version.dll export forwarding - see src/version_exports.def
target_sources(NoSignal PRIVATE src/version_exports.def)

# Drop the real system version.dll alongside ours, renamed, so our proxy's
# forwarder exports (see version_exports.def) resolve against it at load
# time. Only copies it if it's not already there, so re-running a build
# doesn't clobber it.
add_custom_command(TARGET NoSignal POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/dist"
    COMMAND if not exist "${CMAKE_BINARY_DIR}/dist/version_orig.dll"
            ${CMAKE_COMMAND} -E copy "$ENV{WINDIR}/System32/version.dll" "${CMAKE_BINARY_DIR}/dist/version_orig.dll"
    COMMENT "Staging original version.dll as version_orig.dll for export forwarding"
)
