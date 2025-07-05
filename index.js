import { Client, GatewayIntentBits, Collection } from "discord.js"
import dotenv from "dotenv"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { logger } from "./utils/logger.js"
import { CONFIG } from "./config.js"

// Load environment variables
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Log startup information
logger.info(`Starting Donor Rewards Bot v${CONFIG.BOT_VERSION}`)
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
})

// Initialize collections
client.commands = new Collection()
client.events = new Collection()
client.cooldowns = new Collection()

// Ensure data directory exists
if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true })
  logger.info(`Created data directory at ${CONFIG.DATA_DIR}`)
}

// Load events
logger.info("Loading event handlers...")
const eventsPath = path.join(__dirname, "events")
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"))
  logger.info(`Found ${eventFiles.length} event files`)

  for (const file of eventFiles) {
    try {
      const filePath = path.join(eventsPath, file)
      const event = await import(`file://${filePath}`)

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args))
      } else {
        client.on(event.name, (...args) => event.execute(...args))
      }

      logger.info(`Loaded event: ${event.name}`)
    } catch (error) {
      logger.error(`Error loading event ${file}:`, error)
    }
  }
}

// Load commands
async function loadCommands(dir, collection = client.commands) {
  const items = fs.readdirSync(dir)

  for (const item of items) {
    const itemPath = path.join(dir, item)
    const stat = fs.statSync(itemPath)

    if (stat.isDirectory()) {
      await loadCommands(itemPath, collection)
    } else if (item.endsWith(".js")) {
      try {
        const command = await import(`file://${itemPath}`)

        if (command.data && command.execute) {
          collection.set(command.data.name, command)
          logger.info(`Loaded command: ${command.data.name}`)
        } else {
          logger.warn(`Invalid command file: ${item}`)
        }
      } catch (error) {
        logger.error(`Error loading command ${item}:`, error)
      }
    }
  }
}

// Load all commands
logger.info("Loading commands...")
const commandsPath = path.join(__dirname, "commands")
if (fs.existsSync(commandsPath)) {
  await loadCommands(commandsPath)
  logger.info(`Loaded ${client.commands.size} commands`)
} else {
  logger.warn("Commands directory not found!")
}

// Validate configuration
if (!process.env.BOT_TOKEN) {
  logger.error("BOT_TOKEN is not set in environment variables or .env file")
  process.exit(1)
}

if (!CONFIG.SERVER_IDS || CONFIG.SERVER_IDS.length === 0) {
  logger.warn("No SERVER_IDS configured. Bot will not process server-specific commands.")
}

// Login to Discord
logger.info("Connecting to Discord...")
client
  .login(process.env.BOT_TOKEN)
  .then(() => {
    logger.info(`Bot logged in as ${client.user.tag}`)
    logger.info("Bot startup complete")
  })
  .catch((error) => {
    logger.error("Failed to login:", error)
    process.exit(1)
  })

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection:", error)
})

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error)
  process.exit(1)
})

// Handle SIGINT (Ctrl+C)
process.on("SIGINT", () => {
  logger.info("Received SIGINT signal. Shutting down gracefully...")
  client.destroy()
  process.exit(0)
})

// Handle SIGTERM
process.on("SIGTERM", () => {
  logger.info("Received SIGTERM signal. Shutting down gracefully...")
  client.destroy()
  process.exit(0)
})
