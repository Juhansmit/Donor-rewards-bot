import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.join(__dirname, "..", "logs")

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
}

class Logger {
  constructor() {
    // Set default log level based on environment
    this.level = process.env.LOG_LEVEL 
      ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
      : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG)
    
    // Create log files
    this.logFile = path.join(LOG_DIR, `bot-${new Date().toISOString().split("T")[0]}.log`)
    this.errorLogFile = path.join(LOG_DIR, "error.log")
    
    // Log startup information
    this.info(`Logger initialized with level: ${Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === this.level)}`)
  }

  log(level, message, data = null) {
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'INFO'
    const timestamp = new Date().toISOString()
    
    // Format data for logging
    let dataStr = ''
    if (data) {
      if (data instanceof Error) {
        dataStr = ` | Error: ${data.message}\n${data.stack || ''}`
      } else if (typeof data === 'object') {
        try {
          dataStr = ` | Data: ${JSON.stringify(data)}`
        } catch (e) {
          dataStr = ` | Data: [Object that couldn't be stringified]`
        }
      } else {
        dataStr = ` | Data: ${data}`
      }
    }
    
    const logEntry = `[${timestamp}] [${levelName}] ${message}${dataStr}`

    // Console output with appropriate emoji
    const emoji = level === LOG_LEVELS.ERROR ? "❌" : 
                 level === LOG_LEVELS.WARN ? "⚠️" : 
                 level === LOG_LEVELS.DEBUG ? "🔍" : 
                 level === LOG_LEVELS.TRACE ? "🔬" : "ℹ️"
    
    // Only log to console if level is less than or equal to configured level
    if (level <= this.level) {
      console.log(`${emoji} ${message}`)
      
      // Log data to console if present
      if (data && level <= LOG_LEVELS.DEBUG) {
        if (data instanceof Error) {
          console.error(data)
        } else if (typeof data === 'object') {
          console.dir(data, { depth: 3 })
        }
      }
    }

    // File output
    try {
      fs.appendFileSync(this.logFile, logEntry + "\n")
      
      // Also log errors to error log file
      if (level === LOG_LEVELS.ERROR) {
        fs.appendFileSync(this.errorLogFile, logEntry + "\n")
      }
    } catch (error) {
      console.error("Failed to write to log file:", error)
    }
  }

  error(message, data = null) {
    this.log(LOG_LEVELS.ERROR, message, data)
  }

  warn(message, data = null) {
    this.log(LOG_LEVELS.WARN, message, data)
  }

  info(message, data = null) {
    this.log(LOG_LEVELS.INFO, message, data)
  }

  debug(message, data = null) {
    this.log(LOG_LEVELS.DEBUG, message, data)
  }

  trace(message, data = null) {
    this.log(LOG_LEVELS.TRACE, message, data)
  }
  
  // For backward compatibility
  logError(message, data = null) {
    this.error(message, data)
  }
}

// Create and export a singleton logger instance
export const logger = new Logger()

// For backward compatibility
export const info = (message, data = null) => logger.info(message, data)
export const logError = (message, data = null) => logger.error(message, data)
export const warn = (message, data = null) => logger.warn(message, data)
export const debug = (message, data = null) => logger.debug(message, data)
