// C++20 / Windows native DLL / target: Animal Company (Unity IL2CPP, PC VR)
//
// Entry point for the version.dll proxy (see version_exports.def - every
// real version.dll export forwards to version_orig.dll, so the game never
// notices its version.dll was swapped). DllMain itself does nothing but spin
// up MainThread and return immediately: the loader lock is held for the
// whole duration of DllMain, and anything that touches other DLLs, the
// filesystem, or creates further threads/synchronization objects while
// holding it can deadlock against the OS loader. MainThread runs entirely
// outside that lock.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include "config.h"
#include "logger.h"

namespace {

HMODULE g_selfModule = nullptr;
HANDLE g_mainThread = nullptr;
HANDLE g_panicWatcherThread = nullptr;
volatile LONG g_shuttingDown = 0;

void RunPanicWatcher() {
    // Polls rather than a low-level keyboard hook: a hook adds latency to
    // every keystroke in the game for the sake of catching one combo,
    // polling at 50ms is imperceptible and more than fast enough for an
    // emergency unload key.
    for (;;) {
        if (InterlockedCompareExchange(&g_shuttingDown, 0, 0) != 0) {
            return;
        }

        int panicKey = ns::ConfigManager::Instance().Get().keyPanicUnload;
        if (GetAsyncKeyState(panicKey) & 0x8000) {
            NS_LOG_WARN("Panic key pressed - unloading");
            if (InterlockedExchange(&g_shuttingDown, 1) == 0) {
                ns::ConfigManager::Instance().Save();
                NS_LOG_INFO("Config saved, cleaning up");
                ns::Logger::Instance().Shutdown();
                FreeLibraryAndExitThread(g_selfModule, 0);
                // unreachable - FreeLibraryAndExitThread does not return
            }
            return;
        }

        Sleep(50);
    }
}

DWORD WINAPI MainThread(LPVOID) {
    ns::paths::EnsureAll();
    ns::Logger::Instance().Init((ns::paths::Logs() / "nosignal.log").wstring());

    NS_LOG_INFO("========================================");
    NS_LOG_INFO("  No Signal - Animal Company mod core");
    NS_LOG_INFO("========================================");

    ns::ConfigManager::Instance().Load();
    NS_LOG_INFO("Config ready. Mods root: {}", ns::paths::Root().string());

    g_panicWatcherThread = CreateThread(
        nullptr, 0,
        [](LPVOID) -> DWORD { RunPanicWatcher(); return 0; },
        nullptr, 0, nullptr);
    if (g_panicWatcherThread) {
        NS_LOG_INFO("Panic-key watcher running (VK=0x{:02X})",
                     ns::ConfigManager::Instance().Get().keyPanicUnload);
    } else {
        NS_LOG_ERROR("Could not start panic-key watcher thread");
    }

    // Hook manager / IL2CPP dumper / ImGui+OpenXR overlay init go here,
    // called in that order - module base resolution and the dumper need to
    // run before any hook installs, and the overlay's swapchain hook needs
    // the game's own D3D device to exist first. Next build slice.

    NS_LOG_INFO("Initialization complete");
    return 0;
}

}  // namespace

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID) {
    switch (reason) {
        case DLL_PROCESS_ATTACH: {
            g_selfModule = hModule;
            DisableThreadLibraryCalls(hModule);
            g_mainThread = CreateThread(nullptr, 0,
                                         [](LPVOID) -> DWORD { return MainThread(nullptr); },
                                         nullptr, 0, nullptr);
            break;
        }
        case DLL_PROCESS_DETACH: {
            InterlockedExchange(&g_shuttingDown, 1);
            // Safety net if the process is exiting without the panic key
            // having been pressed - make sure the config is on disk and the
            // log file handle is closed cleanly rather than left dangling.
            ns::ConfigManager::Instance().Save();
            ns::Logger::Instance().Shutdown();
            break;
        }
        default:
            break;
    }
    return TRUE;
}
