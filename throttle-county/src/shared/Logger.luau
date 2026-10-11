--!strict
-- Logger: scoped, level-filtered, repeat-suppressing output. -- spec [32]
-- Format: [TC][S][Scope][LEVEL] message   (S = server, C = client)

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local DEBUG = 10
local INFO = 20
local WARN = 30
local ERROR = 40

local REPEAT_LIMIT = 5
local REPEAT_WINDOW_S = 10
local MAX_TRACKED_MESSAGES = 512

local SIDE = if RunService:IsServer() then "S" else "C"
local IS_STUDIO = RunService:IsStudio()

export type ScopedLogger = {
	Scope: string,
	ErrorCount: number,
	Debug: (self: ScopedLogger, fmt: string, ...any) -> (),
	Info: (self: ScopedLogger, fmt: string, ...any) -> (),
	Warn: (self: ScopedLogger, fmt: string, ...any) -> (),
	Error: (self: ScopedLogger, fmt: string, ...any) -> (),
	WarnOnce: (self: ScopedLogger, key: string, fmt: string, ...any) -> (),
	InfoOnce: (self: ScopedLogger, key: string, fmt: string, ...any) -> (),
}

type RepeatEntry = { Start: number, Count: number, Suppressed: number }

local Logger = {
	DEBUG = DEBUG,
	INFO = INFO,
	WARN = WARN,
	ERROR = ERROR,
	-- live clients log WARN and above; Studio logs DEBUG and above
	MinLevel = if IS_STUDIO then DEBUG elseif SIDE == "S" then INFO else WARN,
	TotalErrors = 0,
}

local repeats: { [string]: RepeatEntry } = {}
local trackedCount = 0
local onceKeys: { [string]: boolean } = {}

local LEVEL_NAMES: { [number]: string } = {
	[DEBUG] = "DEBUG",
	[INFO] = "INFO",
	[WARN] = "WARN",
	[ERROR] = "ERROR",
}

local function refreshDebugFlag()
	local attr = ReplicatedStorage:GetAttribute("DebugLogging")
	if attr == true then
		Logger.MinLevel = DEBUG
	elseif attr == false then
		Logger.MinLevel = if SIDE == "S" then INFO else WARN
	end
end

local function emit(level: number, text: string)
	if level >= WARN then
		warn(text)
	else
		print(text)
	end
end

-- returns false when the message should be suppressed as a repeat
local function passRepeatFilter(level: number, key: string, line: string): boolean
	local now = os.clock()
	local entry = repeats[key]
	if entry == nil then
		if trackedCount >= MAX_TRACKED_MESSAGES then
			table.clear(repeats)
			trackedCount = 0
		end
		repeats[key] = { Start = now, Count = 1, Suppressed = 0 }
		trackedCount += 1
		return true
	end
	if now - entry.Start > REPEAT_WINDOW_S then
		if entry.Suppressed > 0 then
			emit(level, string.format("%s (suppressed %d repeats)", line, entry.Suppressed))
		end
		entry.Start = now
		entry.Count = 1
		entry.Suppressed = 0
		return true
	end
	entry.Count += 1
	if entry.Count > REPEAT_LIMIT then
		entry.Suppressed += 1
		return false
	end
	return true
end

local function write(self: ScopedLogger, level: number, fmt: string, ...: any)
	if level < Logger.MinLevel then
		return
	end
	local ok, message = pcall(string.format, fmt, ...)
	if not ok then
		message = fmt .. " <format error: " .. tostring(message) .. ">"
	end
	local line = string.format("[TC][%s][%s][%s] %s", SIDE, self.Scope, LEVEL_NAMES[level], message)
	if not passRepeatFilter(level, line, line) then
		return
	end
	if level >= ERROR then
		self.ErrorCount += 1
		Logger.TotalErrors += 1
		emit(level, line .. "\n" .. debug.traceback("", 3))
	else
		emit(level, line)
	end
end

local function logDebug(self: ScopedLogger, fmt: string, ...: any)
	if DEBUG < Logger.MinLevel then
		return
	end
	write(self, DEBUG, fmt, ...)
end

local function logInfo(self: ScopedLogger, fmt: string, ...: any)
	if INFO < Logger.MinLevel then
		return
	end
	write(self, INFO, fmt, ...)
end

local function logWarn(self: ScopedLogger, fmt: string, ...: any)
	write(self, WARN, fmt, ...)
end

local function logError(self: ScopedLogger, fmt: string, ...: any)
	write(self, ERROR, fmt, ...)
end

local function logWarnOnce(self: ScopedLogger, key: string, fmt: string, ...: any)
	local fullKey = self.Scope .. "\0W" .. key
	if onceKeys[fullKey] then
		return
	end
	onceKeys[fullKey] = true
	write(self, WARN, fmt, ...)
end

local function logInfoOnce(self: ScopedLogger, key: string, fmt: string, ...: any)
	local fullKey = self.Scope .. "\0I" .. key
	if onceKeys[fullKey] then
		return
	end
	onceKeys[fullKey] = true
	write(self, INFO, fmt, ...)
end

-- returns a logger whose lines carry the given scope name
function Logger.new(scope: string): ScopedLogger
	local logger: ScopedLogger = {
		Scope = scope,
		ErrorCount = 0,
		Debug = logDebug,
		Info = logInfo,
		Warn = logWarn,
		Error = logError,
		WarnOnce = logWarnOnce,
		InfoOnce = logInfoOnce,
	}
	return logger
end

refreshDebugFlag()
-- lifetime: server/client session (module-level, never cleaned)
ReplicatedStorage:GetAttributeChangedSignal("DebugLogging"):Connect(refreshDebugFlag)

return Logger
