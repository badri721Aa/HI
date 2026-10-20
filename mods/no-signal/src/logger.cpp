// C++20 / Windows native DLL / target: Animal Company (Unity IL2CPP)
#include "logger.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <chrono>
#include <cstdio>
#include <filesystem>
#include <iostream>

namespace ns {

namespace {

const char* LevelTag(LogLevel level) {
    switch (level) {
        case LogLevel::Trace: return "TRACE";
        case LogLevel::Info:  return "INFO ";
        case LogLevel::Warn:  return "WARN ";
        case LogLevel::Error: return "ERROR";
        case LogLevel::Fatal: return "FATAL";
    }
    return "?????";
}

// ANSI color codes - the console is put into virtual-terminal-processing
// mode in Init() so these render as actual colors, not escape-code noise.
const char* LevelColor(LogLevel level) {
    switch (level) {
        case LogLevel::Trace: return "\x1b[90m";  // gray
        case LogLevel::Info:  return "\x1b[97m";  // white
        case LogLevel::Warn:  return "\x1b[93m";  // yellow
        case LogLevel::Error: return "\x1b[91m";  // red
        case LogLevel::Fatal: return "\x1b[97;41m";  // white on red
    }
    return "\x1b[0m";
}
constexpr const char* kReset = "\x1b[0m";

std::string Timestamp() {
    using namespace std::chrono;
    auto now = system_clock::now();
    auto ms = duration_cast<milliseconds>(now.time_since_epoch()) % 1000;
    std::time_t t = system_clock::to_time_t(now);
    std::tm tm{};
    localtime_s(&tm, &t);
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%02d:%02d:%02d.%03lld", tm.tm_hour, tm.tm_min, tm.tm_sec,
                  static_cast<long long>(ms.count()));
    return buf;
}

}  // namespace

Logger& Logger::Instance() {
    static Logger instance;
    return instance;
}

void Logger::Init(const std::wstring& logFilePath) {
    std::lock_guard lock(m_mutex);

    if (!m_consoleAllocated) {
        AllocConsole();
        FILE* dummy = nullptr;
        freopen_s(&dummy, "CONOUT$", "w", stdout);
        freopen_s(&dummy, "CONOUT$", "w", stderr);
        SetConsoleTitleW(L"No Signal");

        // Enable ANSI escape sequence processing so LevelColor() actually colors output.
        HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
        DWORD mode = 0;
        if (GetConsoleMode(hOut, &mode)) {
            SetConsoleMode(hOut, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
        }
        m_consoleAllocated = true;
    }

    std::filesystem::path path(logFilePath);
    std::error_code ec;
    std::filesystem::create_directories(path.parent_path(), ec);

    HANDLE file = CreateFileW(logFilePath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr,
                               OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    m_fileHandle = (file == INVALID_HANDLE_VALUE) ? nullptr : file;
}

void Logger::Shutdown() {
    std::lock_guard lock(m_mutex);
    if (m_fileHandle) {
        CloseHandle(static_cast<HANDLE>(m_fileHandle));
        m_fileHandle = nullptr;
    }
    if (m_consoleAllocated) {
        FreeConsole();
        m_consoleAllocated = false;
    }
}

void Logger::Log(LogLevel level, std::string_view message, std::source_location loc) {
    std::filesystem::path file(loc.file_name());
    std::string line = std::format("[{}] [{}] {}:{} - {}", Timestamp(), LevelTag(level),
                                     file.filename().string(), loc.line(), message);

    std::lock_guard lock(m_mutex);

    std::printf("%s%s%s\n", LevelColor(level), line.c_str(), kReset);

    if (m_fileHandle) {
        std::string fileLine = line + "\r\n";
        DWORD written = 0;
        WriteFile(static_cast<HANDLE>(m_fileHandle), fileLine.data(),
                   static_cast<DWORD>(fileLine.size()), &written, nullptr);
        FlushFileBuffers(static_cast<HANDLE>(m_fileHandle));
    }

    m_buffer.push_back(std::move(line));
    while (m_buffer.size() > m_maxLines) {
        m_buffer.pop_front();
    }
}

std::deque<std::string> Logger::Snapshot() const {
    std::lock_guard lock(m_mutex);
    return m_buffer;
}

}  // namespace ns
