// C++20 / Windows native DLL / target: Animal Company (Unity IL2CPP)
#pragma once

#include <filesystem>
#include <shared_mutex>
#include <string>

namespace ns {

// Everything the menu binds to and the hooks read. One struct, one lock -
// simpler and faster than per-field atomics for a config this size, and the
// UI only ever reads/writes it once per frame, not per-hook-call.
struct ModConfig {
    // Player
    bool godMode = false;
    bool infiniteStamina = false;
    bool noFallDamage = false;
    bool speedHack = false;
    float speedMultiplier = 2.5f;
    bool noClip = false;
    float noClipSpeed = 12.0f;

    // Visuals / ESP
    bool enemyEsp = false;
    bool itemEsp = false;
    bool playerEsp = false;
    float espMaxDistance = 150.0f;
    float fovOverrideDeg = 0.0f;  // 0 = unmodified
    float lightIntensityMultiplier = 1.0f;

    // World
    bool interactRangeOverride = false;
    float interactRange = 10.0f;

    // UI
    bool menuOpen = false;
    float windowPosX = 40.0f;
    float windowPosY = 40.0f;
    int colorTheme = 0;  // index into menu.cpp's theme table

    // Keybinds (virtual-key codes)
    int keyToggleMenu = 0x2D;  // VK_INSERT
    int keyPanicUnload = 0x23;  // VK_END
};

namespace paths {
// C:\AnimalCompany_Mods\ and its subfolders. Created on first access if
// missing.
std::filesystem::path Root();
std::filesystem::path Configs();
std::filesystem::path Dumps();
std::filesystem::path Logs();
void EnsureAll();
}  // namespace paths

// Thread-safe holder for the live ModConfig plus load/save to JSON.
// Hooks call Get() (returns a copy - cheap, these are all scalars) on their
// own thread; the UI calls Mutate() once per frame inside a single lock to
// batch all of that frame's widget writes together.
class ConfigManager {
public:
    static ConfigManager& Instance();

    ModConfig Get() const;

    template <typename Fn>
    void Mutate(Fn&& fn) {
        std::unique_lock lock(m_mutex);
        fn(m_config);
    }

    // Loads from <configs>/<name>.json, falling back to defaults (and
    // logging, not throwing) if the file is missing or malformed.
    bool Load(const std::string& name = "nosignal_config");
    bool Save(const std::string& name = "nosignal_config") const;

private:
    ConfigManager() = default;
    mutable std::shared_mutex m_mutex;
    ModConfig m_config;
};

}  // namespace ns
