// C++20 / Windows native DLL / target: Animal Company (Unity IL2CPP)
#pragma once

#include <deque>
#include <format>
#include <mutex>
#include <source_location>
#include <string>
#include <string_view>

namespace ns {

enum class LogLevel { Trace, Info, Warn, Error, Fatal };

// Thread-safe console + file + in-memory ring buffer logger. The ring
// buffer is what the menu's debug tab reads from to render the live
// scrolling log console - logging and the UI never touch the same storage
// directly, just this buffer's thread-safe snapshot.
class Logger {
public:
    static Logger& Instance();

    // Allocates a console window (colored output) and opens the log file at
    // <mods_root>/logs/nosignal.log. Safe to call once, off the loader
    // thread (see MainThread in dllmain.cpp).
    void Init(const std::wstring& logFilePath);
    void Shutdown();

    void Log(LogLevel level, std::string_view message,
              std::source_location loc = std::source_location::current());

    template <typename... Args>
    void LogF(LogLevel level, std::source_location loc, std::format_string<Args...> fmt, Args&&... args) {
        Log(level, std::format(fmt, std::forward<Args>(args)...), loc);
    }

    // Returns a copy of the current buffer contents (newest last). Copying
    // is intentional - the UI thread must never hold the logger's mutex
    // while ImGui renders, or a log call from a hook thread mid-frame would
    // deadlock the render loop.
    std::deque<std::string> Snapshot() const;

    void SetMaxBufferLines(size_t n) { m_maxLines = n; }

private:
    Logger() = default;

    mutable std::mutex m_mutex;
    std::deque<std::string> m_buffer;
    size_t m_maxLines = 2000;

    void* m_fileHandle = nullptr;  // HANDLE, opaque here to keep <windows.h> out of this header
    bool m_consoleAllocated = false;
};

}  // namespace ns

// Convenience macros - capture source_location at the call site automatically.
#define NS_LOG_TRACE(...) ::ns::Logger::Instance().LogF(::ns::LogLevel::Trace, std::source_location::current(), __VA_ARGS__)
#define NS_LOG_INFO(...)  ::ns::Logger::Instance().LogF(::ns::LogLevel::Info,  std::source_location::current(), __VA_ARGS__)
#define NS_LOG_WARN(...)  ::ns::Logger::Instance().LogF(::ns::LogLevel::Warn,  std::source_location::current(), __VA_ARGS__)
#define NS_LOG_ERROR(...) ::ns::Logger::Instance().LogF(::ns::LogLevel::Error, std::source_location::current(), __VA_ARGS__)
#define NS_LOG_FATAL(...) ::ns::Logger::Instance().LogF(::ns::LogLevel::Fatal, std::source_location::current(), __VA_ARGS__)
