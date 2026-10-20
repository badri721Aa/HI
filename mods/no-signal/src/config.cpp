// C++20 / Windows native DLL / target: Animal Company (Unity IL2CPP)
#include "config.h"

#include <fstream>
#include <nlohmann/json.hpp>

#include "logger.h"

using json = nlohmann::json;

namespace ns {

// Intrusive to_json/from_json - keeps the field list in config.h as the
// single source of truth; this just mirrors it for serialization.
void to_json(json& j, const ModConfig& c) {
    j = json{
        {"godMode", c.godMode},
        {"infiniteStamina", c.infiniteStamina},
        {"noFallDamage", c.noFallDamage},
        {"speedHack", c.speedHack},
        {"speedMultiplier", c.speedMultiplier},
        {"noClip", c.noClip},
        {"noClipSpeed", c.noClipSpeed},
        {"enemyEsp", c.enemyEsp},
        {"itemEsp", c.itemEsp},
        {"playerEsp", c.playerEsp},
        {"espMaxDistance", c.espMaxDistance},
        {"fovOverrideDeg", c.fovOverrideDeg},
        {"lightIntensityMultiplier", c.lightIntensityMultiplier},
        {"interactRangeOverride", c.interactRangeOverride},
        {"interactRange", c.interactRange},
        {"menuOpen", c.menuOpen},
        {"windowPosX", c.windowPosX},
        {"windowPosY", c.windowPosY},
        {"colorTheme", c.colorTheme},
        {"keyToggleMenu", c.keyToggleMenu},
        {"keyPanicUnload", c.keyPanicUnload},
    };
}

// Every field reads via value(key, default) so an old config missing a
// newly-added field just falls back to that field's default instead of
// throwing or zeroing the rest of the struct.
void from_json(const json& j, ModConfig& c) {
    ModConfig d;  // defaults to pull from
    c.godMode = j.value("godMode", d.godMode);
    c.infiniteStamina = j.value("infiniteStamina", d.infiniteStamina);
    c.noFallDamage = j.value("noFallDamage", d.noFallDamage);
    c.speedHack = j.value("speedHack", d.speedHack);
    c.speedMultiplier = j.value("speedMultiplier", d.speedMultiplier);
    c.noClip = j.value("noClip", d.noClip);
    c.noClipSpeed = j.value("noClipSpeed", d.noClipSpeed);
    c.enemyEsp = j.value("enemyEsp", d.enemyEsp);
    c.itemEsp = j.value("itemEsp", d.itemEsp);
    c.playerEsp = j.value("playerEsp", d.playerEsp);
    c.espMaxDistance = j.value("espMaxDistance", d.espMaxDistance);
    c.fovOverrideDeg = j.value("fovOverrideDeg", d.fovOverrideDeg);
    c.lightIntensityMultiplier = j.value("lightIntensityMultiplier", d.lightIntensityMultiplier);
    c.interactRangeOverride = j.value("interactRangeOverride", d.interactRangeOverride);
    c.interactRange = j.value("interactRange", d.interactRange);
    c.menuOpen = j.value("menuOpen", d.menuOpen);
    c.windowPosX = j.value("windowPosX", d.windowPosX);
    c.windowPosY = j.value("windowPosY", d.windowPosY);
    c.colorTheme = j.value("colorTheme", d.colorTheme);
    c.keyToggleMenu = j.value("keyToggleMenu", d.keyToggleMenu);
    c.keyPanicUnload = j.value("keyPanicUnload", d.keyPanicUnload);
}

namespace paths {

std::filesystem::path Root() { return "C:\\AnimalCompany_Mods\\"; }
std::filesystem::path Configs() { return Root() / "configs"; }
std::filesystem::path Dumps() { return Root() / "dumps"; }
std::filesystem::path Logs() { return Root() / "logs"; }

void EnsureAll() {
    std::error_code ec;
    for (auto& p : {Root(), Configs(), Dumps(), Logs()}) {
        std::filesystem::create_directories(p, ec);
        if (ec) {
            NS_LOG_ERROR("Could not create {}: {}", p.string(), ec.message());
            ec.clear();
        }
    }
}

}  // namespace paths

ConfigManager& ConfigManager::Instance() {
    static ConfigManager instance;
    return instance;
}

ModConfig ConfigManager::Get() const {
    std::shared_lock lock(m_mutex);
    return m_config;
}

bool ConfigManager::Load(const std::string& name) {
    auto path = paths::Configs() / (name + ".json");
    std::ifstream in(path);
    if (!in.is_open()) {
        NS_LOG_INFO("No config at {}, using defaults", path.string());
        return false;
    }

    try {
        json j;
        in >> j;
        ModConfig loaded = j.get<ModConfig>();
        std::unique_lock lock(m_mutex);
        m_config = loaded;
        NS_LOG_INFO("Loaded config from {}", path.string());
        return true;
    } catch (const json::exception& e) {
        NS_LOG_ERROR("Config at {} is malformed ({}), using defaults", path.string(), e.what());
        return false;
    }
}

bool ConfigManager::Save(const std::string& name) const {
    paths::EnsureAll();
    auto path = paths::Configs() / (name + ".json");

    json j;
    {
        std::shared_lock lock(m_mutex);
        j = m_config;
    }

    std::ofstream out(path, std::ios::trunc);
    if (!out.is_open()) {
        NS_LOG_ERROR("Could not open {} for writing", path.string());
        return false;
    }
    out << j.dump(4);
    NS_LOG_INFO("Saved config to {}", path.string());
    return true;
}

}  // namespace ns
